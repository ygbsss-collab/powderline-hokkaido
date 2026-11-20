// Offline tests: the 30-minute watch runs WITHOUT the 2 h GitHub pipeline (Best Match collected by the watch itself,
// scripts/weather-model-watch-run.mjs refreshBestMatch). Fake Open-Meteo, in-memory DB, temp file stores. No network.
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {regionTargets, readMeta, createMemoryStore, createFileRawStore, createFilePublicStore, BEST_MATCH, MANIFEST_PATH, bestMatchDue,
  staleItems, evaluateAlerts, STALE_ALERT_MS} from './weather-model-watch.mjs';
import {runWatch, createMemoryOps, collectModel, collectBestMatch, readRepoBmText, failureSummary, exitCodeFor} from './weather-model-watch-run.mjs';
import {FETCH_VARS} from './weather-multimodel-publish.mjs';
import {primarySkiAreas} from './weather-points.mjs';

const results = [];
const test = async (name, fn) => { try { await fn(); results.push({name, pass: true}); } catch (e) { results.push({name, pass: false, error: e.stack?.split('\n').slice(0, 3).join(' | ') || e.message}); } };
const MIN = 60e3, HOUR = 3600e3;
const iso = ms => new Date(ms).toISOString();
const UNITS = {temperature_2m: '°C', precipitation: 'mm', rain: 'mm', showers: 'mm', snowfall: 'cm', wind_speed_10m: 'm/s', wind_direction_10m: '°', weather_code: 'wmo code'};
const dir = mkdtempSync(path.join(os.tmpdir(), 'pl-indep-'));

const ALL = regionTargets(Object.keys(primarySkiAreas));
let NOW = Date.parse('2026-11-20T03:00:00Z');
const clock = () => NOW;
let runTag = 0, apiCalls = 0, modelDown = () => false; // modelDown(latitude) -> true = HTTP 503 after retries
const fakeApi = async url => {
  apiCalls++;
  const u = new URL(String(url));
  if (modelDown(u.searchParams.get('latitude'))) return {ok: false, status: 503, json: async () => ({error: true, reason: 'down'})};
  const id = u.searchParams.get('models'), days = Number(u.searchParams.get('forecast_days'));
  const start = Math.floor(NOW / HOUR) * HOUR, n = days * 24;
  const time = Array.from({length: n}, (_, i) => iso(start + i * HOUR).slice(0, 16));
  const base = {jma_msm: -6, ecmwf_ifs025: -4, gfs_seamless: -8}[id] ?? -5;
  const hourly = {time, temperature_2m: time.map((_, i) => base + runTag * 0.1 + (i % 24) * 0.05), precipitation: time.map(() => 0.5), rain: time.map(() => 0),
    showers: time.map(() => 0), snowfall: time.map(() => 0.35), wind_speed_10m: time.map(() => 3), wind_direction_10m: time.map(() => 270), weather_code: time.map(() => 71)};
  return {ok: true, status: 200, json: async () => ({latitude: Number(u.searchParams.get('latitude')), longitude: Number(u.searchParams.get('longitude')), elevation: Number(u.searchParams.get('elevation')),
    utc_offset_seconds: 0, hourly_units: Object.fromEntries(FETCH_VARS.map(v => [v, UNITS[v]])), hourly})};
};
// A run becomes available 15 min before it is first served (settled: >= 10 min).
const runAt = {};
let metaFail = false;
const metaApi = () => async url => (metaFail ? {ok: false, status: 503, json: async () => ({error: true})} : {ok: true, json: async () => ({last_run_initialisation_time: Math.floor(((runAt[runTag] ??= NOW) - 3 * HOUR) / 1000),
  last_run_availability_time: Math.floor((runAt[runTag] - 15 * MIN) / 1000), update_interval_seconds: String(url).includes('jma') ? 10800 : 21600})});

// The 2 h pipeline does not exist here: reading its Best Match file for DATA is an error (counted).
let repoBmReads = 0;
const noRepoBm = async () => { repoBmReads++; throw new Error('2 h GitHub Best Match file must not be used'); };
// Fake Best Match collector: the real service-JSON shape (repo file as template), collected "now".
let bmMode = () => 'ok', bmCalls = 0;
const collectBm = async region => {
  bmCalls++;
  const mode = bmMode(region);
  if (mode === 'down') return {ok: false, attempts: 9, transient: true, error: '3 point(s) failed (received 0/3)'};
  if (mode === 'partial') return {ok: false, attempts: 5, transient: false, error: '1 point(s) failed (received 2/3)'};
  const j = JSON.parse(readRepoBmText(region));
  j.fetched_at = iso(NOW);
  if (mode === 'invalid') j.hourly = null;
  return {ok: true, attempts: 3, text: JSON.stringify(j)};
};
const store = createMemoryStore({clock}), ops = createMemoryOps(store);
const rawStore = createFileRawStore(path.join(dir, 'raw')), publicStore = createFilePublicStore(path.join(dir, 'public'));
const country = Object.fromEntries(ALL.map(t => [t.region, t.country]));
const go = (extra = {}) => runWatch({targets: ALL, store, ops, rawStore, publicStore, clock, holder: `t-${Math.random()}`, readBmText: noRepoBm, collectBm,
  readMetaFn: h => readMeta({fetchImpl: metaApi(), holder: h, now: clock}),
  // model point coordinates only (static region config); Best Match DATA never comes from this file
  collect: item => collectModel(item, {country: country[item.region], fetchImpl: fakeApi, wait: async () => {}}), ...extra});
const latsOf = region => new Set(JSON.parse(readRepoBmText(region)).points.map(p => String(p.latitude)));
const pub = rel => readFileSync(path.join(dir, 'public', rel), 'utf8');
const bmState = region => store.db.state.targets[region][BEST_MATCH];

// 1. first run, empty Supabase, no 2 h pipeline
const T0 = NOW;
const r1 = await go();
await test('independent first run: 117 model items + Best Match collected by the watch, 15 regions published', () => {
  assert.equal(r1.status, 'committed');
  assert.equal(r1.results.filter(r => r.ok).length, 117);
  assert.equal(r1.report.best_match.collected.length, 15);
  assert(r1.report.best_match.due.every(d => d.reason === 'no_stored_original'));
  assert.equal(r1.report.published.length, 15, JSON.stringify(r1.report.publish_skipped));
  const man = JSON.parse(pub(MANIFEST_PATH));
  assert.equal(Object.keys(man.files).length, 30);
  assert.equal(JSON.parse(pub('weather/kiroro.json')).fetched_at, iso(T0));
  assert.equal(JSON.parse(pub('weather-multimodel/kiroro.json')).multimodel.validation.ok, true);
  assert.equal(repoBmReads, 0, '2 h Best Match file read');
  const u = store.db.usage[iso(NOW).slice(0, 10)];
  assert.equal(u.forecast_requests, 117 + 45, 'Best Match requests counted in the usage log');
});

// 2. +30 min, no new run, Best Match 30 min old
NOW += 30 * MIN;
let calls = apiCalls, bmc = bmCalls, manBefore = pub(MANIFEST_PATH);
const r2 = await go();
await test('no new model run + fresh Best Match: no request, nothing republished, manifest unchanged', () => {
  assert.equal(r2.status, 'committed');
  assert.equal(r2.results.length, 0);
  assert.equal(apiCalls, calls);
  assert.equal(bmCalls, bmc);
  assert.equal(r2.report.best_match.due.length, 0);
  assert.equal(r2.report.published.length, 0);
  assert.equal(pub(MANIFEST_PATH), manBefore);
});

// 3. +30 min (Best Match 1 h old), new model run available after the stored Best Match
NOW += 30 * MIN; runTag++;
const r3 = await go();
await test('new model run: changed models collected, Best Match re-collected (new_model_run), recalculated + published', () => {
  assert.equal(r3.results.filter(r => r.ok).length, 117);
  assert.equal(r3.report.best_match.collected.length, 15);
  assert(r3.report.best_match.due.every(d => d.reason === 'new_model_run'), JSON.stringify(r3.report.best_match.due.slice(0, 2)));
  assert.equal(r3.report.published.length, 15);
  assert.equal(JSON.parse(pub('weather/kiroro.json')).fetched_at, iso(NOW));
  assert.equal(JSON.parse(pub('weather-multimodel/kiroro.json')).fetched_at, iso(NOW));
});
await test('bestMatchDue: new run older than the stored Best Match or Best Match < 1 h old -> not due', () => {
  const t = ALL[0], last = Date.parse(bmState(t.region).summit.raw.run_available_utc);
  assert.equal(bestMatchDue(store.db.state, t, {now: last + 40 * MIN, newRunAvailableMs: [last + 30 * MIN]}).due, false);
  assert.equal(bestMatchDue(store.db.state, t, {now: last + 70 * MIN, newRunAvailableMs: [last - MIN]}).due, false);
  assert.equal(bestMatchDue(store.db.state, t, {now: last + 70 * MIN, newRunAvailableMs: [last + MIN]}).reason, 'new_model_run');
  assert.equal(bestMatchDue(store.db.state, t, {now: last + 2 * HOUR}).reason, 'max_age');
});

// 4. +2 h, no new run: Best Match refreshed on its own (existing 2 h cadence), no model request
NOW += 2 * HOUR; calls = apiCalls;
const r4 = await go();
await test('Best Match refresh without a new model run: only Best Match collected, regions recalculated + published', () => {
  assert.equal(r4.results.length, 0);
  assert.equal(apiCalls, calls, 'no model request');
  assert(r4.report.best_match.due.every(d => d.reason === 'max_age'));
  assert.equal(r4.report.best_match.collected.length, 15);
  assert.equal(r4.report.published.length, 15);
  assert.equal(JSON.parse(pub('weather/kiroro.json')).fetched_at, iso(NOW));
});

// 5. +2 h, Open-Meteo down for Best Match
NOW += 2 * HOUR;
const good = {kiroro: pub('weather/kiroro.json'), mm: pub('weather-multimodel/kiroro.json'), man: pub(MANIFEST_PATH), raw: structuredClone(bmState('kiroro'))};
bmMode = () => 'down'; bmc = bmCalls;
const r5 = await go();
await test('API outage: transient failures in 3 regions in a row stop the rest; last valid data kept everywhere', () => {
  assert.equal(r5.status, 'committed');
  assert.equal(bmCalls - bmc, 3);
  assert.equal(r5.report.best_match.failed.length, 3);
  assert.equal(r5.report.best_match.skipped.filter(s => s.reason === 'api_unavailable').length, 12);
  assert.deepEqual(r5.outage.regions, ALL.slice(0, 3).map(t => t.region));
  assert.equal(Object.keys(failureSummary(r5)).length, 15, 'every region listed with its cause');
  assert.equal(exitCodeFor(r5), 1, 'outage -> workflow run red');
  // DB error record: the 3 attempted regions get the cause, the 12 not attempted keep theirs
  for (const t of ALL.slice(0, 3)) assert.match(bmState(t.region).summit.error, /received 0\/3/);
  assert.equal(bmState(ALL[5].region).summit.error, null);
  assert.equal(bmState('kiroro').summit.last_success_utc, good.raw.summit.last_success_utc, 'last success unchanged');
  assert.equal(r5.report.published.length, 0);
  assert.equal(pub('weather/kiroro.json'), good.kiroro);
  assert.equal(pub('weather-multimodel/kiroro.json'), good.mm);
  assert.equal(pub(MANIFEST_PATH), good.man);
  assert.deepEqual(bmState('kiroro').summit.raw, good.raw.summit.raw);
});

// 6. +30 min: recovered except one region that returns an invalid file
NOW += 30 * MIN;
bmMode = region => (region === 'kiroro' ? 'invalid' : 'ok');
const r6 = await go();
await test('retry next check: recovered regions published; an invalid Best Match file never replaces the last valid one', () => {
  assert.equal(r6.report.best_match.collected.length, 14);
  assert.deepEqual(r6.report.best_match.failed.map(f => f.region), ['kiroro']);
  assert.equal(r6.report.published.length, 14);
  assert(!r6.report.published.some(p => p.region === 'kiroro'));
  assert.equal(pub('weather/kiroro.json'), good.kiroro);
  assert.deepEqual(bmState('kiroro').summit.raw, good.raw.summit.raw);
  const man = JSON.parse(pub(MANIFEST_PATH));
  assert.equal(Object.keys(man.files).length, 30);
  assert.equal(man.files['weather/niseko.json'].published_at, iso(NOW));
  assert.equal(repoBmReads, 0, '2 h Best Match file never read');
  assert.match(bmState('kiroro').summit.error, /^invalid: /, 'validation failure recorded in DB error');
  assert.equal(bmState('niseko').summit.error, null, 'success clears the previous error');
  assert.equal(exitCodeFor(r6), 0, 'regional failure -> run stays green');
});

// 7. +2 h: two ADJACENT Korean regions fail (transient) + one partial answer -> regional, the others continue
NOW += 2 * HOUR;
const KR = ALL.filter(t => t.country === 'KR').map(t => t.region);
const before7 = Object.fromEntries(KR.slice(0, 3).map(r => [r, pub(`weather/${r}.json`)]));
const kr0Before = structuredClone(bmState(KR[0]).summit);
bmMode = region => (region === KR[0] || region === KR[1] ? 'down' : region === KR[2] ? 'partial' : 'ok');
const r7 = await go();
await test('regional failures (2 adjacent transient + 1 partial): no outage, the other 12 regions collected + published', () => {
  assert.equal(r7.outage, null);
  assert.equal(r7.report.best_match.collected.length, 12);
  assert.deepEqual(r7.report.best_match.failed.map(f => f.region), KR.slice(0, 3));
  assert.equal(r7.report.best_match.skipped.length, 0);
  assert.equal(r7.report.published.length, 12);
  for (const r of KR.slice(0, 3)) assert.equal(pub(`weather/${r}.json`), before7[r], `${r} previous file kept`);
  const sum = failureSummary(r7);
  assert.deepEqual(Object.keys(sum).sort(), KR.slice(0, 3).sort());
  assert.match(sum[KR[0]].best_match[0], /received 0\/3.*\(9 requests\)/);
  assert.equal(exitCodeFor(r7), 0, 'regional failures -> run stays green');
});
await test('DB error record (round-tripped through the store rows): cause, attempt time, failure count; last success untouched', () => {
  for (const p of ['summit', 'mid', 'base']) {
    const it = bmState(KR[0])[p];
    assert.match(it.error, /received 0\/3/);
    assert.equal(it.last_attempt_utc, iso(NOW));
    if (p === 'summit') assert.equal(it.failures_total, (kr0Before.failures_total || 0) + 1);
    else assert(it.failures_total >= 1);
    assert.equal(it.last_success_utc, kr0Before.last_success_utc);
    assert.deepEqual(it.raw, kr0Before.raw, 'last valid original kept');
  }
  assert.match(bmState(KR[2]).summit.error, /received 2\/3/);
  assert.equal(r7.report.alerts, 0, 'no alert before 24 h');
});
await test('admin alert stays at 24 h from the last success and carries the recorded cause', () => {
  const st = store.db.state, last = Date.parse(kr0Before.last_success_utc);
  const isKr0 = i => i.region === KR[0] && i.model === BEST_MATCH;
  assert.equal(staleItems(st, ALL, last + STALE_ALERT_MS - MIN).filter(isKr0).length, 0, 'not stale at 23:59');
  const at24 = staleItems(st, ALL, last + STALE_ALERT_MS).filter(isKr0);
  assert.equal(at24.length, 3);
  assert.match(at24[0].error, /received 0\/3/);
  const {alerts} = evaluateAlerts({state: st, targets: ALL, incident: null, now: last + STALE_ALERT_MS});
  assert.equal(alerts[0].kind, 'stale_24h');
  assert(alerts[0].items.some(i => isKr0(i) && /received 0\/3/.test(i.error)));
});

// 8. +2 h: every region answers partially (API reachable) -> never an outage, all 15 attempted
NOW += 2 * HOUR; bmMode = () => 'partial'; bmc = bmCalls;
const r8 = await go();
await test('partial answers everywhere: API reachable -> all 15 regions attempted, none skipped', () => {
  assert.equal(bmCalls - bmc, 15);
  assert.equal(r8.outage, null);
  assert.equal(r8.report.best_match.skipped.length, 0);
});

// 9. +30 min: meta.json unreachable AND Best Match down -> first region-wide failure stops further requests
NOW += 30 * MIN; metaFail = true; bmMode = () => 'down'; bmc = bmCalls;
const r9 = await go();
await test('meta down + Best Match down: 1 region tried, 14 not requested, data kept', () => {
  assert.equal(bmCalls - bmc, 1);
  assert.equal(r9.report.best_match.skipped.filter(s => s.reason === 'api_unavailable').length, 14);
  assert.equal(r9.status, 'committed');
});
metaFail = false;

// 10. +30 min: new run, forecast endpoint down for models -> stop after 3 regions; Best Match not requested either
NOW += 30 * MIN; runTag++; modelDown = () => true; bmMode = () => 'ok'; bmc = bmCalls; calls = apiCalls;
const man10 = pub(MANIFEST_PATH), mm10 = pub('weather-multimodel/kiroro.json');
const r10 = await go();
await test('model API outage: stops after 3 regions (retries kept), rest not requested, Best Match skipped, data kept', () => {
  assert.equal(r10.status, 'committed');
  assert.equal(new Set(r10.results.map(r => r.region)).size, 3);
  assert(r10.results.every(r => !r.ok && r.requests === 3), 'existing 3 attempts per item');
  assert.equal(r10.results.length + r10.not_tried.length, 117);
  assert(r10.not_tried.every(n => n.reason === 'api_unavailable'));
  assert.equal(exitCodeFor(r10), 1, 'model API outage -> run red');
  assert.equal(apiCalls - calls, r10.results.length * 3);
  assert.equal(bmCalls, bmc, 'no Best Match request during the outage');
  assert.equal(r10.report.published.length, 0);
  assert.equal(pub(MANIFEST_PATH), man10);
  assert.equal(pub('weather-multimodel/kiroro.json'), mm10);
});

// 11. +30 min: API back -> everything not done is collected by the next check
NOW += 30 * MIN; modelDown = () => false;
const r11 = await go();
await test('after the outage: next check collects all 117 items + Best Match and publishes 15 regions', () => {
  assert.equal(r11.results.filter(r => r.ok).length, 117);
  assert.equal(r11.report.best_match.collected.length, 15);
  assert.equal(r11.report.published.length, 15);
  assert(ALL.every(t => bmState(t.region).summit.error === null), 'all Best Match errors cleared on success');
  assert.equal(exitCodeFor(r11), 0);
});

// 12. check time budget: requests stop once the budget is used, the rest waits for the next check
NOW += 30 * MIN; runTag++;
const slow = item => { NOW += MIN; return collectModel(item, {country: country[item.region], fetchImpl: fakeApi, wait: async () => {}}); };
const r12 = await go({collect: slow, checkBudgetMs: 10 * MIN});
await test('check time budget: no new request after the budget, not-tried items recorded and collected next check', async () => {
  assert.equal(r12.status, 'committed');
  assert.equal(r12.results.length, 10);
  assert.equal(r12.not_tried.length, 107);
  assert(r12.not_tried.every(n => n.reason === 'check_time_budget'));
  NOW += 30 * MIN;
  const r13 = await go();
  assert.equal(r13.results.filter(r => r.ok).length, 107);
});

await test('collectBestMatch: incomplete point set / collector error -> not ok (nothing to store)', async () => {
  const partial = await collectBestMatch('kiroro', {collect: async () => ({output: {errors: [{point_id: 'kiroro:mid', code: 'ETIMEDOUT', attempts: 3, gave_up: 'max_attempts'}], snapshots: [{}, {}], requested_points: 3, network: {attempts: 5}}})});
  assert.equal(partial.ok, false); assert.equal(partial.attempts, 5); assert.equal(partial.transient, false, 'API answered for 2 points');
  assert.match(partial.error, /received 2\/3; mid ETIMEDOUT ×3 max_attempts/);
  const errs = ['summit', 'mid', 'base'].map(p => ({point_id: `kiroro:${p}`, kind: 'timeout', attempts: 3, gave_up: p === 'base' ? 'region_budget' : 'max_attempts'}));
  const down = await collectBestMatch('kiroro', {collect: async () => ({output: {errors: errs, snapshots: [], requested_points: 3, network: {attempts: 9}}})});
  assert.deepEqual([down.ok, down.transient], [false, true]);
  const http4 = await collectBestMatch('kiroro', {collect: async () => ({output: {errors: errs.map(e => ({...e, http: 400, gave_up: 'not_retryable'})), snapshots: [], requested_points: 3, network: {attempts: 3}}})});
  assert.equal(http4.transient, false, '4xx = API answered');
  const thrown = await collectBestMatch('kiroro', {collect: async () => { throw new Error('getaddrinfo ENOTFOUND'); }});
  assert.equal(thrown.ok, false); assert.match(thrown.error, /ENOTFOUND/);
  const ok = await collectBestMatch('kiroro', {collect: async () => ({output: {errors: [], snapshots: [{}], requested_points: 1, network: {attempts: 1}}}), build: () => ({region_id: 'kiroro'})});
  assert.deepEqual([ok.ok, ok.text], [true, '{"region_id":"kiroro"}']);
});

rmSync(dir, {recursive: true, force: true});
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : `\n     ${r.error}`}`);
console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
