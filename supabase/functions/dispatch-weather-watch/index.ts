// Supabase Cron (job 3, :15 / :45 UTC) -> GitHub workflow_dispatch of weather-model-watch.yml. Logic: ./handler.ts.
// Deploy (after approval):  supabase functions deploy dispatch-weather-watch --use-api --no-verify-jwt
// Secrets: GITHUB_WEATHER_DISPATCH_PAT (Edge Function secret only). The caller is authenticated by the
// x-scheduler-token header (Vault: powderline_weather_watch_scheduler_token), not by a JWT.
import { withSupabase } from 'npm:@supabase/server@1.9.2'
import { createDispatchHandler } from './handler.ts'

export default {
  fetch: withSupabase({ auth: 'none' }, (request, { supabaseAdmin }) =>
    createDispatchHandler({
      rpc: (fn, args) => supabaseAdmin.rpc(fn, args),
      getEnv: name => Deno.env.get(name),
    })(request)),
}
