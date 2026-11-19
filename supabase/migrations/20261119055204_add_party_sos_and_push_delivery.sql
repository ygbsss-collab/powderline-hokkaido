-- Party Ride SOS records, device push-token registry, and per-device FCM delivery audit.
-- Existing party/location tables remain unchanged; SOS coordinates are immutable snapshots.

create table public.party_sos_events (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id),
  requester_id uuid references public.profiles(id) on delete set null,
  requester_name text not null check (char_length(btrim(requester_name)) between 1 and 100),
  client_request_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  position_recorded_at timestamptz not null,
  occurred_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, client_request_id),
  check (
    (status = 'active' and resolved_at is null and resolved_by is null)
    or (
      status = 'resolved' and resolved_at is not null
      and (resolved_by = requester_id or (requester_id is null and resolved_by is null))
    )
  )
);

create unique index party_sos_one_active_per_member_idx
  on public.party_sos_events (party_id, requester_id)
  where status = 'active';

create index party_sos_party_status_time_idx
  on public.party_sos_events (party_id, status, occurred_at desc);

alter table public.party_sos_events enable row level security;

create policy party_sos_select_same_party
  on public.party_sos_events for select
  to authenticated
  using (public.is_approved() and party_private.is_party_member(party_id));

revoke all on public.party_sos_events from public, anon, authenticated;
grant select on public.party_sos_events to authenticated;
grant select, insert, update on public.party_sos_events to service_role;

-- Tokens are server-managed only. No browser role receives table privileges or an RLS policy.
create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096 and token !~ '[[:space:]]'),
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  last_registered_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index push_devices_user_active_idx
  on public.push_devices (user_id, last_registered_at desc)
  where disabled_at is null;

alter table public.push_devices enable row level security;
revoke all on public.push_devices from public, anon, authenticated;
grant select, insert, update, delete on public.push_devices to service_role;

-- One audit row per event/type/device prevents duplicate FCM sends and retains failures.
create table public.party_sos_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  sos_event_id uuid not null references public.party_sos_events(id),
  recipient_id uuid references public.profiles(id) on delete set null,
  push_device_id uuid references public.push_devices(id) on delete set null,
  event_type text not null check (event_type in ('sos_created', 'sos_resolved')),
  dedupe_key text not null unique,
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  response_code integer,
  error_message text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz
);

create index party_sos_delivery_event_idx
  on public.party_sos_notification_deliveries (sos_event_id, event_type, attempted_at);

alter table public.party_sos_notification_deliveries enable row level security;
revoke all on public.party_sos_notification_deliveries from public, anon, authenticated;
grant select, insert, update on public.party_sos_notification_deliveries to service_role;

-- Account deletion must not be blocked by historical SOS/audit rows. Resolve an
-- active SOS first, then the profile foreign keys are anonymized with ON DELETE SET NULL.
create function party_private.resolve_sos_before_profile_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.party_sos_events e
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = old.id,
      updated_at = now()
  where e.requester_id = old.id
    and e.status = 'active';
  return old;
end;
$$;

create trigger profiles_resolve_active_sos_before_delete
  before delete on public.profiles
  for each row execute function party_private.resolve_sos_before_profile_delete();

revoke execute on function party_private.resolve_sos_before_profile_delete()
  from public, anon, authenticated;

-- Creates one immutable SOS position snapshot for the authenticated party member.
-- Client freshness is 30 seconds; the server allows two minutes for clock skew/network transit.
create function public.create_party_sos(
  p_party_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision,
  p_position_recorded_at timestamptz,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_nickname text;
  v_event public.party_sos_events%rowtype;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  if p_party_id is null or p_client_request_id is null then
    raise exception 'Party and request id are required' using errcode = '22023';
  end if;
  if p_lat is null or p_lat not between -90 and 90
     or p_lng is null or p_lng not between -180 and 180 then
    raise exception 'Valid latitude and longitude are required' using errcode = '22023';
  end if;
  if p_accuracy_m is not null and p_accuracy_m < 0 then
    raise exception 'Invalid location accuracy' using errcode = '22023';
  end if;
  if p_position_recorded_at is null
     or p_position_recorded_at < v_now - interval '2 minutes'
     or p_position_recorded_at > v_now + interval '30 seconds' then
    raise exception 'Fresh GPS position required' using errcode = '22023';
  end if;

  -- An identical retry returns the stored event without creating or notifying a second SOS.
  select e.* into v_event
  from public.party_sos_events e
  where e.requester_id = v_user_id
    and e.client_request_id = p_client_request_id;
  if found then
    return to_jsonb(v_event);
  end if;

  perform 1
  from public.party_members pm
  join public.parties p on p.id = pm.party_id
  where pm.party_id = p_party_id
    and pm.user_id = v_user_id
    and p.status = 'active'
  for update of pm;
  if not found then
    raise exception 'Active party membership required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.party_sos_events e
    where e.party_id = p_party_id
      and e.requester_id = v_user_id
      and e.status = 'active'
  ) then
    raise exception 'SOS is already active' using errcode = '23505';
  end if;

  select pr.nickname into v_nickname
  from public.profiles pr
  where pr.id = v_user_id;
  if v_nickname is null or btrim(v_nickname) = '' then
    raise exception 'Requester profile is unavailable' using errcode = '22023';
  end if;

  insert into public.party_sos_events (
    party_id, requester_id, requester_name, client_request_id,
    latitude, longitude, accuracy_m, position_recorded_at, occurred_at
  ) values (
    p_party_id, v_user_id, v_nickname, p_client_request_id,
    p_lat, p_lng, p_accuracy_m, p_position_recorded_at, v_now
  )
  returning * into v_event;

  return to_jsonb(v_event);
end;
$$;

-- Only the original requester can resolve an SOS. The record and coordinates remain stored.
create function public.resolve_party_sos(p_sos_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.party_sos_events%rowtype;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  if p_sos_id is null then
    raise exception 'SOS id is required' using errcode = '22023';
  end if;

  select e.* into v_event
  from public.party_sos_events e
  where e.id = p_sos_id
  for update;
  if not found then
    raise exception 'SOS not found' using errcode = 'P0002';
  end if;
  if v_event.requester_id <> v_user_id then
    raise exception 'Only the requester can resolve this SOS' using errcode = '42501';
  end if;

  if v_event.status = 'active' then
    update public.party_sos_events e
    set status = 'resolved',
        resolved_at = now(),
        resolved_by = v_user_id,
        updated_at = now()
    where e.id = p_sos_id
    returning * into v_event;
  end if;

  return to_jsonb(v_event);
end;
$$;

revoke execute on function public.create_party_sos(uuid, double precision, double precision, double precision, timestamptz, uuid)
  from public, anon;
grant execute on function public.create_party_sos(uuid, double precision, double precision, double precision, timestamptz, uuid)
  to authenticated;

revoke execute on function public.resolve_party_sos(uuid) from public, anon;
grant execute on function public.resolve_party_sos(uuid) to authenticated;

-- Existing clients use Postgres Changes. Add only the new public table to that publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'party_sos_events'
     ) then
    execute 'alter publication supabase_realtime add table public.party_sos_events';
  end if;
end
$$;
