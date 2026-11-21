// POWDERLINE hourly weather watch (Supabase Cron -> this function; no GitHub Actions).
// Every tick: weather_hourly_tick hands out at most ONE region (or the once-per-run alert evaluation); the work runs as
// a background task (EdgeRuntime.waitUntil) so the scheduler call returns at once. Caller must present the existing
// scheduler token (Vault powderline_weather_watch_scheduler_token, checked by weather_watch_validate_scheduler_token).
// Body: {} = tick | {"action":"region","region":"kiroro","publish":false} = one manual region run (validation).
// The token value and the service key are never logged or returned.
// @ts-nocheck  Deno Edge runtime; the imported pipeline is plain ESM JavaScript.
import './node-globals.ts';
import {runRegion, finalizeAlerts, supabaseStores, REGION_ORDER} from './worker.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json'},
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

// Weighted forecast usage of this month before today (UTC), from the existing daily usage table.
async function monthUsedBeforeToday(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const first = `${today.slice(0, 7)}-01`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/weather_api_usage_daily?select=forecast_weighted&day=gte.${first}&day=lt.${today}`, {
    headers: {apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`}
  });
  if (!res.ok) throw new Error(`usage: HTTP ${res.status}`);
  return (await res.json()).reduce((a: number, r: {forecast_weighted: number}) => a + (Number(r.forecast_weighted) || 0), 0);
}

async function processRegion(runHour: string | null, region: string, publish = true) {
  const t0 = Date.now();
  let summary: Record<string, unknown>, status = 'done', transient = false;
  try {
    const out = await runRegion(region, {stores: supabaseStores(SUPABASE_URL, SERVICE_KEY), monthUsedBeforeToday: await monthUsedBeforeToday(), publish});
    transient = out.transient === true;
    if (out.status === 'lease_busy') status = 'pending';            // another runner holds the lease: requeue
    else if (out.status !== 'committed') status = 'failed';
    summary = {...out, ms: Date.now() - t0};
  } catch (e) {
    status = 'failed';
    summary = {region, error: String((e as Error)?.message || e).slice(0, 300), ms: Date.now() - t0};
  }
  console.log(JSON.stringify({weather_hourly: 'region', run_hour: runHour, status, ...summary}));
  if (runHour) await rpc('weather_hourly_finish', {p_run_hour: runHour, p_region: region, p_status: status, p_result: summary, p_transient: transient});
  return {status, ...summary};
}

async function finalize(runHour: string) {
  let result: Record<string, unknown>;
  try { result = await finalizeAlerts({stores: supabaseStores(SUPABASE_URL, SERVICE_KEY)}); }
  catch (e) { result = {status: 'error', error: String((e as Error)?.message || e).slice(0, 300)}; }
  console.log(JSON.stringify({weather_hourly: 'finalize', run_hour: runHour, ...result}));
  await rpc('weather_hourly_record_alerts', {p_run_hour: runHour, p_result: result});
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, {error: 'method_not_allowed'});
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, {error: 'server_not_configured'});
  const token = req.headers.get('x-scheduler-token') || '';
  let valid = false;
  try { valid = (await rpc('weather_watch_validate_scheduler_token', {candidate: token})) === true; } catch { valid = false; }
  if (!valid) return json(401, {error: 'unauthorized'});
  const body = await req.json().catch(() => ({}));

  if (body?.action === 'region') { // manual validation run (bypasses the queue; the lease still prevents overlap)
    const region = String(body.region || '');
    if (!REGION_ORDER.includes(region)) return json(400, {error: 'unknown_region'});
    return json(200, await processRegion(null, region, body.publish !== false));
  }

  const tick = await rpc('weather_hourly_tick', {p_regions: REGION_ORDER});
  if (tick?.action === 'run') EdgeRuntime.waitUntil(processRegion(tick.run_hour, tick.region));
  else if (tick?.action === 'finalize') EdgeRuntime.waitUntil(finalize(tick.run_hour));
  return json(202, tick);
});
