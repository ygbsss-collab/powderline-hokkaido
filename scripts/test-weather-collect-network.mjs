// Network policy of scripts/weather-collect.mjs (no real requests: stub fetch + virtual clock):
// limited retry of transient failures only, concrete cause logging, per-region time budget, and "a failed / partial
// collection never replaces the published file". Writes work/weather/weather-collect-network-tests.json.
import {mkdirSync, writeFileSync, statSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {request, describeFetchError, collectRegion, publishRegion, publishBlockedReason, MAX_ATTEMPTS, REGION_BUDGET_MS, REQUEST_TIMEOUT_MS} from './weather-collect.mjs';
import {weatherRegionById} from './weather-regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});

// undici-style errors
const netError = code => Object.assign(new TypeError('fetch failed'), {cause: Object.assign(new Error(`read ${code}`), {code})});
const timeoutError = () => Object.assign(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
const json = (status, body, headers = {}) => ({ok: status >= 200 && status < 300, status, headers: {get: k => headers[k.toLowerCase()] ?? null}, json: async () => body});
const badBody = () => ({ok: true, status: 200, headers: {get: () => null}, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); }});

function harness(script, {deadline = Infinity} = {}) {
  let clock = 0;
  const sleeps = [], calls = [], logs = [];
  const fetchImpl = async (url, opts) => {
    calls.push({url: String(url), timeout: opts?.signal ? true : false});
    clock += 300;
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step instanceof Error || step instanceof DOMException) throw step;
    return typeof step === 'function' ? step() : step;
  };
  return {fetchImpl, sleep: async ms => { sleeps.push(ms); clock += ms; }, now: () => clock, random: () => 0, deadline, log: e => logs.push(e), sleeps, calls, logs};
}
const loc = {point_id: 'test:summit', point_type: 'summit', latitude: 43.1, longitude: 141.0, elevation: 600};
const settings = {pastDays: 3, timezone: 'Asia/Tokyo'};
const okBody = {latitude: 43.1, longitude: 141.0, elevation: 600, utc_offset_seconds: 32400, timezone: 'Asia/Tokyo', hourly: {time: []}, daily: {time: []}};

// ---- describeFetchError ----
{
  const d = describeFetchError(netError('ECONNRESET'));
  check('describe.econnreset', d.kind === 'network' && d.code === 'ECONNRESET' && d.transient && /fetch failed <- Error: read ECONNRESET/.test(d.message), d);
  const t = describeFetchError(timeoutError());
  check('describe.timeout', t.kind === 'timeout' && t.transient, t);
  const c = describeFetchError(Object.assign(new TypeError('fetch failed'), {cause: Object.assign(new Error('Connect Timeout Error'), {code: 'UND_ERR_CONNECT_TIMEOUT'})}));
  check('describe.undici_connect_timeout', c.code === 'UND_ERR_CONNECT_TIMEOUT' && c.transient);
  const bare = describeFetchError(new TypeError('fetch failed'));
  check('describe.bare_fetch_failed_is_transient', bare.kind === 'network' && bare.transient);
  const x = describeFetchError(new TypeError('Invalid URL'));
  check('describe.programming_error_not_transient', !x.transient && x.kind === 'exception');
  const cert = describeFetchError(Object.assign(new TypeError('fetch failed'), {cause: Object.assign(new Error('certificate has expired'), {code: 'CERT_HAS_EXPIRED'})}));
  check('describe.tls_cert_error_not_retried', !cert.transient && cert.code === 'CERT_HAS_EXPIRED');
}

// ---- request(): retry policy ----
{
  const h = harness([netError('ECONNRESET'), json(200, okBody)]);
  const r = await request(loc, settings, h);
  check('retry.transient_then_ok', r.ok && r.attempts === 2 && h.sleeps.length === 1 && h.sleeps[0] === 2000, {attempts: r.attempts, sleeps: h.sleeps});
  check('retry.failed_attempt_logged_with_code', h.logs.length === 1 && h.logs[0].code === 'ECONNRESET' && /retry in/.test(h.logs[0].next), {log: h.logs[0]});
}
{
  const h = harness([netError('ECONNRESET')]);
  const r = await request(loc, settings, h);
  check('retry.max_attempts', !r.ok && r.attempts === MAX_ATTEMPTS && h.calls.length === MAX_ATTEMPTS && r.gave_up === 'max_attempts' && r.code === 'ECONNRESET'
    && r.attempt_log.length === MAX_ATTEMPTS, {attempts: r.attempts, gave_up: r.gave_up});
  check('retry.backoff_2s_6s', JSON.stringify(h.sleeps) === JSON.stringify([2000, 6000]), {sleeps: h.sleeps});
}
{
  const h = harness([json(400, {error: true, reason: 'Cannot initialize WeatherVariable from invalid String value'})]);
  const r = await request(loc, settings, h);
  check('no_retry.http_400', !r.ok && r.attempts === 1 && r.status === 400 && r.gave_up === 'not_retryable' && /invalid String/.test(r.error));
}
{
  const h = harness([new TypeError('Invalid URL')]);
  const r = await request(loc, settings, h);
  check('no_retry.programming_error', !r.ok && r.attempts === 1 && r.kind === 'exception');
}
{
  const h = harness([json(429, {error: true, reason: 'Minutely API request limit exceeded'}, {'retry-after': '10'}), json(200, okBody)]);
  const r = await request(loc, settings, h);
  check('retry.http_429_retry_after', r.ok && r.attempts === 2 && h.sleeps[0] === 10000, {sleeps: h.sleeps});
}
{
  const h = harness([json(429, {error: true}, {'retry-after': '3600'}), json(200, okBody)]);
  await request(loc, settings, h);
  check('retry.retry_after_capped_15s', h.sleeps[0] === 15000, {sleeps: h.sleeps});
}
{
  const h = harness([json(503, null), json(502, null), json(200, okBody)]);
  const r = await request(loc, settings, h);
  check('retry.http_5xx', r.ok && r.attempts === 3);
}
{
  const h = harness([badBody(), json(200, okBody)]);
  const r = await request(loc, settings, h);
  check('retry.truncated_200_body', r.ok && r.attempts === 2 && r.attempt_log[0].kind === 'invalid_body', {log: r.attempt_log});
}
{
  const h = harness([timeoutError(), json(200, okBody)]);
  const r = await request(loc, settings, h);
  check('retry.timeout', r.ok && r.attempt_log[0].kind === 'timeout');
}
{ // budget: 5 s left -> no retry that would overrun it
  const h = harness([netError('ETIMEDOUT')], {deadline: 5000});
  const r = await request(loc, settings, h);
  check('budget.stops_retry', !r.ok && r.gave_up === 'region_budget' && r.attempts <= 2, {attempts: r.attempts, sleeps: h.sleeps});
}
check('budget.values', REQUEST_TIMEOUT_MS === 20000 && REGION_BUDGET_MS === 120000 && MAX_ATTEMPTS === 3);
// worst case per region (3 points, all failing, every attempt hitting the timeout) stays below the pipeline's 5 min kill
{
  let clock = 0;
  const slow = async () => { clock += REQUEST_TIMEOUT_MS; throw timeoutError(); };
  const start = clock, deadline = start + REGION_BUDGET_MS;
  for (const p of ['summit', 'mid', 'base']) await request({...loc, point_id: `t:${p}`}, settings, {fetchImpl: slow, sleep: async ms => { clock += ms; }, now: () => clock, random: () => 1, deadline});
  check('budget.worst_case_region_under_pipeline_kill', clock - start <= REGION_BUDGET_MS + REQUEST_TIMEOUT_MS && clock - start < 5 * 60e3, {ms: clock - start});
}

// ---- collectRegion + publish guard: the four regions that failed in run 44526440045 ----
const failedInCi = ['region_huyvh4ar', 'region_wxkfnu11', 'region_tsbh66ti', 'region_q49t34uk'];
const quietErr = console.error; console.error = () => {};
try {
  for (const id of failedInCi) {
    const file = `dist/data/weather/${id}.json`;
    const before = existsSync(file) ? statSync(file).mtimeMs : null;
    const h = harness([netError('ECONNRESET')]);
    const {output} = await collectRegion(id, h);
    const reason = publishBlockedReason(output);
    const published = await publishRegion(output);
    const after = existsSync(file) ? statSync(file).mtimeMs : null;
    check(`preserve.${id}.all_fail`, output.errors.length === 3 && output.errors.every(e => e.code === 'ECONNRESET' && e.attempts === MAX_ATTEMPTS && e.attempt_log.length === MAX_ATTEMPTS)
      && reason && published === null && before === after, {reason, errors: output.errors.length});
  }
  { // one point fails, two succeed -> still not published
    const id = 'region_q49t34uk';
    let n = 0;
    const h = harness([]);
    h.fetchImpl = async () => { n++; if (n <= 3) throw netError('ECONNRESET'); return json(200, okBody); }; // summit fails 3x, mid / base ok
    const {output} = await collectRegion(id, h);
    check('preserve.partial_not_published', output.errors.length === 1 && output.snapshots.length === 2 && /1 point\(s\) failed/.test(publishBlockedReason(output)) && (await publishRegion(output)) === null);
  }
  { // transient blip then success on every point -> complete, publishable
    const id = 'region_huyvh4ar';
    let n = 0;
    const h = harness([]);
    h.fetchImpl = async () => { n++; if (n % 2 === 1) throw netError('ECONNRESET'); return json(200, okBody); };
    const {output} = await collectRegion(id, h);
    check('recover.blip_each_point', output.errors.length === 0 && output.snapshots.length === 3 && output.network.attempts === 6 && output.network.retried_points === 3
      && publishBlockedReason(output) === null, {network: output.network});
  }
} finally { console.error = quietErr; }

// Same request for every region (11 OK + 4 failed in CI): coordinates, elevation and parameters are well-formed.
{
  const urls = [];
  const quiet = console.error; console.error = () => {};
  try {
    for (const id of Object.keys(weatherRegionById)) {
      const h = harness([json(400, {error: true, reason: 'stub'})]);
      const orig = h.fetchImpl; h.fetchImpl = async (u, o) => { urls.push({id, u: new URL(String(u))}); return orig(u, o); };
      await collectRegion(id, h);
    }
  } finally { console.error = quiet; }
  const ok = urls.length === 45 && urls.every(({id, u}) => {
    const r = weatherRegionById[id], q = u.searchParams;
    const lat = Number(q.get('latitude')), lng = Number(q.get('longitude')), ele = Number(q.get('elevation'));
    return u.origin + u.pathname === 'https://api.open-meteo.com/v1/forecast' && lat > 33 && lat < 46 && lng > 125 && lng < 146 && ele > 0 && ele < 2500
      && q.get('models') === 'best_match' && q.get('timezone') === r.timezone && q.get('past_days') === String(r.country === 'JP' ? 3 : 2) && q.get('forecast_days') === '16';
  });
  check('requests.15_regions_45_points_well_formed', ok, {requests: urls.length});
}

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
mkdirSync(path.join(ROOT, 'work/weather'), {recursive: true});
writeFileSync(path.join(ROOT, 'work/weather/weather-collect-network-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r).slice(0, 600));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
