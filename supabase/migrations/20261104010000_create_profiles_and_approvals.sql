-- POWDERLINE HOKKAIDO: User Profiles & Admin Approval System
-- Safe, idempotent migration with strict RLS policies

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nickname text not null check (char_length(trim(nickname)) between 1 and 50),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status, created_at desc);
create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

-- Helper security definer functions to prevent recursive RLS
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- RLS Policies for profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or public.is_admin());

drop policy if exists "profiles_insert_own_pending" on public.profiles;
create policy "profiles_insert_own_pending"
  on public.profiles for insert to authenticated
  with check (
    (select auth.uid()) = id
    and (status = 'pending' or public.is_admin())
    and (role = 'member' or public.is_admin())
  );

drop policy if exists "profiles_update_policy" on public.profiles;
create policy "profiles_update_policy"
  on public.profiles for update to authenticated
  using (
    (select auth.uid()) = id or public.is_admin()
  )
  with check (
    -- Admins can update status, role, and nickname of any profile
    public.is_admin()
    or (
      -- Normal users can only update their own nickname without changing status or role
      (select auth.uid()) = id
      and status = (select p.status from public.profiles p where p.id = (select auth.uid()))
      and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
    )
  );

-- Trigger to auto-create profile on new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_nick text;
begin
  raw_nick := coalesce(trim(new.raw_user_meta_data->>'nickname'), split_part(new.email, '@', 1), 'Rider');
  if char_length(raw_nick) < 1 then
    raw_nick := 'Rider';
  elsif char_length(raw_nick) > 50 then
    raw_nick := substring(raw_nick from 1 for 50);
  end if;

  insert into public.profiles (id, email, nickname, status, role)
  values (new.id, new.email, raw_nick, 'pending', 'member')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Administrative status update function
create or replace function public.set_user_status(target_user_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change user approval status.';
  end if;
  if new_status not in ('approved', 'rejected', 'pending') then
    raise exception 'Invalid status value.';
  end if;
  update public.profiles
  set status = new_status, updated_at = now()
  where id = target_user_id;
end;
$$;

-- Secure initial admin bootstrap function
create or replace function public.set_initial_admin(admin_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  admin_count integer;
begin
  select count(*) into admin_count from public.profiles where role = 'admin' and status = 'approved';
  if admin_count > 0 and not public.is_admin() then
    raise exception 'An administrator already exists. Only existing administrators can assign new admins.';
  end if;

  select id into target_id from auth.users where email = admin_email;
  if target_id is null then
    raise exception 'User with email % not found.', admin_email;
  end if;

  insert into public.profiles (id, email, nickname, status, role, updated_at)
  values (target_id, admin_email, split_part(admin_email, '@', 1), 'approved', 'admin', now())
  on conflict (id) do update set
    status = 'approved',
    role = 'admin',
    updated_at = now();

  return 'User ' || admin_email || ' has been granted administrator privileges.';
end;
$$;

-- Update RLS policies on powderline_routes so ONLY approved members can use cloud routes
drop policy if exists "powderline_routes_select_own" on public.powderline_routes;
drop policy if exists "powderline_routes_insert_own" on public.powderline_routes;
drop policy if exists "powderline_routes_update_own" on public.powderline_routes;
drop policy if exists "powderline_routes_delete_own" on public.powderline_routes;

create policy "powderline_routes_select_own"
  on public.powderline_routes for select to authenticated
  using ((select auth.uid()) = user_id and public.is_approved());

create policy "powderline_routes_insert_own"
  on public.powderline_routes for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_approved());

create policy "powderline_routes_update_own"
  on public.powderline_routes for update to authenticated
  using ((select auth.uid()) = user_id and public.is_approved())
  with check ((select auth.uid()) = user_id and public.is_approved());

create policy "powderline_routes_delete_own"
  on public.powderline_routes for delete to authenticated
  using ((select auth.uid()) = user_id and public.is_approved());

grant select, insert, update on public.profiles to authenticated;
grant execute on function public.is_admin to authenticated;
grant execute on function public.is_approved to authenticated;
grant execute on function public.set_user_status to authenticated;
grant execute on function public.set_initial_admin to authenticated;

