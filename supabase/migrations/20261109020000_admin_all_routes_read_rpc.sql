-- Read-only administrator access to all member routes.
-- Existing route RLS and approval policies remain unchanged.

create function public.list_admin_all_routes(
  page_number integer default 1,
  page_size integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  name text,
  region text,
  distance_km double precision,
  created_at timestamptz,
  author_nickname text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if page_number is null or page_number < 1
     or page_size is null or page_size < 1 or page_size > 100 then
    raise exception 'Invalid page number or page size.' using errcode = '22023';
  end if;

  return query
    select r.id, r.user_id, r.name, r.region, r.distance_km,
           r.created_at, p.nickname
    from public.powderline_routes as r
    left join public.profiles as p on p.id = r.user_id
    order by r.created_at desc, r.id desc
    limit page_size
    offset (page_number::bigint - 1) * page_size::bigint;
end;
$$;

create function public.get_admin_route_points(route_id uuid)
returns table (
  id uuid,
  user_id uuid,
  name text,
  region text,
  distance_km double precision,
  created_at timestamptz,
  updated_at timestamptz,
  author_nickname text,
  points jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
    select r.id, r.user_id, r.name, r.region, r.distance_km,
           r.created_at, r.updated_at, p.nickname, r.points
    from public.powderline_routes as r
    left join public.profiles as p on p.id = r.user_id
    where r.id = route_id;
end;
$$;

revoke all on function public.list_admin_all_routes(integer, integer) from public, anon;
revoke all on function public.get_admin_route_points(uuid) from public, anon;
grant execute on function public.list_admin_all_routes(integer, integer) to authenticated;
grant execute on function public.get_admin_route_points(uuid) to authenticated;
