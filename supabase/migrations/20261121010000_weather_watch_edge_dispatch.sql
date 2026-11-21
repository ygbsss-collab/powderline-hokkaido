-- POWDERLINE 30-minute weather watch: Supabase Cron -> Edge Function `dispatch-weather-watch` -> GitHub
-- workflow_dispatch (existing weather-model-watch.yml). SNORKY pattern: the cron request carries only the scheduler
-- token (Vault); the GitHub PAT lives ONLY in the Edge Function secret GITHUB_WEATHER_DISPATCH_PAT, never in the
-- database, Vault or the pg_net queue.
-- *** NOT APPLIED — supabase/deferred. Apply only after approval (then move to supabase/migrations). ***
--
-- Reuses the existing (2026-11-20) weather_scheduler objects unchanged: tables slots / attempts / settings,
-- capture_responses(), authorize_retry(). The slot lock + attempt bookkeeping of dispatch_slot() is split into
--   reserve_dispatch()        settings.enabled check, 30-min slot, row lock, "accepted -> never again", state 'ready'
--                             only, new attempt -> 'awaiting_response'   (no PAT, no pg_net)
--   record_dispatch_result()  the Edge Function's GitHub answer, classified exactly like capture_responses()
-- dispatch_slot() / dispatch_current_slot() (PAT via Vault + pg_net) stay in place but are no longer called.
-- Duplicate protection: one slot row per 30 min (primary key) + row lock; a second call for the same slot finds
-- 'awaiting_response' / 'accepted' and is skipped. A retry of a slot needs the existing authorize_retry().

create or replace function weather_scheduler.reserve_dispatch(p_slot_at timestamptz default null)
returns jsonb language plpgsql set search_path to '' as $$
declare v_slot timestamptz; s weather_scheduler.slots%rowtype; v_no integer;
begin
  if not exists (select 1 from weather_scheduler.settings where id and enabled) then
    return jsonb_build_object('action', 'skip', 'reason', 'disabled');
  end if;
  if p_slot_at is null then
    -- the current 30-minute slot (same bins as dispatch_current_slot: :15 / :45 UTC)
    v_slot := date_bin(interval '30 minutes', clock_timestamp(), timestamptz '2000-01-01 00:15:00+00');
    insert into weather_scheduler.slots(slot_at) values (v_slot) on conflict (slot_at) do nothing;
  else
    v_slot := p_slot_at; -- explicit slot = re-dispatch of an EXISTING slot after authorize_retry(); never creates one
  end if;
  perform 1 from weather_scheduler.slots where slot_at = v_slot for update;
  if not found then
    return jsonb_build_object('action', 'skip', 'reason', 'unknown_slot');
  end if;
  perform weather_scheduler.capture_responses(v_slot);
  select * into strict s from weather_scheduler.slots where slot_at = v_slot for update;
  if exists (select 1 from weather_scheduler.attempts where slot_at = v_slot
             and (dispatch_result = 'accepted' or verified_run_id is not null)) then
    return jsonb_build_object('action', 'skip', 'reason', 'already_accepted', 'slot_at', v_slot);
  end if;
  if s.dispatch_state <> 'ready' then
    return jsonb_build_object('action', 'skip', 'reason', 'state_' || s.dispatch_state, 'slot_at', v_slot);
  end if;
  v_no := s.last_attempt + 1;
  insert into weather_scheduler.attempts(slot_at, attempt_no) values (v_slot, v_no);
  update weather_scheduler.slots set last_attempt = v_no, dispatch_state = 'awaiting_response' where slot_at = v_slot;
  return jsonb_build_object('action', 'dispatch', 'slot_at', v_slot, 'attempt_no', v_no, 'correlation_id', s.correlation_id);
end;
$$;

-- GitHub answer of one attempt (called by the Edge Function right after its request). Classification and slot
-- state follow capture_responses(): 200/204 accepted, 400/401/403/404/405/410/422/429 rejected, anything else or
-- no HTTP answer (timeout / network error) ambiguous. A late result for an attempt already resolved is ignored.
create or replace function weather_scheduler.record_dispatch_result(
  p_slot_at timestamptz, p_attempt_no integer, p_correlation_id uuid, p_transport text,
  p_http_status integer default null, p_reported_run_id bigint default null)
returns text language plpgsql set search_path to '' as $$
declare s weather_scheduler.slots%rowtype; v_result text;
begin
  if p_transport is null or p_transport not in ('response', 'timeout', 'network_error') then
    raise exception 'Invalid transport state';
  end if;
  select * into s from weather_scheduler.slots where slot_at = p_slot_at for update;
  if not found or s.correlation_id is distinct from p_correlation_id then
    raise exception 'Unknown dispatch slot';
  end if;
  perform 1 from weather_scheduler.attempts
  where slot_at = p_slot_at and attempt_no = p_attempt_no and transport_state in ('pending', 'response_missing')
  for update;
  if not found then
    return 'already_recorded';
  end if;
  v_result := case
    when p_transport <> 'response' then 'ambiguous'
    when p_http_status in (200, 204) then 'accepted'
    when p_http_status in (400, 401, 403, 404, 405, 410, 422, 429) then 'rejected'
    else 'ambiguous' end;
  update weather_scheduler.attempts
  set response_at = clock_timestamp(), response_observed_at = clock_timestamp(),
      http_status = case when p_transport = 'response' then p_http_status end,
      transport_state = p_transport, dispatch_result = v_result,
      reported_run_id = case when v_result = 'accepted' and p_http_status = 200 and p_reported_run_id > 0 then p_reported_run_id end
  where slot_at = p_slot_at and attempt_no = p_attempt_no;
  update weather_scheduler.slots ss set dispatch_state = case
    when ss.dispatch_state = 'run_verified' or exists (
      select 1 from weather_scheduler.attempts a where a.slot_at = ss.slot_at and a.verified_run_id is not null) then 'run_verified'
    when exists (select 1 from weather_scheduler.attempts a
      where a.slot_at = ss.slot_at and a.dispatch_result = 'accepted') then 'accepted'
    when ss.last_attempt = p_attempt_no then v_result
    else ss.dispatch_state end
  where ss.slot_at = p_slot_at;
  return v_result;
end;
$$;

revoke all on function weather_scheduler.reserve_dispatch(timestamptz),
  weather_scheduler.record_dispatch_result(timestamptz, integer, uuid, text, integer, bigint) from public;

-- ---- Edge Function entry points (weather_scheduler is not exposed through the Data API) ----
-- service_role only; anon / authenticated can never reserve, record or test tokens.
create or replace function public.weather_watch_validate_scheduler_token(candidate text)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce(length(candidate) >= 32 and exists (
    select 1 from vault.decrypted_secrets
    where name = 'powderline_weather_watch_scheduler_token' and decrypted_secret = candidate), false);
$$;
create or replace function public.weather_watch_reserve_dispatch(p_slot_at timestamptz default null)
returns jsonb language sql volatile security definer set search_path to '' as $$
  select weather_scheduler.reserve_dispatch(p_slot_at);
$$;
create or replace function public.weather_watch_record_dispatch(
  p_slot_at timestamptz, p_attempt_no integer, p_correlation_id uuid, p_transport text,
  p_http_status integer default null, p_reported_run_id bigint default null)
returns text language sql volatile security definer set search_path to '' as $$
  select weather_scheduler.record_dispatch_result(p_slot_at, p_attempt_no, p_correlation_id, p_transport, p_http_status, p_reported_run_id);
$$;
revoke all on function public.weather_watch_validate_scheduler_token(text), public.weather_watch_reserve_dispatch(timestamptz),
  public.weather_watch_record_dispatch(timestamptz, integer, uuid, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.weather_watch_validate_scheduler_token(text), public.weather_watch_reserve_dispatch(timestamptz),
  public.weather_watch_record_dispatch(timestamptz, integer, uuid, text, integer, bigint) to service_role;
