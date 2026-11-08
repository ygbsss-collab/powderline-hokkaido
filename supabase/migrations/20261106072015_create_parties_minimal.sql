-- Standalone party creation migration. Do not run the deferred full party migration.
-- Requires profiles, is_approved(), and powderline_routes from earlier migrations.

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references public.profiles(id),
  name text not null check (char_length(trim(name)) between 1 and 100),
  region text not null check (region in ('asahidake', 'rusutsu', 'furano', 'niseko', 'kamui', 'kiroro')),
  route_ids uuid[] not null default '{}',
  active_route_id uuid references public.powderline_routes(id),
  max_members integer not null default 8 check (max_members between 2 and 30),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9-]{6,32}$'),
  location_sharing_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index parties_leader_created_idx on public.parties (leader_id, created_at desc);
alter table public.parties enable row level security;

-- Party creation is available only through create_party().
create policy parties_select_own on public.parties for select to authenticated
  using (public.is_approved() and leader_id = (select auth.uid()));

create table public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null check (role = 'leader'),
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

alter table public.party_members enable row level security;

create policy party_members_select_own on public.party_members for select to authenticated
  using (public.is_approved() and user_id = (select auth.uid()));

-- SECURITY DEFINER is limited to this creation operation. Authenticated callers
-- cannot write either table directly. Both inserts share one RPC transaction.
create function public.create_party(
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
  if p_region is null or p_region not in ('asahidake', 'rusutsu', 'furano', 'niseko', 'kamui', 'kiroro') then
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

revoke all on public.parties, public.party_members from public, anon, authenticated;
grant select on public.parties, public.party_members to authenticated;
revoke execute on function public.create_party(text, text, uuid[], integer, text, boolean) from public, anon;
grant execute on function public.create_party(text, text, uuid[], integer, text, boolean) to authenticated;
