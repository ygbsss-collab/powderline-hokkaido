-- Requires 20261109030000_create_powderline_regions.sql first.
-- Preserve the existing RPC contract and authorization; only region validation changes.
create or replace function public.create_party(
  p_name text,
  p_region text,
  p_route_ids uuid[],
  p_max_members integer,
  p_invite_code text,
  p_location_sharing_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_route_ids uuid[] := coalesce(p_route_ids, '{}'::uuid[]);
  v_code text := upper(trim(p_invite_code));
  v_party_id uuid;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 100 then
    raise exception 'Invalid party name' using errcode = '22023';
  end if;
  if p_region is null or not exists (
    select 1 from public.powderline_regions r
    where r.id = p_region and r.is_active
    for share
  ) then
    raise exception 'Invalid region' using errcode = '22023';
  end if;
  if p_max_members is null or p_max_members not between 2 and 30 then
    raise exception 'Invalid party capacity' using errcode = '22023';
  end if;
  if v_code is null or v_code !~ '^[A-Z0-9-]{6,32}$' then
    raise exception 'Invalid invite code' using errcode = '22023';
  end if;
  if p_location_sharing_enabled is null then
    raise exception 'Invalid location sharing setting' using errcode = '22023';
  end if;
  if array_position(v_route_ids, null) is not null
     or cardinality(v_route_ids) <> (
       select count(distinct r.id) from public.powderline_routes r
       where r.id = any(v_route_ids) and r.user_id = v_user_id
     ) then
    raise exception 'Select only owned, distinct courses' using errcode = '22023';
  end if;

  insert into public.parties
    (leader_id, name, region, route_ids, active_route_id, max_members, invite_code, location_sharing_enabled)
  values
    (v_user_id, trim(p_name), p_region, v_route_ids, v_route_ids[1], p_max_members, v_code, p_location_sharing_enabled)
  returning id into v_party_id;

  insert into public.party_members (party_id, user_id, role)
  values (v_party_id, v_user_id, 'leader');

  return v_party_id;
end;
$$;

revoke execute on function public.create_party(text, text, uuid[], integer, text, boolean) from public, anon;
grant execute on function public.create_party(text, text, uuid[], integer, text, boolean) to authenticated;
