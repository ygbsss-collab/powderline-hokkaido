-- Apply after 20261119055204_add_party_sos_and_push_delivery.sql.
-- Seven approved notification types only. Business mutations remain in existing RPCs.
create table public.fcm_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'party_invited', 'party_joined', 'party_left', 'party_disbanded',
    'party_kicked', 'signup_requested', 'account_suspended'
  )),
  event_key text not null,
  recipient_id uuid references public.profiles(id) on delete set null,
  party_id uuid references public.parties(id),
  title text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (event_type, event_key, recipient_id)
);
create index fcm_notification_outbox_pending_idx
  on public.fcm_notification_outbox (status, created_at)
  where status in ('pending', 'failed', 'processing');
alter table public.fcm_notification_outbox enable row level security;
revoke all on public.fcm_notification_outbox from public, anon, authenticated;
grant select, insert, update on public.fcm_notification_outbox to service_role;

create table public.fcm_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.fcm_notification_outbox(id),
  push_device_id uuid references public.push_devices(id) on delete set null,
  status text not null check (status in ('sent', 'failed')),
  response_code integer,
  error_message text,
  attempted_at timestamptz not null default now(),
  unique (outbox_id, push_device_id)
);
alter table public.fcm_notification_deliveries enable row level security;
revoke all on public.fcm_notification_deliveries from public, anon, authenticated;
grant select, insert, update on public.fcm_notification_deliveries to service_role;

create function party_private.enqueue_fcm_notification(
  p_type text, p_key text, p_recipient uuid, p_party uuid,
  p_title text, p_body text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null then return; end if;
  insert into public.fcm_notification_outbox
    (event_type, event_key, recipient_id, party_id, title, body)
  values (p_type, p_key, p_recipient, p_party, p_title, p_body)
  on conflict (event_type, event_key, recipient_id) do nothing;
end;
$$;
revoke execute on function party_private.enqueue_fcm_notification(text,text,uuid,uuid,text,text)
  from public, anon, authenticated;

create function party_private.queue_party_invitation_fcm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_party_name text;
begin
  if new.status <> 'pending' then return new; end if;
  select name into v_party_name from public.parties where id = new.party_id;
  perform party_private.enqueue_fcm_notification(
    'party_invited', new.id::text, new.invitee_id, new.party_id,
    'POWDERLINE 파티 초대', coalesce(v_party_name, '파티') || '에 초대받았습니다.'
  );
  return new;
end;
$$;
create trigger party_invitation_fcm_after_insert
  after insert on public.party_invitations
  for each row execute function party_private.queue_party_invitation_fcm();

create function party_private.queue_party_joined_fcm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_leader uuid; v_name text;
begin
  if old.status <> 'pending' or new.status <> 'accepted' then return new; end if;
  select leader_id into v_leader from public.parties where id = new.party_id;
  select nickname into v_name from public.profiles where id = new.invitee_id;
  perform party_private.enqueue_fcm_notification(
    'party_joined', new.id::text, v_leader, new.party_id,
    'POWDERLINE 파티 입장', coalesce(v_name, '회원') || '님이 초대를 수락하고 입장했습니다.'
  );
  return new;
end;
$$;
create trigger party_joined_fcm_after_update
  after update of status on public.party_invitations
  for each row execute function party_private.queue_party_joined_fcm();

-- Existing disband_party deletes memberships before setting status=disbanded.
-- A deferred trigger observes the final status in the same successful transaction.
create function party_private.queue_party_member_departure_fcm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_party public.parties%rowtype; v_name text; v_key text;
begin
  select * into v_party from public.parties where id = old.party_id;
  if not found then return old; end if;
  v_key := old.party_id::text || ':' || old.user_id::text || ':' || old.joined_at::text;
  if v_party.status = 'disbanded' then
    -- Only the members removed by the disband; the leader who disbanded is never notified.
    if old.user_id = v_party.leader_id then return old; end if;
    perform party_private.enqueue_fcm_notification(
      'party_disbanded', old.party_id::text, old.user_id, old.party_id,
      'POWDERLINE 파티 해산', coalesce(v_party.name, '파티') || '가 해산되었습니다.'
    );
  elsif auth.uid() = old.user_id then
    select nickname into v_name from public.profiles where id = old.user_id;
    perform party_private.enqueue_fcm_notification(
      'party_left', v_key, v_party.leader_id, old.party_id,
      'POWDERLINE 파티원 탈퇴', coalesce(v_name, '파티원') || '님이 자발적으로 탈퇴했습니다.'
    );
  elsif auth.uid() = v_party.leader_id and old.user_id <> v_party.leader_id then
    perform party_private.enqueue_fcm_notification(
      'party_kicked', v_key, old.user_id, old.party_id,
      'POWDERLINE 파티 퇴장', coalesce(v_party.name, '파티') || '에서 퇴장 처리되었습니다.'
    );
  end if;
  return old;
end;
$$;
create constraint trigger party_member_departure_fcm_after_delete
  after delete on public.party_members
  deferrable initially deferred
  for each row execute function party_private.queue_party_member_departure_fcm();

-- No existing kick RPC exists in this project. The leader selects the member;
-- the database, never a client supplied push recipient, determines notification target.
create function public.kick_party_member(p_party_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_leader uuid; v_status text;
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  select leader_id, status into v_leader, v_status
  from public.parties where id = p_party_id for update;
  if v_leader is distinct from auth.uid() or v_status is distinct from 'active' then
    raise exception 'Active party leader required' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_leader then
    raise exception 'A different party member is required' using errcode = '22023';
  end if;
  delete from public.party_members
  where party_id = p_party_id and user_id = p_user_id;
  if not found then
    raise exception 'Party member not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.kick_party_member(uuid,uuid) from public, anon;
grant execute on function public.kick_party_member(uuid,uuid) to authenticated;

create function party_private.queue_profile_fcm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_admin record;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      for v_admin in
        select id from public.profiles where role = 'admin' and status = 'approved'
      loop
        perform party_private.enqueue_fcm_notification(
          'signup_requested', new.id::text, v_admin.id, null,
          'POWDERLINE 신규 가입 신청',
          coalesce(new.nickname, '신규 회원') || '님의 가입 신청이 접수되었습니다.'
        );
      end loop;
    end if;
  elsif old.status = 'approved' and new.status = 'rejected'
        and auth.uid() is distinct from new.id then
    perform party_private.enqueue_fcm_notification(
      'account_suspended', new.id::text || ':' || new.updated_at::text,
      new.id, null,
      'POWDERLINE 계정 정지', '관리자에 의해 계정 이용이 정지되었습니다.'
    );
  end if;
  return new;
end;
$$;
create trigger profile_signup_fcm_after_insert
  after insert on public.profiles for each row
  execute function party_private.queue_profile_fcm();
create trigger profile_suspended_fcm_after_update
  after update of status on public.profiles for each row
  execute function party_private.queue_profile_fcm();

-- Atomic claim for the server-only worker. Reclaim a timed-out delivery; cap retries.
create function public.claim_fcm_notification(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.fcm_notification_outbox%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  update public.fcm_notification_outbox
  set status = 'processing', attempts = attempts + 1, locked_at = now()
  where id = p_id and attempts < 3
    and (status in ('pending', 'failed')
      or (status = 'processing' and locked_at < now() - interval '5 minutes'))
  returning * into v_event;
  if not found then return null; end if;
  return to_jsonb(v_event);
end;
$$;
revoke execute on function public.claim_fcm_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_fcm_notification(uuid) to service_role;

revoke execute on function party_private.queue_party_invitation_fcm() from public, anon, authenticated;
revoke execute on function party_private.queue_party_joined_fcm() from public, anon, authenticated;
revoke execute on function party_private.queue_party_member_departure_fcm() from public, anon, authenticated;
revoke execute on function party_private.queue_profile_fcm() from public, anon, authenticated;
