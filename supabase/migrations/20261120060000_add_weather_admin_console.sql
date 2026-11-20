-- Admin console for the weather system (4th admin card). Minimal change on top of 20261120040000:
--   * weather_admin_alerts: acknowledgement columns (who / when an admin confirmed an alert)
--   * two SECURITY DEFINER RPCs gated by public.is_admin(); the weather_* tables stay closed to app roles.
-- Sending (status pending/sent/...) is untouched: acknowledgement is independent of delivery.

alter table public.weather_admin_alerts
  add column acknowledged_at timestamptz,
  add column acknowledged_by uuid references public.profiles(id) on delete set null;
create index weather_admin_alerts_unacked_idx on public.weather_admin_alerts (created_at) where acknowledged_at is null;

-- Everything the console shows, in one call. Non-admins get 42501.
create function public.weather_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'region_id', i.region_id, 'model', i.model, 'point', i.point, 'status', i.status,
        'last_success_at', i.last_success_at, 'run_available_at', i.raw_run_available_at, 'last_attempt_at', i.last_attempt_at,
        'attempts', i.attempts, 'next_attempt_at', i.next_attempt_at, 'last_error', left(i.last_error, 200))
        order by i.region_id, i.model, i.point) from public.weather_collect_items i), '[]'::jsonb),
    'publish', coalesce((select jsonb_agg(jsonb_build_object('region_id', p.region_id, 'published_at', p.published_at) order by p.region_id)
        from public.weather_region_publish p), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'alert_key', a.alert_key, 'kind', a.kind, 'title', a.title, 'body', a.body, 'items', a.items, 'status', a.status,
        'created_at', a.created_at, 'sent_at', a.sent_at, 'acknowledged_at', a.acknowledged_at,
        'acknowledged_by', (select nickname from public.profiles where id = a.acknowledged_by)) order by a.created_at desc)
        from (select * from public.weather_admin_alerts order by created_at desc limit 100) a), '[]'::jsonb),
    'unacknowledged', (select count(*) from public.weather_admin_alerts where acknowledged_at is null),
    'open_incident', (select to_jsonb(x) from (select incident_key, opened_at, alerted_24h_at, alerted_48h_at, jsonb_array_length(items) as stale_items
        from public.weather_admin_incidents where closed_at is null limit 1) x)
  );
end;
$$;

-- Acknowledge one alert (idempotent: the first acknowledgement is kept). Returns false for an unknown key.
create function public.weather_admin_alert_ack(p_alert_key text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update public.weather_admin_alerts set acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, auth.uid())
   where alert_key = p_alert_key;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.weather_admin_overview(), public.weather_admin_alert_ack(text) from public, anon;
grant execute on function public.weather_admin_overview(), public.weather_admin_alert_ack(text) to authenticated;
