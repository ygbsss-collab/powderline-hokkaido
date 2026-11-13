-- Apply after 20261108040000_disband_party.sql.
-- Stores only the latest single GPS fix per party member in public.party_members,
-- supports leader-configurable 10/30/60s intervals, location sharing ON/OFF,
-- and automatic location removal upon party leave or disband.

alter table public.parties
  add column if not exists gps_interval_seconds integer not null default 30;

alter table public.parties
  drop constraint if exists parties_gps_interval_seconds_check;

alter table public.parties
  add constraint parties_gps_interval_seconds_check
  check (gps_interval_seconds in (10, 30, 60));

alter table public.party_members
  add column if not exists location_sharing_enabled boolean not null default true,
  add column if not exists last_latitude double precision,
  add column if not exists last_longitude double precision,
  add column if not exists last_accuracy_m double precision,
  add column if not exists last_heading double precision,
  add column if not exists last_speed_mps double precision,
  add column if not exists location_updated_at timestamptz;

alter table public.party_members
  drop constraint if exists party_members_last_latitude_check,
  drop constraint if exists party_members_last_longitude_check,
  drop constraint if exists party_members_last_accuracy_m_check,
  drop constraint if exists party_members_last_heading_check,
  drop constraint if exists party_members_last_speed_mps_check;

alter table public.party_members
  add constraint party_members_last_latitude_check
    check (last_latitude is null or (last_latitude between -90 and 90)),
  add constraint party_members_last_longitude_check
    check (last_longitude is null or (last_longitude between -180 and 180)),
  add constraint party_members_last_accuracy_m_check
    check (last_accuracy_m is null or last_accuracy_m >= 0),
  add constraint party_members_last_heading_check
    check (last_heading is null or (last_heading >= 0 and last_heading <= 360)),
  add constraint party_members_last_speed_mps_check
    check (last_speed_mps is null or last_speed_mps >= 0);

create index if not exists party_members_party_location_updated_idx
  on public.party_members (party_id, location_updated_at desc);

-- Leader-only RPC to configure party GPS transmission interval (10 / 30 / 60 seconds).
create or replace function public.set_party_gps_interval(
  p_party_id uuid,
  p_interval_seconds integer
)
returns integer
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

  if p_interval_seconds is null or p_interval_seconds not in (10, 30, 60) then
    raise exception 'GPS interval must be 10, 30, or 60 seconds' using errcode = '22023';
  end if;

  select p.leader_id, p.status
    into v_leader_id, v_status
  from public.parties p
  where p.id = p_party_id
  for update;

  if v_leader_id is null then
    raise exception 'Party not found' using errcode = 'P0002';
  end if;

  if v_leader_id <> v_user_id then
    raise exception 'Only the party leader can change GPS interval' using errcode = '42501';
  end if;

  if v_status is distinct from 'active' then
    raise exception 'Party is disbanded' using errcode = '22023';
  end if;

  update public.parties
  set gps_interval_seconds = p_interval_seconds
  where id = p_party_id;

  return p_interval_seconds;
end;
$$;

-- Member RPC to toggle own location sharing ON/OFF. Turning OFF immediately clears stored coordinates.
create or replace function public.set_my_party_location_sharing(
  p_party_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if p_party_id is null or p_enabled is null then
    raise exception 'Party and sharing state are required' using errcode = '22023';
  end if;

  select p.status
    into v_status
  from public.parties p
  where p.id = p_party_id;

  if v_status is distinct from 'active' then
    raise exception 'Party is not active' using errcode = '22023';
  end if;

  update public.party_members pm
  set location_sharing_enabled = p_enabled,
      last_latitude = case when p_enabled then pm.last_latitude else null end,
      last_longitude = case when p_enabled then pm.last_longitude else null end,
      last_accuracy_m = case when p_enabled then pm.last_accuracy_m else null end,
      last_heading = case when p_enabled then pm.last_heading else null end,
      last_speed_mps = case when p_enabled then pm.last_speed_mps else null end,
      location_updated_at = case when p_enabled then pm.location_updated_at else null end
  where pm.party_id = p_party_id
    and pm.user_id = v_user_id;

  if not found then
    raise exception 'Party membership required' using errcode = '42501';
  end if;

  return p_enabled;
end;
$$;

-- Member RPC to overwrite only the single latest location for (party_id, auth.uid()).
create or replace function public.upsert_my_party_location(
  p_party_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision default null,
  p_heading double precision default null,
  p_speed_mps double precision default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_party_sharing boolean;
  v_member_sharing boolean;
  v_updated_at timestamptz := now();
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if p_party_id is null then
    raise exception 'Party is required' using errcode = '22023';
  end if;

  if p_lat is null or p_lat not between -90 and 90
     or p_lng is null or p_lng not between -180 and 180 then
    raise exception 'Valid latitude and longitude are required' using errcode = '22023';
  end if;

  if p_accuracy_m is not null and p_accuracy_m < 0 then
    p_accuracy_m := null;
  end if;

  if p_heading is not null and (p_heading < 0 or p_heading > 360) then
    p_heading := null;
  end if;

  if p_speed_mps is not null and p_speed_mps < 0 then
    p_speed_mps := null;
  end if;

  select p.status, p.location_sharing_enabled
    into v_status, v_party_sharing
  from public.parties p
  where p.id = p_party_id;

  if v_status is distinct from 'active' then
    raise exception 'Party is not active' using errcode = '22023';
  end if;

  select pm.location_sharing_enabled
    into v_member_sharing
  from public.party_members pm
  where pm.party_id = p_party_id
    and pm.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Party membership required' using errcode = '42501';
  end if;

  if v_member_sharing is false then
    raise exception 'Location sharing is disabled' using errcode = '22023';
  end if;

  update public.party_members pm
  set last_latitude = p_lat,
      last_longitude = p_lng,
      last_accuracy_m = p_accuracy_m,
      last_heading = p_heading,
      last_speed_mps = p_speed_mps,
      location_updated_at = v_updated_at
  where pm.party_id = p_party_id
    and pm.user_id = v_user_id;

  return v_updated_at;
end;
$$;

-- Clears stored location coordinates for the caller in one party or all joined parties.
create or replace function public.clear_my_party_location(
  p_party_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  update public.party_members pm
  set last_latitude = null,
      last_longitude = null,
      last_accuracy_m = null,
      last_heading = null,
      last_speed_mps = null,
      location_updated_at = null
  where pm.user_id = v_user_id
    and (p_party_id is null or pm.party_id = p_party_id);
end;
$$;

-- Member RPC to leave a party and delete membership + stored location.
create or replace function public.leave_party(
  p_party_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_leader_id uuid;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if p_party_id is null then
    raise exception 'Party is required' using errcode = '22023';
  end if;

  select p.leader_id
    into v_leader_id
  from public.parties p
  where p.id = p_party_id
  for update;

  if v_leader_id is null then
    raise exception 'Party not found' using errcode = 'P0002';
  end if;

  if v_leader_id = v_user_id then
    raise exception 'Party leader must disband the party instead of leaving' using errcode = '22023';
  end if;

  delete from public.party_members pm
  where pm.party_id = p_party_id
    and pm.user_id = v_user_id;

  if not found then
    raise exception 'Party membership not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Returns party members along with their latest location, accuracy, timestamp, and party interval.
create or replace function public.list_my_party_member_locations(
  p_party_id uuid default null
)
returns table (
  party_id uuid,
  user_id uuid,
  role text,
  nickname text,
  location_sharing_enabled boolean,
  gps_interval_seconds integer,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  location_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  return query
  select
    pm.party_id,
    pm.user_id,
    pm.role,
    pr.nickname,
    pm.location_sharing_enabled,
    p.gps_interval_seconds,
    case when pm.location_sharing_enabled then pm.last_latitude else null end as lat,
    case when pm.location_sharing_enabled then pm.last_longitude else null end as lng,
    case when pm.location_sharing_enabled then pm.last_accuracy_m else null end as accuracy_m,
    case when pm.location_sharing_enabled then pm.last_heading else null end as heading,
    case when pm.location_sharing_enabled then pm.last_speed_mps else null end as speed_mps,
    case when pm.location_sharing_enabled then pm.location_updated_at else null end as location_updated_at
  from public.party_members pm
  join public.parties p on p.id = pm.party_id
  join public.profiles pr on pr.id = pm.user_id
  where p.status = 'active'
    and (p_party_id is null or pm.party_id = p_party_id)
    and party_private.is_party_member(pm.party_id)
  order by pm.party_id, pm.joined_at, pm.user_id;
end;
$$;

revoke execute on function public.set_party_gps_interval(uuid, integer) from public, anon;
grant execute on function public.set_party_gps_interval(uuid, integer) to authenticated;

revoke execute on function public.set_my_party_location_sharing(uuid, boolean) from public, anon;
grant execute on function public.set_my_party_location_sharing(uuid, boolean) to authenticated;

revoke execute on function public.upsert_my_party_location(uuid, double precision, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.upsert_my_party_location(uuid, double precision, double precision, double precision, double precision, double precision) to authenticated;

revoke execute on function public.clear_my_party_location(uuid) from public, anon;
grant execute on function public.clear_my_party_location(uuid) to authenticated;

revoke execute on function public.leave_party(uuid) from public, anon;
grant execute on function public.leave_party(uuid) to authenticated;

revoke execute on function public.list_my_party_member_locations(uuid) from public, anon;
grant execute on function public.list_my_party_member_locations(uuid) to authenticated;

