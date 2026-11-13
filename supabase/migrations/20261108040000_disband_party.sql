-- Apply after the party invitation, membership visibility, and course management migrations.
-- Keep disbanded parties for history while removing their active memberships.

alter table public.parties
  add column status text not null default 'active';
alter table public.parties
  add constraint parties_status_check check (status in ('active', 'disbanded'));

alter table public.party_invitations
  drop constraint party_invitations_status_check;
alter table public.party_invitations
  add constraint party_invitations_status_check
  check (status in ('pending', 'accepted', 'declined', 'expired'));

-- RLS and route listing already use this helper. A historical membership must
-- never make a disbanded party visible again.
create or replace function party_private.is_party_member(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.party_members pm
    join public.parties p on p.id = pm.party_id
    where pm.party_id = p_party_id
      and pm.user_id = auth.uid()
      and p.status = 'active'
  );
$$;

-- Existing leader RPCs lock parties before writing. These triggers enforce the
-- disbanded state even if an old client calls one of those RPCs afterward.
create function party_private.require_active_party()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select p.status into v_status
  from public.parties p
  where p.id = new.party_id
  for update;
  if v_status is distinct from 'active' then
    raise exception 'Party is disbanded' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger party_members_require_active_party
  before insert on public.party_members
  for each row execute function party_private.require_active_party();
create trigger party_invitations_require_active_party
  before insert on public.party_invitations
  for each row execute function party_private.require_active_party();

create function party_private.prevent_disbanded_party_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'disbanded' then
    raise exception 'Party is disbanded' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger parties_prevent_disbanded_update
  before update on public.parties
  for each row execute function party_private.prevent_disbanded_party_update();

revoke execute on function party_private.require_active_party() from public, anon, authenticated;
revoke execute on function party_private.prevent_disbanded_party_update() from public, anon, authenticated;

-- Candidate search must also stop for a former leader after disbanding.
create or replace function public.search_party_invite_candidates(p_party_id uuid, p_query text)
returns table (user_id uuid, nickname text, invite_status text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_approved()
     or not exists (
       select 1 from public.parties p
       where p.id = p_party_id
         and p.leader_id = auth.uid()
         and p.status = 'active'
     ) then
    raise exception 'Active party leader required' using errcode = '42501';
  end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 50 then
    raise exception 'Enter a nickname to search' using errcode = '22023';
  end if;

  return query
  select pr.id, pr.nickname,
    case
      when exists (
        select 1 from public.party_members pm
        where pm.party_id = p_party_id and pm.user_id = pr.id
      ) then 'joined'::text
      when exists (
        select 1 from public.party_invitations i
        where i.party_id = p_party_id and i.invitee_id = pr.id and i.status = 'pending'
      ) then 'pending'::text
      else 'available'::text
    end
  from public.profiles pr
  where pr.status = 'approved'
    and pr.id <> auth.uid()
    and position(lower(btrim(p_query)) in lower(pr.nickname)) > 0
  order by pr.nickname, pr.id
  limit 30;
end;
$$;

create function public.disband_party(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_leader_id uuid;
  v_status text;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  if p_party_id is null then
    raise exception 'Party is required' using errcode = '22023';
  end if;

  select p.leader_id, p.status into v_leader_id, v_status
  from public.parties p
  where p.id = p_party_id
  for update;
  if v_leader_id is null or v_leader_id <> v_user_id then
    raise exception 'Party leader required' using errcode = '42501';
  end if;
  if v_status <> 'active' then
    raise exception 'Party already disbanded' using errcode = '22023';
  end if;

  update public.party_invitations i
  set status = 'expired'
  where i.party_id = p_party_id and i.status = 'pending';

  delete from public.party_members pm
  where pm.party_id = p_party_id;

  update public.parties p
  set status = 'disbanded',
      location_sharing_enabled = false,
      active_route_id = null
  where p.id = p_party_id;
end;
$$;

revoke execute on function public.disband_party(uuid) from public, anon;
grant execute on function public.disband_party(uuid) to authenticated;
