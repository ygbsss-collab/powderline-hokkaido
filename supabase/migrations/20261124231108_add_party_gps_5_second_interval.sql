-- Add a 5-second party GPS interval without changing the existing 30-second default.
alter table public.parties
  drop constraint if exists parties_gps_interval_seconds_check;

alter table public.parties
  add constraint parties_gps_interval_seconds_check
  check (gps_interval_seconds in (5, 10, 30, 60));

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

  if p_interval_seconds is null or p_interval_seconds not in (5, 10, 30, 60) then
    raise exception 'GPS interval must be 5, 10, 30, or 60 seconds' using errcode = '22023';
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
