-- POWDERLINE: point the EXISTING Cron job 3 (powderline-weather-watch-dispatch, 15,45 * * * *) at the Edge Function
-- dispatch-weather-watch instead of weather_scheduler.dispatch_current_slot() (PAT via pg_net). SNORKY pattern:
-- the request carries only the scheduler token from Vault. Job 3 stays INACTIVE here; job 4
-- (powderline-weather-watch-response-audit) is not changed and stays inactive (its pg_net audit is not needed:
-- the Edge Function records the GitHub answer itself).
-- *** NOT APPLIED — run only after: 20261121010000 applied, Edge Function deployed, Vault secret
--     powderline_weather_watch_scheduler_token and Edge secret GITHUB_WEATHER_DISPATCH_PAT set. ***
-- Activation is a separate, explicit step (same transaction):
--   update weather_scheduler.settings set enabled = true where id;
--   select cron.alter_job(job_id := 3, active := true);
-- Rollback: select cron.alter_job(job_id := 3, active := false); update weather_scheduler.settings set enabled = false where id;

do $$
begin
  if not exists (select 1 from cron.job where jobid = 3 and jobname = 'powderline-weather-watch-dispatch') then
    raise exception 'Cron job 3 (powderline-weather-watch-dispatch) not found';
  end if;
  perform cron.alter_job(
    job_id := 3,
    command := $cmd$
      select net.http_post(
        url := 'https://lxfsvhwibiaspnaduhri.supabase.co/functions/v1/dispatch-weather-watch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-scheduler-token', (select decrypted_secret from vault.decrypted_secrets where name = 'powderline_weather_watch_scheduler_token')),
        body := '{"source":"supabase-cron"}'::jsonb,
        timeout_milliseconds := 30000);
    $cmd$
  );
  -- never activated by this file
  if exists (select 1 from cron.job where jobid in (3, 4) and active) then
    raise exception 'Cron job 3 / 4 must stay inactive here';
  end if;
end $$;
