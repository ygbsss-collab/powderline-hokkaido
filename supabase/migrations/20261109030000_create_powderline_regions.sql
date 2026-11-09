-- Region catalog. bbox is [west, south, east, north] in WGS84 degrees.
create table public.powderline_regions (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$' and char_length(id) <= 50),
  label text not null check (char_length(trim(label)) between 1 and 100),
  center_lng double precision not null check (center_lng between -180 and 180),
  center_lat double precision not null check (center_lat between -90 and 90),
  zoom double precision not null check (zoom between 0 and 22),
  bearing double precision not null check (bearing between -180 and 180),
  pitch double precision not null check (pitch between 0 and 75),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  bbox jsonb check (
    case
      when bbox is null then true
      when jsonb_typeof(bbox) <> 'array' then false
      when jsonb_array_length(bbox) <> 4 then false
      when jsonb_typeof(bbox->0) <> 'number'
        or jsonb_typeof(bbox->1) <> 'number'
        or jsonb_typeof(bbox->2) <> 'number'
        or jsonb_typeof(bbox->3) <> 'number' then false
      else (bbox->>0)::numeric between -180 and 180
        and (bbox->>2)::numeric between -180 and 180
        and (bbox->>1)::numeric between -90 and 90
        and (bbox->>3)::numeric between -90 and 90
        and (bbox->>0)::numeric < (bbox->>2)::numeric
        and (bbox->>1)::numeric < (bbox->>3)::numeric
    end
  ),
  offline_data_version text check (
    offline_data_version is null or char_length(trim(offline_data_version)) between 1 and 100
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint powderline_regions_default_active check (not is_default or is_active)
);

create unique index powderline_regions_one_default_idx
  on public.powderline_regions (is_default) where is_default;

insert into public.powderline_regions
  (id, label, center_lng, center_lat, zoom, bearing, pitch, sort_order, is_default)
values
  ('asahidake', '아사히다케', 142.854, 43.663, 11.0, 12, 54, 1, false),
  ('rusutsu', '루스츠', 140.88, 42.74, 11.0, -18, 54, 2, false),
  ('furano', '후라노', 142.355, 43.325, 11.0, 16, 54, 3, true),
  ('niseko', '니세코', 140.69, 42.86, 10.5, -20, 54, 4, false),
  ('kamui', '카무이 스키 링크스', 142.19, 43.70, 11.0, 8, 54, 5, false),
  ('kiroro', '키로로', 140.99, 43.07, 10.8, -12, 54, 6, false);

create function public.guard_powderline_region_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.id in ('asahidake', 'rusutsu', 'furano', 'niseko', 'kamui', 'kiroro') then
      raise exception 'Built-in regions cannot be deleted.' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.id in ('asahidake', 'rusutsu', 'furano', 'niseko', 'kamui', 'kiroro')
     and (new.id is distinct from old.id or not new.is_active) then
    raise exception 'Built-in regions must keep their IDs and remain active.' using errcode = '23514';
  end if;
  if old.id = 'furano' and not new.is_default then
    raise exception 'Furano must remain the default region.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_powderline_region_changes
  before update or delete on public.powderline_regions
  for each row execute function public.guard_powderline_region_changes();

revoke all on function public.guard_powderline_region_changes() from public, anon, authenticated;

alter table public.powderline_regions enable row level security;
revoke all on table public.powderline_regions from public, anon, authenticated;
grant select on public.powderline_regions to anon, authenticated;
grant insert, update on public.powderline_regions to authenticated;

-- The initial map is shown before sign-in, so anon can read active regions.
create policy powderline_regions_select_active
  on public.powderline_regions for select to anon, authenticated
  using (is_active);

create policy powderline_regions_select_admin
  on public.powderline_regions for select to authenticated
  using (public.is_admin());

create policy powderline_regions_insert_admin
  on public.powderline_regions for insert to authenticated
  with check (public.is_admin());

create policy powderline_regions_update_admin
  on public.powderline_regions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Replace the fixed six-ID check with a catalog FK; existing party rows are retained.
alter table public.parties
  alter column region set not null,
  drop constraint parties_region_check,
  add constraint parties_region_fkey foreign key (region)
    references public.powderline_regions(id) on update restrict on delete restrict;
