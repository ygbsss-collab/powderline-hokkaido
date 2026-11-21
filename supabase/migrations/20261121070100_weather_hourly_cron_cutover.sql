-- Cutover: the weather watch runs on Supabase Edge (`weather-hourly`) instead of GitHub Actions.
-- 1. Cron job 3 (dispatch to GitHub workflow_dispatch) is deactivated, and the dispatch scheduler is disabled, so
--    nothing starts the GitHub weather workflow any more (job and settings are kept, not deleted: rollback =
--    cron.alter_job(3, active := true) + enabled = true, and unschedule the job below).
-- 2. New job `powderline-weather-hourly`: one run per hour; minutes 5-54 each tick processes at most one region
--    (15 regions + one alert/housekeeping step per hour), idle ticks cost no API request.
--    Same scheduler token (Vault) as job 3; the function answers at once (202) and works in the background.
begin;
select cron.alter_job(3, active := false);
update weather_scheduler.settings set enabled = false where id;

select cron.unschedule(jobid) from cron.job where jobname = 'powderline-weather-hourly';
select cron.schedule('powderline-weather-hourly', '5-54 * * * *', $cmd$
  select net.http_post(
    url := 'https://lxfsvhwibiaspnaduhri.supabase.co/functions/v1/weather-hourly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-token', (select decrypted_secret from vault.decrypted_secrets where name = 'powderline_weather_watch_scheduler_token')),
    body := '{"source":"supabase-cron"}'::jsonb,
    timeout_milliseconds := 30000);
$cmd$);
commit;
