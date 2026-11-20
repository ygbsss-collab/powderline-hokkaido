-- System admin console: per-admin logical deletion of weather alerts.
-- Deleting only hides an alert for the admin who deleted it. weather_admin_alerts (delivery status, alert_key
-- duplicate protection) and weather_admin_incidents are never modified or deleted.

create table public.weather_admin_alert_hides (
  admin_id uuid not null references public.profiles(id) on delete cascade,
  alert_key text not null references public.weather_admin_alerts(alert_key),
  hidden_at timestamptz not null default now(),
  primary key (admin_id, alert_key)
);
alter table public.weather_admin_alert_hides enable row level security;
revoke all on public.weather_admin_alert_hides from public, anon, authenticated;
grant select, insert on public.weather_admin_alert_hides to service_role;

-- Same output as before (20261120060000), minus the alerts the CALLING admin deleted; unacknowledged counts only the
-- alerts still visible to that admin. 'hidden' = how many this admin deleted.
create or replace function public.weather_admin_overview()
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
        from (select * from public.weather_admin_alerts w
               where not exists (select 1 from public.weather_admin_alert_hides h where h.admin_id = auth.uid() and h.alert_key = w.alert_key)
               order by created_at desc limit 100) a), '[]'::jsonb),
    'unacknowledged', (select count(*) from public.weather_admin_alerts w where w.acknowledged_at is null
        and not exists (select 1 from public.weather_admin_alert_hides h where h.admin_id = auth.uid() and h.alert_key = w.alert_key)),
    'hidden', (select count(*) from public.weather_admin_alert_hides h where h.admin_id = auth.uid()),
    'open_incident', (select to_jsonb(x) from (select incident_key, opened_at, alerted_24h_at, alerted_48h_at, jsonb_array_length(items) as stale_items
        from public.weather_admin_incidents where closed_at is null limit 1) x)
  );
end;
$$;

-- Delete (hide) alerts for the calling admin: the given keys, or every existing alert with p_all. Unknown keys are
-- ignored; repeating is harmless. Returns the number of alerts newly hidden.
create function public.weather_admin_alert_hide(p_alert_keys text[] default null, p_all boolean default false)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  insert into public.weather_admin_alert_hides (admin_id, alert_key)
  select auth.uid(), a.alert_key from public.weather_admin_alerts a
   where p_all or a.alert_key = any(coalesce(p_alert_keys, array[]::text[]))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.weather_admin_alert_hide(text[], boolean) from public, anon;
grant execute on function public.weather_admin_alert_hide(text[], boolean) to authenticated;
