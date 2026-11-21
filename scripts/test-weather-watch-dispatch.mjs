// Local checks of the Cron -> Edge Function -> GitHub dispatch path (no network, no database, no deployment):
//  * the real supabase/functions/dispatch-weather-watch/handler.ts (Node type stripping) against an in-memory model
//    of weather_scheduler (same rules as reserve_dispatch / record_dispatch_result / authorize_retry)
//  * static checks of the deferred SQL, the job-3 change and the workflow YAML
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {createDispatchHandler, GITHUB_DISPATCH_URL} = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/dispatch-weather-watch/handler.ts')).href);
const sql = readFileSync(path.join(ROOT, 'supabase/deferred/20261121010000_weather_watch_edge_dispatch.sql'), 'utf8');
const job3 = readFileSync(path.join(ROOT, 'supabase/deferred/20261121010100_weather_watch_cron_job3_command.sql'), 'utf8');
const handlerSrc = readFileSync(path.join(ROOT, 'supabase/functions/dispatch-weather-watch/handler.ts'), 'utf8');
const yml = readFileSync(path.join(ROOT, '.github/workflows/weather-model-watch.yml'), 'utf8');
const results = [];
const test = async (name, fn) => { try { await fn(); results.push({name, pass: true}); } catch (e) { results.push({name, pass: false, error: e.stack?.split('\n').slice(0, 2).join(' | ')}); } };

const TOKEN = 's'.repeat(40), PAT = 'github_pat_TESTVALUE_never_logged';
// in-memory weather_scheduler with the SQL rules
function model({enabled = true} = {}) {
  const db = {enabled, slots: new Map(), attempts: [], now: '2026-11-21T00:15:00.000Z'};
  const classify = (t, s) => (t !== 'response' ? 'ambiguous' : [200, 204].includes(s) ? 'accepted' : [400, 401, 403, 404, 405, 410, 422, 429].includes(s) ? 'rejected' : 'ambiguous');
  const rpc = async (fn, a) => {
    if (fn === 'weather_watch_validate_scheduler_token') return {data: typeof a.candidate === 'string' && a.candidate.length >= 32 && a.candidate === TOKEN, error: null};
    if (fn === 'weather_watch_reserve_dispatch') {
      if (!db.enabled) return {data: {action: 'skip', reason: 'disabled'}, error: null};
      let slot = a.p_slot_at;
      if (!slot) { slot = db.now; if (!db.slots.has(slot)) db.slots.set(slot, {correlation_id: crypto.randomUUID(), last_attempt: 0, state: 'ready'}); }
      const s = db.slots.get(slot);
      if (!s) return {data: {action: 'skip', reason: 'unknown_slot'}, error: null};
      if (db.attempts.some(x => x.slot_at === slot && x.result === 'accepted')) return {data: {action: 'skip', reason: 'already_accepted', slot_at: slot}, error: null};
      if (s.state !== 'ready') return {data: {action: 'skip', reason: `state_${s.state}`, slot_at: slot}, error: null};
      s.last_attempt++; s.state = 'awaiting_response';
      db.attempts.push({slot_at: slot, attempt_no: s.last_attempt, transport: 'pending', result: 'pending'});
      return {data: {action: 'dispatch', slot_at: slot, attempt_no: s.last_attempt, correlation_id: s.correlation_id}, error: null};
    }
    if (fn === 'weather_watch_record_dispatch') {
      if (db.failRecord) return {data: null, error: {code: 'XX000'}};
      const s = db.slots.get(a.p_slot_at);
      if (!s || s.correlation_id !== a.p_correlation_id) return {data: null, error: {code: 'P0001', message: 'Unknown dispatch slot'}};
      const at = db.attempts.find(x => x.slot_at === a.p_slot_at && x.attempt_no === a.p_attempt_no && ['pending', 'response_missing'].includes(x.transport));
      if (!at) return {data: 'already_recorded', error: null};
      const r = classify(a.p_transport, a.p_http_status);
      Object.assign(at, {transport: a.p_transport, result: r, http: a.p_http_status, run: r === 'accepted' && a.p_http_status === 200 ? a.p_reported_run_id : null});
      s.state = db.attempts.some(x => x.slot_at === a.p_slot_at && x.result === 'accepted') ? 'accepted' : s.last_attempt === a.p_attempt_no ? r : s.state;
      return {data: r, error: null};
    }
    return {data: null, error: {code: 'PGRST202'}};
  };
  // authorize_retry(): only rejected (config fixed) / ambiguous (reviewed) and never after an acceptance
  db.authorizeRetry = (slot, basis) => {
    const s = db.slots.get(slot);
    if (db.attempts.some(x => x.slot_at === slot && x.result === 'accepted')) throw new Error('accepted');
    if (!((s.state === 'rejected' && basis === 'credential_or_config_fixed') || (s.state === 'ambiguous' && basis === 'github_no_run_after_review'))) throw new Error('not allowed');
    s.state = 'ready';
  };
  return {db, rpc};
}
const gh = (status, body = null) => { const calls = []; const f = async (url, init) => { calls.push({url, init}); if (status === 'timeout') { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } if (status === 'network') throw new TypeError('fetch failed'); return new Response(body ? JSON.stringify(body) : null, {status}); }; f.calls = calls; return f; };
const req = (headers = {}, body = '{"source":"supabase-cron"}', method = 'POST') => new Request('https://x/functions/v1/dispatch-weather-watch', {method, headers: {'content-type': 'application/json', ...headers}, body: method === 'POST' ? body : undefined});
const run = async (m, fetchImpl, {headers = {'x-scheduler-token': TOKEN}, body, env = {GITHUB_WEATHER_DISPATCH_PAT: PAT}} = {}) => {
  const h = createDispatchHandler({rpc: m.rpc, getEnv: k => env[k], fetchImpl});
  const res = await h(req(headers, body));
  const text = await res.text();
  return {status: res.status, body: JSON.parse(text), text};
};

await test('auth: missing / wrong / short token -> 401, no reservation, no GitHub call', async () => {
  for (const headers of [{}, {'x-scheduler-token': 'wrong'.repeat(10)}, {'x-scheduler-token': 'short'}]) {
    const m = model(), f = gh(204);
    const r = await run(m, f, {headers});
    assert.equal(r.status, 401);
    assert.equal(m.db.slots.size, 0);
    assert.equal(f.calls.length, 0);
  }
  const m = model();
  const h = createDispatchHandler({rpc: m.rpc, getEnv: () => PAT, fetchImpl: gh(204)});
  assert.equal((await h(req({}, undefined, 'GET'))).status, 405);
});
await test('PAT only from the Edge secret; missing secret -> 500 before any reservation', async () => {
  const m = model(), f = gh(204);
  const r = await run(m, f, {env: {}});
  assert.deepEqual([r.status, r.body.code], [500, 'NOT_CONFIGURED']);
  assert.equal(m.db.slots.size, 0, 'no pending attempt left behind');
  assert(!/Deno\.env|getEnv\('(?!GITHUB_WEATHER_DISPATCH_PAT)/.test(handlerSrc.replace("deps.getEnv('GITHUB_WEATHER_DISPATCH_PAT')", '')), 'the only secret read is GITHUB_WEATHER_DISPATCH_PAT');
  assert(!/vault|decrypted_secret/i.test(handlerSrc.replace(/\/\/.*$/gm, '')), 'handler never reads Vault');
});
await test('dispatch: existing workflow, ref main, scheduler_slot = correlation UUID, PAT only in the Authorization header', async () => {
  const m = model(), f = gh(204);
  const r = await run(m, f);
  assert.deepEqual([r.status, r.body.result, r.body.dispatched], [200, 'accepted', true]);
  const c = f.calls[0];
  assert.equal(c.url, GITHUB_DISPATCH_URL);
  assert.match(c.url, /\/actions\/workflows\/weather-model-watch\.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(c.init.body), {ref: 'main', inputs: {scheduler_slot: m.db.slots.get(m.db.now).correlation_id}});
  assert.equal(c.init.headers.Authorization, `Bearer ${PAT}`);
  assert(!r.text.includes(PAT) && !r.text.includes(TOKEN), 'no secret in the response');
});
await test('duplicates: second call in the same slot (in flight or accepted) is skipped; next slot dispatches', async () => {
  const m = model(), f = gh(204);
  await run(m, f);
  const second = await run(m, f);
  assert.deepEqual([second.body.dispatched, second.body.reason], [false, 'already_accepted']);
  // concurrent: reservation done, GitHub answer not yet recorded -> 'awaiting_response' blocks
  const m2 = model(); let release;
  const slow = Object.assign(async () => { await new Promise(r => { release = r; }); return new Response(null, {status: 204}); }, {calls: []});
  const p1 = run(m2, slow);
  await new Promise(r => setTimeout(r, 20));
  const p2 = await run(m2, gh(204));
  assert.deepEqual([p2.body.dispatched, p2.body.reason], [false, 'state_awaiting_response']);
  release();
  assert.equal((await p1).body.result, 'accepted');
  m.db.now = '2026-11-21T00:45:00.000Z';
  assert.equal((await run(m, f)).body.result, 'accepted', 'new slot is independent');
  assert.equal(f.calls.length, 2, 'exactly one GitHub request per slot');
});
await test('disabled (settings.enabled = false): skipped without GitHub request', async () => {
  const m = model({enabled: false}), f = gh(204);
  const r = await run(m, f);
  assert.deepEqual([r.status, r.body.reason, f.calls.length], [200, 'disabled', 0]);
});
await test('GitHub answers: 200 + run id accepted; 401/403/404/422/429 rejected; 500/timeout/network ambiguous', async () => {
  const m = model();
  assert.equal((await run(m, gh(200, {workflow_run_id: 123456789}))).body.result, 'accepted');
  assert.equal(m.db.attempts[0].run, 123456789);
  for (const s of [401, 403, 404, 422, 429]) { const mm = model(); const r = await run(mm, gh(s)); assert.deepEqual([r.status, r.body.result], [502, 'rejected'], String(s)); }
  for (const s of [500, 'timeout', 'network']) {
    const mm = model(); const r = await run(mm, gh(s));
    assert.deepEqual([r.status, r.body.result], [502, 'ambiguous'], String(s));
    assert.equal(r.body.transport, s === 500 ? 'response' : s === 'timeout' ? 'timeout' : 'network_error');
  }
});
await test('recovery: rejected -> authorize_retry(config fixed) -> explicit slot re-dispatch; ambiguous needs review; accepted never again', async () => {
  const m = model();
  const slot = (await run(m, gh(401))).body.slot_at;
  assert.equal((await run(m, gh(204), {body: JSON.stringify({slot_at: slot})})).body.reason, 'state_rejected', 'no retry without authorization');
  m.db.authorizeRetry(slot, 'credential_or_config_fixed');
  const retried = await run(m, gh(204), {body: JSON.stringify({slot_at: slot})});
  assert.deepEqual([retried.body.result, retried.body.attempt_no], ['accepted', 2]);
  assert.throws(() => m.db.authorizeRetry(slot, 'credential_or_config_fixed'), /accepted/);
  const m2 = model();
  const s2 = (await run(m2, gh('timeout'))).body.slot_at;
  assert.throws(() => m2.db.authorizeRetry(s2, 'credential_or_config_fixed'), /not allowed/, 'ambiguous needs the reviewed basis');
  m2.db.authorizeRetry(s2, 'github_no_run_after_review');
  assert.equal((await run(m2, gh(204), {body: JSON.stringify({slot_at: s2})})).body.attempt_no, 2);
  assert.equal((await run(model(), gh(204), {body: JSON.stringify({slot_at: '2026-01-01T00:15:00Z'})})).body.reason, 'unknown_slot', 'explicit slot never creates one');
  assert.equal((await run(model(), gh(204), {body: '{"slot_at":"nope"}'})).status, 400);
});
await test('record failure after GitHub answered: 500 RECORD_FAILED, attempt stays awaiting_response (no automatic re-dispatch)', async () => {
  const m = model(); m.db.failRecord = true;
  const f = gh(204);
  const r = await run(m, f);
  assert.deepEqual([r.status, r.body.code, r.body.dispatched], [500, 'RECORD_FAILED', true]);
  m.db.failRecord = false;
  assert.equal((await run(m, f)).body.reason, 'state_awaiting_response');
  assert.equal(f.calls.length, 1);
});
await test('SQL (deferred): reuses slots/attempts, no PAT / pg_net in the new functions, service_role-only entry points', () => {
  const body = sql.replace(/--.*$/gm, '');
  for (const f of ['weather_scheduler.reserve_dispatch', 'weather_scheduler.record_dispatch_result', 'public.weather_watch_validate_scheduler_token', 'public.weather_watch_reserve_dispatch', 'public.weather_watch_record_dispatch']) assert(body.includes(`create or replace function ${f}`), f);
  assert(!/net\.http_post|powderline_weather_watch_dispatch_pat|Bearer/.test(body), 'no PAT / pg_net');
  assert(!/create table|alter table|drop /i.test(body), 'existing tables reused, nothing dropped');
  assert(/for update/.test(body) && /dispatch_state <> 'ready'/.test(body) && /dispatch_result = 'accepted' or verified_run_id is not null/.test(body));
  assert(/from public, anon, authenticated;/.test(body) && /to service_role;/.test(body));
  assert(/security definer set search_path to ''/.test(body));
  assert(/when p_http_status in \(400, 401, 403, 404, 405, 410, 422, 429\) then 'rejected'/.test(body), 'same classification as capture_responses');
});
await test('job 3 change: command -> Edge Function with Vault scheduler token, stays inactive; job 4 untouched; YAML keeps workflow_dispatch', () => {
  const body = job3.replace(/--.*$/gm, '');
  assert(/cron\.alter_job\(\s*job_id := 3,\s*command :=/.test(body));
  assert(!/active := true/.test(body), 'never activated here');
  assert(!/job_id := 4/.test(body), 'job 4 not changed');
  assert(body.includes('/functions/v1/dispatch-weather-watch') && body.includes("'x-scheduler-token'") && body.includes('powderline_weather_watch_scheduler_token'));
  assert(!/github_pat|_dispatch_pat|GITHUB_WEATHER_DISPATCH_PAT|Bearer|Authorization|api\.github\.com/i.test(body), 'no GitHub credential / GitHub call in the cron request');
  assert(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*scheduler_slot:/.test(yml), 'local YAML: workflow_dispatch + scheduler_slot');
  assert(!/^\s*schedule:/m.test(yml), 'local YAML: no GitHub schedule (no double scheduling once cut over)');
});

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ` -> ${r.error}` : ''}`);
console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
