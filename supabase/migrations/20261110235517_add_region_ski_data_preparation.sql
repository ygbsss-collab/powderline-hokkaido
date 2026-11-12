-- Track server-side ski GeoJSON preparation without coupling it to region creation.
alter table public.powderline_regions
  add column ski_data_status text not null default 'not_requested'
    check (ski_data_status in ('not_requested', 'pending', 'processing', 'ready', 'empty', 'failed')),
  add column ski_data_request_id uuid,
  add column ski_data_requested_at timestamptz,
  add column ski_data_started_at timestamptz,
  add column ski_data_completed_at timestamptz,
  add column ski_data_error text check (ski_data_error is null or char_length(ski_data_error) <= 1000),
  add column ski_data_feature_count integer check (ski_data_feature_count is null or ski_data_feature_count >= 0),
  add column ski_data_file_size integer check (ski_data_file_size is null or ski_data_file_size >= 0);

create function public.queue_powderline_region_ski_data()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  should_queue boolean := false;
begin
  if tg_op = 'UPDATE' then
    should_queue := new.bbox is distinct from old.bbox;
    if should_queue and old.ski_data_status = 'processing' then
      raise exception 'Region BBox cannot change while ski data preparation is running.'
        using errcode = '55006';
    end if;
  else
    should_queue := true;
  end if;

  if new.bbox is null then
    new.ski_data_status := 'not_requested';
    new.ski_data_request_id := null;
    new.ski_data_requested_at := null;
    new.ski_data_started_at := null;
    new.ski_data_completed_at := null;
    new.ski_data_error := null;
    new.ski_data_feature_count := null;
    new.ski_data_file_size := null;
  elsif should_queue then
    new.ski_data_status := 'pending';
    new.ski_data_request_id := gen_random_uuid();
    new.ski_data_requested_at := now();
    new.ski_data_started_at := null;
    new.ski_data_completed_at := null;
    new.ski_data_error := null;
    new.ski_data_feature_count := null;
    new.ski_data_file_size := null;
  end if;
  return new;
end;
$$;

create trigger queue_powderline_region_ski_data
  before insert or update of bbox on public.powderline_regions
  for each row execute function public.queue_powderline_region_ski_data();

revoke all on function public.queue_powderline_region_ski_data() from public, anon, authenticated;

-- The Edge Function calls this as service_role. UPDATE ... RETURNING is the lock:
-- only one caller can change a pending (or stale processing) row to processing.
create function public.claim_powderline_region_ski_data(
  p_region_id text,
  p_stale_before timestamptz
)
returns table (
  region_id text,
  bbox jsonb,
  request_id uuid,
  center_lng double precision,
  center_lat double precision
)
language sql
security invoker
set search_path = ''
as $$
  update public.powderline_regions as r
  set ski_data_status = 'processing',
      ski_data_request_id = gen_random_uuid(),
      ski_data_started_at = now(),
      ski_data_completed_at = null,
      ski_data_error = null
  where r.id = p_region_id
    and r.bbox is not null
    and (
      r.ski_data_status in ('pending', 'failed')
      or (r.ski_data_status = 'processing' and r.ski_data_started_at < p_stale_before)
    )
  returning r.id, r.bbox, r.ski_data_request_id, r.center_lng, r.center_lat;
$$;

revoke all on function public.claim_powderline_region_ski_data(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_powderline_region_ski_data(text, timestamptz)
  to service_role;

-- Public read is intentional: the map is available before sign-in. Only the
-- service role used by the Edge Function can write because no object policies
-- grant INSERT/UPDATE/DELETE to anon or authenticated users.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ski-data',
  'ski-data',
  true,
  6291456,
  array['application/geo+json', 'application/json']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
