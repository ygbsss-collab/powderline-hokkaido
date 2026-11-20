-- Weather model watch (30-minute multi-model check): state, request log, publication records, admin alerts, buckets.
-- Mirrors the state JSON of scripts/weather-model-watch.mjs (stateToRows / rowsToState / createSupabaseStateStore);
-- createMemoryStore() in the same file is the executable specification of these functions' behaviour.
-- Written only by the collector with the service role; the app never reads these tables (it keeps reading the
-- published JSON files). Verified on production in a rolled-back transaction (29 checks) before this migration.
--
-- Times are never mixed:
--   run_initialisation_at / run_available_at : model run (Open-Meteo meta.json)
--   raw_collected_at / pending_collected_at  : when the watch fetched that original
--   weather_region_publish.published_at      : final calculation / publication (= service JSON fetched_at)

-- Last VERIFIED run per model (meta failures / unverified availability never replace it).
create table public.weather_model_runs_latest (
  model text primary key check (model in ('jma_msm', 'ecmwf_ifs025', 'gfs_seamless')),
  run_key text not null,                         -- "<meta name>@<initialisation ISO>|..." (GFS: two components)
  components jsonb not null default '{}'::jsonb,
  run_initialisation_at timestamptz,
  run_available_at timestamptz,
  availability_verified boolean not null default false,
  update_interval_h numeric,
  checked_at timestamptz not null,
  meta_status text not null check (meta_status in ('identified', 'meta_unavailable', 'availability_unverified', 'regressed', 'not_identifiable'))
);

-- One row per region × model × point. Confirmed original (usable), pending original (recovered during a meta
-- outage, NOT usable until confirmed) and failure state are separate column groups.
create table public.weather_collect_items (
  region_id text not null,
  model text not null check (model in ('jma_msm', 'ecmwf_ifs025', 'gfs_seamless', 'best_match')), -- best_match: observed from the 2 h pipeline
  point text not null check (point in ('summit', 'mid', 'base')),
  status text not null check (status in ('ok', 'failed', 'unconfirmed')),
  first_seen_at timestamptz,                     -- for "never updated for 24 h" alerts of items without any success
  run_key text not null,                         -- run of the last attempt
  -- confirmed original (the only one used for calculation / publication)
  last_success_run_key text,
  run_initialisation_at timestamptz,
  last_success_at timestamptz,
  raw_run_key text,                              -- run of THIS original (never inferred from last_success_run_key)
  raw_run_available_at timestamptz,              -- for the freshness check
  raw_path text,                                 -- bucket weather-raw, content-addressed: .../<raw_sha256>.json
  raw_sha256 text check (raw_sha256 is null or raw_sha256 ~ '^[0-9a-f]{64}$'),
  raw_bytes integer,
  raw_collected_at timestamptz,
  -- pending (unconfirmed) original
  pending_run_key text,
  pending_run_available_at timestamptz,
  pending_raw_path text,
  pending_raw_sha256 text check (pending_raw_sha256 is null or pending_raw_sha256 ~ '^[0-9a-f]{64}$'),
  pending_raw_bytes integer,
  pending_collected_at timestamptz,
  -- failure side
  attempts integer not null default 0 check (attempts >= 0),
  failures_total integer not null default 0 check (failures_total >= 0),
  next_attempt_at timestamptz,                   -- backoff; null = next check
  last_attempt_at timestamptz,
  last_error text,
  primary key (region_id, model, point),
  -- a success always has its own verified original, and the original is of exactly that run
  check ((raw_path is null) = (raw_run_key is null) and (raw_path is null) = (raw_sha256 is null)),
  check (raw_run_key is not distinct from last_success_run_key),
  check (raw_path is null or raw_path like '%/' || raw_sha256 || '.json'),
  check ((pending_raw_path is null) = (pending_run_key is null) and (pending_raw_path is null) = (pending_raw_sha256 is null)),
  check (pending_raw_path is null or pending_raw_path like '%/' || pending_raw_sha256 || '.json'),
  check (status <> 'unconfirmed' or pending_raw_path is not null)
);
create index weather_collect_items_failed_idx on public.weather_collect_items (next_attempt_at) where status = 'failed';

-- Request log: one row per real HTTP attempt (meta / forecast) or check. request_id makes adds idempotent.
create table public.weather_api_requests (
  request_id text primary key,
  day date not null,
  kind text not null check (kind in ('check', 'meta', 'forecast')),
  weighted numeric not null default 0 check (weighted >= 0),
  failed boolean not null default false,
  holder text,
  recorded_at timestamptz not null default now()
);
create index weather_api_requests_day_idx on public.weather_api_requests (day);

-- Daily totals; changed only by weather_usage_add (increments for newly logged requests).
create table public.weather_api_usage_daily (
  day date primary key,
  checks integer not null default 0 check (checks >= 0),
  meta_requests integer not null default 0 check (meta_requests >= 0),
  meta_failed integer not null default 0 check (meta_failed >= 0),
  forecast_requests integer not null default 0 check (forecast_requests >= 0),
  forecast_weighted numeric not null default 0 check (forecast_weighted >= 0)
);

-- Final calculation / publication per region: exactly one time; inputs keep each model's run and collection time.
create table public.weather_region_publish (
  region_id text primary key,
  published_at timestamptz not null,
  input_signature text not null,                 -- unchanged signature -> nothing new to publish
  inputs jsonb not null default '{}'::jsonb
);

-- Admin staleness alerts (any of the 162 items not updated for 24 h; again at 48 h; recovery). One open incident at a
-- time; alert_key makes every alert unique (no duplicate sending). Sending is a separate, approved step.
create table public.weather_admin_incidents (
  incident_key text primary key,                 -- opened_at ISO
  opened_at timestamptz not null,
  closed_at timestamptz,
  alerted_24h_at timestamptz,
  alerted_48h_at timestamptz,
  items jsonb not null default '[]'::jsonb       -- current stale items [{region, model, point, age_h}]
);
create unique index weather_admin_incidents_one_open on public.weather_admin_incidents ((true)) where closed_at is null;

create table public.weather_admin_alerts (
  alert_key text primary key,                    -- "<incident_key>:stale_24h" | ":stale_48h" | ":recovered"
  incident_key text not null references public.weather_admin_incidents(incident_key),
  kind text not null check (kind in ('stale_24h', 'stale_48h', 'recovered')),
  title text not null,
  body text not null,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);
create index weather_admin_alerts_pending_idx on public.weather_admin_alerts (created_at) where status in ('pending', 'failed');

-- Single-runner lease for the 30-minute check (one row).
create table public.weather_watch_lease (
  id boolean primary key default true check (id),
  holder text,
  expires_at timestamptz not null default '-infinity'
);
insert into public.weather_watch_lease (id) values (true);

-- true when p_holder now holds the lease (free, expired, or already its own -> renewal).
-- clock_timestamp(): real time, not the transaction start.
create function public.weather_watch_lease_acquire(p_holder text, p_ttl_seconds integer)
returns boolean language sql volatile security invoker set search_path = public as $$
  with taken as (
    update public.weather_watch_lease
       set holder = p_holder, expires_at = clock_timestamp() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 3600))
     where id and (expires_at < clock_timestamp() or holder = p_holder)
    returning 1)
  select exists (select 1 from taken); -- false (not null) when another runner holds it
$$;

create function public.weather_watch_lease_release(p_holder text)
returns void language sql volatile security invoker set search_path = public as $$
  update public.weather_watch_lease set holder = null, expires_at = '-infinity' where id and holder = p_holder;
$$;

-- State writes of one check in one transaction; refused unless p_holder still holds an unexpired lease.
-- Usage is NOT written here (weather_usage_add), so a refused commit never loses counted requests.
create function public.weather_watch_commit(p_holder text, p_models jsonb, p_items jsonb)
returns void language plpgsql volatile security invoker set search_path = public as $$
begin
  perform 1 from public.weather_watch_lease where id and holder = p_holder and expires_at > clock_timestamp() for update;
  if not found then raise exception 'weather watch lease not held by %', p_holder using errcode = 'P0001'; end if;

  insert into public.weather_model_runs_latest
  select * from jsonb_populate_recordset(null::public.weather_model_runs_latest, coalesce(p_models, '[]'::jsonb))
  on conflict (model) do update set run_key = excluded.run_key, components = excluded.components,
    run_initialisation_at = excluded.run_initialisation_at, run_available_at = excluded.run_available_at,
    availability_verified = excluded.availability_verified, update_interval_h = excluded.update_interval_h,
    checked_at = excluded.checked_at, meta_status = excluded.meta_status;

  insert into public.weather_collect_items
  select * from jsonb_populate_recordset(null::public.weather_collect_items, coalesce(p_items, '[]'::jsonb))
  on conflict (region_id, model, point) do update set status = excluded.status, run_key = excluded.run_key,
    last_success_run_key = excluded.last_success_run_key, run_initialisation_at = excluded.run_initialisation_at,
    last_success_at = excluded.last_success_at, raw_run_key = excluded.raw_run_key, raw_run_available_at = excluded.raw_run_available_at,
    raw_path = excluded.raw_path, raw_sha256 = excluded.raw_sha256, raw_bytes = excluded.raw_bytes, raw_collected_at = excluded.raw_collected_at,
    pending_run_key = excluded.pending_run_key, pending_run_available_at = excluded.pending_run_available_at,
    pending_raw_path = excluded.pending_raw_path, pending_raw_sha256 = excluded.pending_raw_sha256,
    pending_raw_bytes = excluded.pending_raw_bytes, pending_collected_at = excluded.pending_collected_at,
    first_seen_at = coalesce(public.weather_collect_items.first_seen_at, excluded.first_seen_at),
    attempts = excluded.attempts, failures_total = excluded.failures_total, next_attempt_at = excluded.next_attempt_at,
    last_attempt_at = excluded.last_attempt_at, last_error = excluded.last_error;
end;
$$;

-- Idempotent, concurrency-safe usage: only request ids inserted by THIS call are added to the daily totals. A
-- concurrent insert of the same id waits on the unique index and then does nothing; increments lock the day row.
-- Returns the number of newly counted requests.
create function public.weather_usage_add(p_requests jsonb)
returns integer language sql volatile security invoker set search_path = public as $$
  with ins as (
    insert into public.weather_api_requests (request_id, day, kind, weighted, failed, holder)
    select r.request_id, r.day, r.kind, coalesce(r.weighted, 0), coalesce(r.failed, false), r.holder
      from jsonb_to_recordset(coalesce(p_requests, '[]'::jsonb)) as r(request_id text, day date, kind text, weighted numeric, failed boolean, holder text)
    on conflict (request_id) do nothing
    returning day, kind, weighted, failed),
  agg as (
    select day,
           count(*) filter (where kind = 'check')::int as checks,
           count(*) filter (where kind = 'meta')::int as meta_requests,
           count(*) filter (where kind = 'meta' and failed)::int as meta_failed,
           count(*) filter (where kind = 'forecast')::int as forecast_requests,
           coalesce(sum(weighted) filter (where kind = 'forecast'), 0) as forecast_weighted
      from ins group by day),
  upd as (
    insert into public.weather_api_usage_daily as u (day, checks, meta_requests, meta_failed, forecast_requests, forecast_weighted)
    select day, checks, meta_requests, meta_failed, forecast_requests, forecast_weighted from agg
    on conflict (day) do update set checks = u.checks + excluded.checks, meta_requests = u.meta_requests + excluded.meta_requests,
      meta_failed = u.meta_failed + excluded.meta_failed, forecast_requests = u.forecast_requests + excluded.forecast_requests,
      forecast_weighted = u.forecast_weighted + excluded.forecast_weighted
    returning 1)
  select coalesce((select sum(checks + meta_requests + forecast_requests) from agg), 0)::int;
$$;

-- Incident + its new alerts in one transaction (lease holder only). Existing alert keys are never re-inserted.
create function public.weather_admin_alerts_apply(p_holder text, p_incident jsonb, p_alerts jsonb)
returns integer language plpgsql volatile security invoker set search_path = public as $$
declare n integer;
begin
  perform 1 from public.weather_watch_lease where id and holder = p_holder and expires_at > clock_timestamp();
  if not found then raise exception 'weather watch lease not held by %', p_holder using errcode = 'P0001'; end if;
  if p_incident is not null then
    insert into public.weather_admin_incidents
    select * from jsonb_populate_record(null::public.weather_admin_incidents, p_incident)
    on conflict (incident_key) do update set closed_at = excluded.closed_at,
      alerted_24h_at = coalesce(public.weather_admin_incidents.alerted_24h_at, excluded.alerted_24h_at),
      alerted_48h_at = coalesce(public.weather_admin_incidents.alerted_48h_at, excluded.alerted_48h_at), items = excluded.items;
  end if;
  insert into public.weather_admin_alerts (alert_key, incident_key, kind, title, body, items)
  select a.alert_key, a.incident_key, a.kind, a.title, a.body, coalesce(a.items, '[]'::jsonb)
    from jsonb_to_recordset(coalesce(p_alerts, '[]'::jsonb)) as a(alert_key text, incident_key text, kind text, title text, body text, items jsonb)
  on conflict (alert_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Housekeeping: request-log rows older than p_keep_days (daily totals stay). Only this feature's own log table.
create function public.weather_watch_cleanup(p_keep_days integer default 3)
returns integer language sql volatile security invoker set search_path = public as $$
  with d as (delete from public.weather_api_requests where day < (now() at time zone 'utc')::date - greatest(p_keep_days, 1) returning 1)
  select count(*)::int from d;
$$;

-- Publication record; only the lease holder, and never moves published_at backwards.
create function public.weather_region_publish_record(p_holder text, p_region_id text, p_published_at timestamptz, p_input_signature text, p_inputs jsonb)
returns void language plpgsql volatile security invoker set search_path = public as $$
begin
  perform 1 from public.weather_watch_lease where id and holder = p_holder and expires_at > clock_timestamp();
  if not found then raise exception 'weather watch lease not held by %', p_holder using errcode = 'P0001'; end if;
  insert into public.weather_region_publish as p (region_id, published_at, input_signature, inputs)
  values (p_region_id, p_published_at, p_input_signature, p_inputs)
  on conflict (region_id) do update set published_at = excluded.published_at, input_signature = excluded.input_signature, inputs = excluded.inputs
  where excluded.published_at >= p.published_at;
end;
$$;

alter table public.weather_model_runs_latest enable row level security;
alter table public.weather_collect_items enable row level security;
alter table public.weather_api_requests enable row level security;
alter table public.weather_api_usage_daily enable row level security;
alter table public.weather_region_publish enable row level security;
alter table public.weather_watch_lease enable row level security;
alter table public.weather_admin_incidents enable row level security;
alter table public.weather_admin_alerts enable row level security;
revoke all on public.weather_model_runs_latest, public.weather_collect_items, public.weather_api_requests, public.weather_api_usage_daily,
  public.weather_region_publish, public.weather_watch_lease, public.weather_admin_incidents, public.weather_admin_alerts from public, anon, authenticated;
grant select, insert, update on public.weather_model_runs_latest, public.weather_collect_items, public.weather_api_requests,
  public.weather_api_usage_daily, public.weather_region_publish, public.weather_watch_lease, public.weather_admin_incidents,
  public.weather_admin_alerts to service_role;
grant delete on public.weather_api_requests to service_role;
revoke all on function public.weather_watch_lease_acquire(text, integer), public.weather_watch_lease_release(text),
  public.weather_watch_commit(text, jsonb, jsonb), public.weather_usage_add(jsonb),
  public.weather_region_publish_record(text, text, timestamptz, text, jsonb), public.weather_admin_alerts_apply(text, jsonb, jsonb),
  public.weather_watch_cleanup(integer) from public, anon, authenticated;
grant execute on function public.weather_watch_lease_acquire(text, integer), public.weather_watch_lease_release(text),
  public.weather_watch_commit(text, jsonb, jsonb), public.weather_usage_add(jsonb),
  public.weather_region_publish_record(text, text, timestamptz, text, jsonb), public.weather_admin_alerts_apply(text, jsonb, jsonb),
  public.weather_watch_cleanup(integer) to service_role;

-- Storage: originals (private, service role only) and the app-facing final files + manifest (public read).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('weather-raw', 'weather-raw', false, 5242880, array['application/json']),
  ('weather-public', 'weather-public', true, 5242880, array['application/json'])
on conflict (id) do nothing;
-- No storage.objects policies: anon / authenticated cannot write either bucket; the public bucket is readable through
-- /storage/v1/object/public/weather-public/... only. Originals: upload (x-upsert false) -> download + sha256 verify ->
-- only then referenced. Removed only when unreferenced by raw_path / pending_raw_path AND older than 72 h
-- (rawPruneCandidates()); request-log rows older than 3 days by weather_watch_cleanup().
