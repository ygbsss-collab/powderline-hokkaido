-- Apply after 20261108000000_respond_party_invitation.sql.
-- Updates the active route for a party after verifying party leader ownership and registered route membership.

create function public.set_party_active_route(p_party_id uuid, p_route_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_leader_id uuid;
  v_region text;
  v_route_ids uuid[];
begin
  if v_user_id is null or not public.is_approved() then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  if p_party_id is null or p_route_id is null then
    raise exception 'Select a party course' using errcode = '22023';
  end if;

  select p.leader_id, p.region, p.route_ids
  into v_leader_id, v_region, v_route_ids
  from public.parties p
  where p.id = p_party_id
  for update;

  if v_leader_id is null or v_leader_id <> v_user_id then
    raise exception 'Party leader required' using errcode = '42501';
  end if;

  if not (p_route_id = any(coalesce(v_route_ids, '{}'::uuid[])))
     or not exists (
       select 1 from public.powderline_routes r
       where r.id = p_route_id
         and r.user_id = v_user_id
         and r.region = v_region
     ) then
    raise exception 'Registered party course required' using errcode = '22023';
  end if;

  update public.parties p
  set active_route_id = p_route_id
  where p.id = p_party_id;

  return p_route_id;
end;
$$;

revoke execute on function public.set_party_active_route(uuid, uuid) from public, anon;
grant execute on function public.set_party_active_route(uuid, uuid) to authenticated;

