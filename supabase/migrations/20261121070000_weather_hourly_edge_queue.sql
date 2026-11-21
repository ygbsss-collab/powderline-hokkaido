-- POWDERLINE hourly weather watch on Supabase Edge (replaces the GitHub Actions runner).
-- One run per UTC hour = one task per region; Supabase Cron ticks the Edge Function `weather-hourly`, every tick
-- processes at most ONE region (Edge CPU / wall-clock limits). Duplicate prevention: one run per hour (primary key),
-- one running task at a time (advisory lock + 'running' check), the existing weather_watch_lease inside the worker.
-- Cross-region outage stop: after p_streak_limit regions in a row with transient API failures the rest of the run is
-- skipped (no further requests; the last valid publication stays). Additive only: no existing object is changed.

create table if not exists weather_scheduler.hourly_runs (
  run_hour timestamptz primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'done', 'stopped')),
  transient_streak integer not null default 0,
  stop_reason text,
  alerts_done boolean not null default false,
  alerts_result jsonb
);

create table if not exists weather_scheduler.hourly_tasks (
  run_hour timestamptz not null references weather_scheduler.hourly_runs(run_hour) on delete cascade,
  ord integer not null,
  region text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'skipped')),
  tries integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  primary key (run_hour, region)
);
create index if not exists hourly_tasks_run_status_idx on weather_scheduler.hourly_tasks (run_hour, status, ord);

alter table weather_scheduler.hourly_runs enable row level security;
alter table weather_scheduler.hourly_tasks enable row level security;
revoke all on weather_scheduler.hourly_runs, weather_scheduler.hourly_tasks from public, anon, authenticated;
grant select, insert, update on weather_scheduler.hourly_runs, weather_scheduler.hourly_tasks to service_role;

-- One tick: create this hour's run (first tick of the hour), close an older unfinished run, recover a stalled task,
-- then hand out the next region, or the once-per-run alert evaluation when every task is finished.
-- Returns {action: 'run'|'finalize'|'busy'|'idle', run_hour, region?, remaining?}.
create or replace function public.weather_hourly_tick(p_regions text[], p_stale_seconds integer default 240, p_max_tries integer default 2)
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_run weather_scheduler.hourly_runs;
  v_region text;
  v_left integer;
begin
  perform pg_advisory_xact_lock(hashtext('powderline.weather_hourly'));

  -- An older run that did not finish within its hour is closed; its pending regions are skipped (next run covers them).
  update weather_scheduler.hourly_tasks t set status = 'skipped', finished_at = now(), result = jsonb_build_object('reason', 'next_hour')
  where t.run_hour < v_hour and t.status in ('pending', 'running');
  update weather_scheduler.hourly_runs r set status = 'stopped', finished_at = coalesce(r.finished_at, now()), stop_reason = coalesce(r.stop_reason, 'next_hour')
  where r.run_hour < v_hour and r.status = 'running';

  insert into weather_scheduler.hourly_runs (run_hour) values (v_hour) on conflict (run_hour) do nothing;
  if found then
    insert into weather_scheduler.hourly_tasks (run_hour, ord, region)
    select v_hour, x.ord::integer, x.region from unnest(p_regions) with ordinality as x(region, ord)
    on conflict do nothing;
  end if;
  select * into v_run from weather_scheduler.hourly_runs where run_hour = v_hour for update;

  -- Stalled task (isolate killed / timed out): retried once, then failed. Its lease expires on its own (short TTL).
  update weather_scheduler.hourly_tasks t
  set status = case when t.tries >= p_max_tries then 'failed' else 'pending' end,
      finished_at = case when t.tries >= p_max_tries then now() else null end,
      result = jsonb_build_object('reason', 'stalled', 'tries', t.tries)
  where t.run_hour = v_hour and t.status = 'running' and t.started_at < now() - make_interval(secs => p_stale_seconds);

  if exists (select 1 from weather_scheduler.hourly_tasks where run_hour = v_hour and status = 'running') then
    return jsonb_build_object('action', 'busy', 'run_hour', v_hour);
  end if;

  if v_run.status = 'running' then
    update weather_scheduler.hourly_tasks t set status = 'running', started_at = now(), tries = t.tries + 1, result = null
    where (t.run_hour, t.region) = (
      select run_hour, region from weather_scheduler.hourly_tasks
      where run_hour = v_hour and status = 'pending' order by ord limit 1)
    returning t.region into v_region;
    if v_region is not null then
      select count(*) into v_left from weather_scheduler.hourly_tasks where run_hour = v_hour and status = 'pending';
      return jsonb_build_object('action', 'run', 'run_hour', v_hour, 'region', v_region, 'remaining', v_left);
    end if;
    update weather_scheduler.hourly_runs set status = 'done', finished_at = now() where run_hour = v_hour;
  end if;

  if not v_run.alerts_done then
    update weather_scheduler.hourly_runs set alerts_done = true where run_hour = v_hour;
    return jsonb_build_object('action', 'finalize', 'run_hour', v_hour);
  end if;
  return jsonb_build_object('action', 'idle', 'run_hour', v_hour);
end;
$$;

-- Result of one region. p_status: 'done' | 'failed' | 'pending' (requeue without counting, e.g. lease busy).
-- p_transient: the region failed only with transient API errors -> streak; any non-transient result resets it.
create or replace function public.weather_hourly_finish(p_run_hour timestamptz, p_region text, p_status text, p_result jsonb,
  p_transient boolean default false, p_streak_limit integer default 3)
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare
  v_streak integer;
  v_stopped boolean := false;
begin
  if p_status not in ('done', 'failed', 'pending') then raise exception 'invalid status %', p_status using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('powderline.weather_hourly'));
  update weather_scheduler.hourly_tasks
  set status = p_status, result = p_result,
      finished_at = case when p_status = 'pending' then null else now() end,
      started_at = case when p_status = 'pending' then null else started_at end
  where run_hour = p_run_hour and region = p_region and status = 'running';
  if not found then return jsonb_build_object('updated', false); end if;
  if p_status = 'pending' then return jsonb_build_object('updated', true, 'requeued', true); end if;

  update weather_scheduler.hourly_runs
  set transient_streak = case when p_transient then transient_streak + 1 else 0 end
  where run_hour = p_run_hour and status = 'running'
  returning transient_streak into v_streak;

  if coalesce(v_streak, 0) >= p_streak_limit then
    update weather_scheduler.hourly_tasks set status = 'skipped', finished_at = now(), result = jsonb_build_object('reason', 'api_unavailable')
    where run_hour = p_run_hour and status = 'pending';
    update weather_scheduler.hourly_runs set status = 'stopped', finished_at = now(), stop_reason = 'api_unavailable'
    where run_hour = p_run_hour;
    v_stopped := true;
  end if;
  return jsonb_build_object('updated', true, 'streak', v_streak, 'stopped', v_stopped);
end;
$$;

create or replace function public.weather_hourly_record_alerts(p_run_hour timestamptz, p_result jsonb)
returns void language sql volatile security definer set search_path to '' as $$
  update weather_scheduler.hourly_runs set alerts_result = p_result where run_hour = p_run_hour;
$$;

revoke all on function public.weather_hourly_tick(text[], integer, integer),
  public.weather_hourly_finish(timestamptz, text, text, jsonb, boolean, integer),
  public.weather_hourly_record_alerts(timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.weather_hourly_tick(text[], integer, integer),
  public.weather_hourly_finish(timestamptz, text, text, jsonb, boolean, integer),
  public.weather_hourly_record_alerts(timestamptz, jsonb) to service_role;
