-- REVIEW ONLY / NOT APPLIED. Reuses the original deferred deletion draft.
-- Apply only after approval. Storage blobs are removed via Storage API, never SQL.
-- Each RPC is atomic. Unknown FK/trigger failures roll back all database changes.
begin;
create schema if not exists account_private authorization postgres;
revoke all on schema account_private from public,anon,authenticated,service_role;
create table account_private.deletions (
  request_id uuid primary key, actor_id uuid not null, target_id uuid not null unique,
  kind text not null check(kind in ('self','admin')),
  completed_at timestamptz not null default clock_timestamp(), counts jsonb not null,
  photo_paths text[] not null default '{}',
  cleanup_state text not null check(cleanup_state in ('pending','complete')),
  cleanup_checked_at timestamptz
);
create table account_private.status_changes (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null,target_id uuid not null,
  old_status text not null,new_status text not null,changed_at timestamptz not null default clock_timestamp()
);
alter table account_private.deletions enable row level security;
alter table account_private.status_changes enable row level security;
revoke all on all tables in schema account_private from public,anon,authenticated,service_role;

create function account_private.related_counts(p_target uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'auth_users',(select count(*) from auth.users where id=p_target),
    'profiles',(select count(*) from public.profiles where id=p_target),
    'identities',(select count(*) from auth.identities where user_id=p_target),
    'sessions',(select count(*) from auth.sessions where user_id=p_target),
    'refresh_tokens',(select count(*) from auth.refresh_tokens where user_id=p_target::text),
    'routes',(select count(*) from public.powderline_routes where user_id=p_target),
    'led_parties',(select count(*) from public.parties where leader_id=p_target),
    'memberships',(select count(*) from public.party_members where user_id=p_target),
    'locations',(select count(*) from public.party_members where user_id=p_target
                  and (last_latitude is not null or last_longitude is not null)),
    'invitations',(select count(*) from public.party_invitations where inviter_id=p_target or invitee_id=p_target),
    'sos_events',(select count(*) from public.party_sos_events where requester_id=p_target),
    'push_devices',(select count(*) from public.push_devices where user_id=p_target),
    'photos',(select count(*) from storage.objects where bucket_id='profile-photos'
                and split_part(name,'/',1)=p_target::text)
  );
$$;
create function account_private.delete_account(p_actor uuid,p_target uuid,p_request uuid,p_kind text,p_email text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_old account_private.deletions%rowtype; v_email text; v_role text; v_status text;
        v_counts jsonb; v_photos text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Edge service required' using errcode='42501';
  end if;
  if p_actor is null or p_target is null or p_request is null or p_kind is null or p_kind not in ('self','admin') then
    raise exception 'Invalid deletion request' using errcode='22023';
  end if;
  -- Shared with set_user_status: concurrent requests cannot remove the last administrator.
  perform pg_advisory_xact_lock(hashtextextended('powderline.account-lifecycle',0));
  if p_kind='self' and p_actor is distinct from p_target then
    raise exception 'Own account required' using errcode='42501';
  end if;
  if p_kind='admin' and not exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_actor and p.role='admin' and p.status='approved' and u.deleted_at is null
  ) then raise exception 'Approved administrator required' using errcode='42501'; end if;
  select * into v_old from account_private.deletions where request_id=p_request;
  if not found then select * into v_old from account_private.deletions where target_id=p_target; end if;
  if found then
    if v_old.actor_id is distinct from p_actor or v_old.target_id is distinct from p_target
       or v_old.kind is distinct from p_kind then
      return jsonb_build_object('ok',false,'code','REQUEST_CONFLICT');
    end if;
    return jsonb_build_object('ok',true,'request_id',v_old.request_id,'target_id',v_old.target_id,
      'photo_paths',v_old.photo_paths,'cleanup_pending',v_old.cleanup_state='pending','already_deleted',true);
  end if;
  select email into v_email from auth.users where id=p_target and deleted_at is null for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if p_kind='admin' and (p_email is null or lower(trim(p_email)) is distinct from lower(v_email)) then
    return jsonb_build_object('ok',false,'code','CONFIRM_REQUIRED');
  end if;
  select role,status into v_role,v_status from public.profiles where id=p_target for update;
  if p_kind='admin' and v_status='pending' then
    return jsonb_build_object('ok',false,'code','PENDING_TARGET');
  end if;
  if p_kind='admin' and v_role='admin' then
    return jsonb_build_object('ok',false,'code','ADMIN_TARGET');
  end if;
  if v_role='admin' and (select count(*) from public.profiles where role='admin' and status='approved')<=1 then
    return jsonb_build_object('ok',false,'code','LAST_ADMIN');
  end if;
  -- Short party/course write locks prevent concurrent joins and new route references.
  lock table public.parties,public.party_members,public.party_invitations,public.powderline_routes
    in share row exclusive mode;
  if exists(select 1 from public.parties p join public.party_members m on m.party_id=p.id
            where p.leader_id=p_target and m.user_id<>p_target) then
    return jsonb_build_object('ok',false,'code','PARTY_LEADER');
  end if;
  if exists(select 1 from public.parties p join public.powderline_routes r
            on r.id=p.active_route_id or r.id=any(p.route_ids)
            where r.user_id=p_target and p.leader_id<>p_target) then
    return jsonb_build_object('ok',false,'code','ROUTE_IN_USE');
  end if;
  -- Do not erase another member's historical SOS/notifications in an otherwise empty party.
  if exists(select 1 from public.party_sos_events e join public.parties p on p.id=e.party_id
            where p.leader_id=p_target and e.requester_id is distinct from p_target)
     or exists(select 1 from public.fcm_notification_outbox o join public.parties p on p.id=o.party_id
               where p.leader_id=p_target and o.recipient_id is distinct from p_target) then
    return jsonb_build_object('ok',false,'code','PARTY_HISTORY');
  end if;
  v_counts := account_private.related_counts(p_target);
  select coalesce(array_agg(name order by name),'{}'::text[]) into v_photos from storage.objects
  where bucket_id='profile-photos' and split_part(name,'/',1)=p_target::text;
  delete from public.party_sos_notification_deliveries where recipient_id=p_target
    or sos_event_id in(select id from public.party_sos_events where requester_id=p_target);
  delete from public.party_sos_events where requester_id=p_target;
  delete from public.fcm_notification_deliveries
    where outbox_id in(select id from public.fcm_notification_outbox where recipient_id=p_target);
  delete from public.fcm_notification_outbox where recipient_id=p_target;
  delete from public.party_invitations where inviter_id=p_target or invitee_id=p_target
    or party_id in(select id from public.parties where leader_id=p_target);
  delete from public.party_members where user_id=p_target;
  delete from public.parties where leader_id=p_target;
  delete from public.powderline_routes where user_id=p_target;
  delete from auth.refresh_tokens where user_id=p_target::text;
  delete from auth.users where id=p_target; -- FK cascades: profile, identities, sessions, devices.
  insert into account_private.deletions(request_id,actor_id,target_id,kind,counts,photo_paths,cleanup_state)
    values(p_request,p_actor,p_target,p_kind,v_counts,v_photos,
           case when cardinality(v_photos)=0 then 'complete' else 'pending' end);
  return jsonb_build_object('ok',true,'request_id',p_request,'target_id',p_target,
    'photo_paths',v_photos,'cleanup_pending',cardinality(v_photos)>0);
end;
$$;
-- Only narrowly scoped service RPCs use SECURITY DEFINER. Browser roles have no EXECUTE.
do $$begin
  if to_regprocedure('public.delete_own_account(uuid)') is not null then
    execute 'revoke execute on function public.delete_own_account(uuid) from public,anon,authenticated,service_role';
  end if;
end$$;
create function public.delete_own_account(target_user uuid,actor_user uuid,request_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select account_private.delete_account(actor_user,target_user,request_id,'self',null);
$$;
create function public.admin_delete_account(target_user uuid,actor_user uuid,request_id uuid,confirmation_email text)
returns jsonb language sql security definer set search_path = '' as $$
  select account_private.delete_account(actor_user,target_user,request_id,'admin',confirmation_email);
$$;
create function public.get_account_photo_cleanup(actor_user uuid,request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job account_private.deletions%rowtype; v_paths text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Edge service required' using errcode='42501';
  end if;
  select * into v_job from account_private.deletions d where d.request_id=get_account_photo_cleanup.request_id;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if actor_user is distinct from v_job.actor_id and not exists(
    select 1 from public.profiles where id=actor_user and role='admin' and status='approved'
  ) then raise exception 'Deletion actor or administrator required' using errcode='42501'; end if;
  if exists(select 1 from auth.users where id=v_job.target_id) then
    return jsonb_build_object('ok',false,'code','ACCOUNT_EXISTS');
  end if;
  select coalesce(array_agg(name order by name),'{}'::text[]) into v_paths from storage.objects
    where bucket_id='profile-photos' and split_part(name,'/',1)=v_job.target_id::text;
  return jsonb_build_object('ok',true,'request_id',v_job.request_id,'target_id',v_job.target_id,'photo_paths',v_paths);
end;
$$;
create function public.complete_account_photo_cleanup(actor_user uuid,request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job jsonb; v_pending boolean;
begin
  v_job := public.get_account_photo_cleanup(actor_user,request_id);
  if v_job->>'ok' is distinct from 'true' then return v_job; end if;
  v_pending := jsonb_array_length(v_job->'photo_paths')>0;
  update account_private.deletions d
    set cleanup_state=case when v_pending then 'pending' else 'complete' end,
        cleanup_checked_at=clock_timestamp(),
        photo_paths=case when v_pending then d.photo_paths else '{}'::text[] end
    where d.request_id=complete_account_photo_cleanup.request_id;
  return jsonb_build_object('ok',true,'cleanup_pending',v_pending);
end;
$$;
-- Suspension is reversible; it does not delete an account or kick anyone from a party.
create or replace function public.set_user_status(target_user_id uuid,new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text; v_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended('powderline.account-lifecycle',0));
  if auth.uid() is null or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
      where p.id=auth.uid() and p.role='admin' and p.status='approved' and u.deleted_at is null) then
    raise exception 'Approved administrator required' using errcode='42501';
  end if;
  if new_status is null or new_status not in ('approved','rejected','pending') then
    raise exception 'Invalid status' using errcode='22023';
  end if;
  select status,role into v_old,v_role from public.profiles where id=target_user_id for update;
  if not found then raise exception 'Member not found' using errcode='P0002'; end if;
  if v_role='admin' and v_old='approved' and new_status<>'approved'
     and (select count(*) from public.profiles where role='admin' and status='approved')<=1 then
    raise exception 'Last administrator must remain approved' using errcode='42501';
  end if;
  if v_old=new_status then return; end if;
  update public.profiles set status=new_status,updated_at=now() where id=target_user_id;
  insert into account_private.status_changes(actor_id,target_id,old_status,new_status)
    values(auth.uid(),target_user_id,v_old,new_status);
end;
$$;
revoke execute on all functions in schema account_private from public,anon,authenticated,service_role;
revoke execute on function public.delete_own_account(uuid,uuid,uuid),
  public.admin_delete_account(uuid,uuid,uuid,text),public.get_account_photo_cleanup(uuid,uuid),
  public.complete_account_photo_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_own_account(uuid,uuid,uuid),
  public.admin_delete_account(uuid,uuid,uuid,text),public.get_account_photo_cleanup(uuid,uuid),
  public.complete_account_photo_cleanup(uuid,uuid) to service_role;
revoke execute on function public.set_user_status(uuid,text) from public,anon;
grant execute on function public.set_user_status(uuid,text) to authenticated;
commit;
