-- POWDERLINE HOKKAIDO: per-user route storage
-- Apply to the dedicated POWDERLINE Supabase project only.
create table if not exists public.powderline_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  region text,
  points jsonb not null check (jsonb_typeof(points) = 'array'),
  distance_km double precision check (distance_km is null or distance_km >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists powderline_routes_user_updated_idx
  on public.powderline_routes (user_id, updated_at desc);

alter table public.powderline_routes enable row level security;

create policy "powderline_routes_select_own"
  on public.powderline_routes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "powderline_routes_insert_own"
  on public.powderline_routes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "powderline_routes_update_own"
  on public.powderline_routes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "powderline_routes_delete_own"
  on public.powderline_routes for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.powderline_routes to authenticated;
