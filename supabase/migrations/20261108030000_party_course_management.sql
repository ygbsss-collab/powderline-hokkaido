-- Party course management (leader add/remove) and party member course listing RPCs.

create or replace function public.add_party_route(
  p_party_id uuid,
  p_route_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_leader_id uuid;
  v_region text;
  v_route_ids uuid[];
  v_active_route_id uuid;
  v_next_route_ids uuid[];
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if p_party_id is null then
    raise exception 'Party is required' using errcode = '22023';
  end if;

  if p_route_id is null then
    raise exception 'Route is required' using errcode = '22023';
  end if;

  select p.leader_id, p.region, coalesce(p.route_ids, '{}'::uuid[]), p.active_route_id
    into v_leader_id, v_region, v_route_ids, v_active_route_id
  from public.parties p
  where p.id = p_party_id
  for update;

  if v_leader_id is null then
    raise exception 'Party not found' using errcode = 'P0002';
  end if;

  if v_leader_id <> v_user_id then
    raise exception 'Only the party leader can add courses' using errcode = '42501';
  end if;

  if p_route_id = any(v_route_ids) then
    raise exception 'Course is already registered in this party' using errcode = '23505';
  end if;

  if not exists (
    select 1
    from public.powderline_routes r
    where r.id = p_route_id
      and r.user_id = v_user_id
      and r.region = v_region
  ) then
    raise exception 'Only saved courses in the party region owned by the party leader can be added' using errcode = '22023';
  end if;

  v_next_route_ids := array_append(v_route_ids, p_route_id);

  update public.parties
  set route_ids = v_next_route_ids,
      active_route_id = coalesce(v_active_route_id, p_route_id)
  where id = p_party_id;

  return v_next_route_ids;
end;
$$;

create or replace function public.remove_party_route(
  p_party_id uuid,
  p_route_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_leader_id uuid;
  v_route_ids uuid[];
  v_active_route_id uuid;
  v_next_route_ids uuid[];
  v_next_active_route_id uuid;
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if p_party_id is null then
    raise exception 'Party is required' using errcode = '22023';
  end if;

  if p_route_id is null then
    raise exception 'Route is required' using errcode = '22023';
  end if;

  select p.leader_id, coalesce(p.route_ids, '{}'::uuid[]), p.active_route_id
    into v_leader_id, v_route_ids, v_active_route_id
  from public.parties p
  where p.id = p_party_id
  for update;

  if v_leader_id is null then
    raise exception 'Party not found' using errcode = 'P0002';
  end if;

  if v_leader_id <> v_user_id then
    raise exception 'Only the party leader can remove courses' using errcode = '42501';
  end if;

  if not (p_route_id = any(v_route_ids)) then
    raise exception 'Course is not registered in this party' using errcode = '22023';
  end if;

  v_next_route_ids := array_remove(v_route_ids, p_route_id);
  v_next_active_route_id := case
    when v_active_route_id = p_route_id then v_next_route_ids[1]
    else v_active_route_id
  end;

  update public.parties
  set route_ids = v_next_route_ids,
      active_route_id = v_next_active_route_id
  where id = p_party_id;

  return v_next_route_ids;
end;
$$;

create or replace function public.list_my_party_routes()
returns table (
  party_id uuid,
  route_id uuid,
  name text,
  region text,
  points jsonb,
  distance_km double precision,
  is_active boolean,
  route_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  return query
  select
    p.id as party_id,
    r.id as route_id,
    r.name,
    r.region,
    r.points,
    r.distance_km,
    (p.active_route_id = r.id) as is_active,
    u.ord::integer as route_order
  from public.parties p
  cross join lateral unnest(coalesce(p.route_ids, '{}'::uuid[])) with ordinality as u(route_id, ord)
  join public.powderline_routes r
    on r.id = u.route_id
   and r.user_id = p.leader_id
  where party_private.is_party_member(p.id)
  order by p.id, u.ord;
end;
$$;

revoke execute on function public.add_party_route(uuid, uuid) from public, anon;
grant execute on function public.add_party_route(uuid, uuid) to authenticated;

revoke execute on function public.remove_party_route(uuid, uuid) from public, anon;
grant execute on function public.remove_party_route(uuid, uuid) to authenticated;

revoke execute on function public.list_my_party_routes() from public, anon;
grant execute on function public.list_my_party_routes() to authenticated;

