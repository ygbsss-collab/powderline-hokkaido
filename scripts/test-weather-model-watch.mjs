// Offline tests for scripts/weather-model-watch.mjs (synthetic meta / fetch; no Open-Meteo or Supabase call).
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planCollection, applyResults, currentRun, isRegressed, regionTargets, emptyState, rawRef, SETTLE_MS, WATCH_MODELS,
  backoffMs, itemCost, watchBudget, pipelineDaily, watchExpectedDaily, usageDelta, pendingConfirmable, runInitialisation, readMeta, createFileRawStore, recomputeInputs, rawPruneCandidates, publishRecord,
  stateToRows, rowsToState, createSupabaseStateStore, recoveryAllowed,
  recomputeInputsDetailed, freshness, choosePublication, publishedAtOf, createMemoryStore, createSupabaseRawStore, runCheck, runnerId, forecastRequests} from './weather-model-watch.mjs';
import {META_MODELS, outPath, fetchRunMeta} from './weather-multimodel-publish.mjs';
import {primarySkiAreas} from './weather-points.mjs';
import {registeredScenario} from './weather-api-usage.mjs';

const results = [];
const test = async (name, fn) => { try { await fn(); results.push({name, pass: true}); } catch (e) { results.push({name, pass: false, error: e.message}); } };
const MIN = 60e3, HOUR = 3600e3;
const T0 = Date.parse('2026-11-20T06:00:00Z');
const iso = ms => new Date(ms).toISOString();
const comp = (init, avail, interval = 3) => ({ok: true, initialisation_utc: iso(init), availability_utc: avail == null ? null : iso(avail), modification_utc: iso(init + HOUR), update_interval_h: interval});
const meta = ({jma = [T0, T0 + 120 * MIN, 3], ecmwf = [T0, T0 + 300 * MIN, 6], gfs = [T0, T0 + 240 * MIN, 6], gfs025 = gfs} = {}) => ({
  jma_msm: {identifiable: true, components: {jma_msm: jma ? comp(...jma) : {ok: false, error: 'HTTP 503'}}},
  ecmwf_ifs025: {identifiable: true, components: {ecmwf_ifs025: comp(...ecmwf)}},
  gfs_seamless: {identifiable: true, components: {ncep_gfs013: comp(...gfs), ncep_gfs025: comp(...gfs025)}}
});
const targets = [{region: 'kiroro', country: 'JP', models: ['jma_msm', 'ecmwf_ifs025'], points: ['summit', 'mid', 'base']},
  {region: 'yongpyong', country: 'KR', models: ['ecmwf_ifs025', 'gfs_seamless'], points: ['summit', 'base']}];
const NOW = T0 + 400 * MIN;
const key = c => `${c.region}/${c.model}/${c.point}`;
const ok = (c, at) => ({region: c.region, model: c.model, point: c.point, ok: true, raw: {path: rawRef(c.region, c.model, c.point, c.run_key, 'a'.repeat(64)), sha256: 'a'.repeat(64), bytes: 10, collected_at_utc: iso(at)}});
const fail = (c, error = 'HTTP 502') => ({region: c.region, model: c.model, point: c.point, ok: false, error});
const NEW_JMA = {jma: [T0 + 180 * MIN, T0 + 300 * MIN, 3]};

const p0 = planCollection({meta: meta(), targets, now: NOW});
const state = applyResults(emptyState(), p0, p0.collect.map(c => ok(c, NOW)), NOW);

await test('first collection: all watched items, Best Match never planned', () => {
  assert.equal(p0.collect.length, 10);
  assert(p0.collect.every(c => c.reason === 'first_collection' && WATCH_MODELS.includes(c.model)));
});
await test('no model change: up_to_date, nothing collected', () => {
  const p = planCollection({state, meta: meta(), targets, now: NOW + 30 * MIN});
  assert.equal(p.collect.length, 0);
  assert(p.skip.every(s => s.reason === 'up_to_date'));
});
await test('new JMA run (verified, settled): only kiroro jma_msm items', () => {
  const p = planCollection({state, meta: meta(NEW_JMA), targets, now: NOW});
  assert.deepEqual(p.collect.map(key).sort(), ['kiroro/jma_msm/base', 'kiroro/jma_msm/mid', 'kiroro/jma_msm/summit']);
  assert(p.collect.every(c => c.reason === 'new_run'));
});
await test('settle: 9 min waits, 10 min collects', () => {
  const m = meta({jma: [T0 + 180 * MIN, NOW - 9 * MIN, 3]});
  assert.equal(planCollection({state, meta: m, targets, now: NOW}).collect.length, 0);
  assert.equal(planCollection({state, meta: m, targets, now: NOW + MIN}).collect.length, 3);
});
await test('unverified availability (missing / before init / future) never selected; modification time not used', () => {
  for (const avail of [null, T0 + 100 * MIN, NOW + 60 * MIN]) {
    const m = meta({jma: [T0 + 180 * MIN, avail, 3]});
    const p = planCollection({state, meta: m, targets, now: NOW});
    assert.equal(p.collect.length, 0, `avail=${avail}`);
    assert(p.skip.filter(s => s.model === 'jma_msm').every(s => s.reason === 'availability_unverified'));
    const s2 = applyResults(state, p, [], NOW);
    assert.equal(s2.models.jma_msm.run_key, state.models.jma_msm.run_key, 'unverified run not adopted');
  }
});
await test('GFS: one component updated = new run', () => {
  const p = planCollection({state, meta: meta({gfs025: [T0 + 360 * MIN, T0 + 370 * MIN, 6]}), targets, now: NOW + 30 * MIN});
  assert.deepEqual(p.collect.map(key).sort(), ['yongpyong/gfs_seamless/base', 'yongpyong/gfs_seamless/summit']);
});
await test('older run reported: regressed_run', () => {
  const p = planCollection({state, meta: meta({ecmwf: [T0 - 6 * HOUR, T0 - 5 * HOUR, 6]}), targets, now: NOW});
  assert(!p.collect.some(c => c.model === 'ecmwf_ifs025'));
  assert(isRegressed('a@2026-11-20T00:00:00.000Z', 'a@2026-11-20T06:00:00.000Z'));
});
await test('partial failure -> only failed retried -> recovery ok, no duplicates', () => {
  const m = meta(NEW_JMA);
  const p1 = planCollection({state, meta: m, targets, now: NOW});
  const s1 = applyResults(state, p1, p1.collect.map(c => (c.point === 'mid' ? fail(c) : ok(c, NOW))), NOW);
  const mid = s1.targets.kiroro.jma_msm.mid;
  assert.equal(mid.status, 'failed');
  assert.equal(mid.last_success_run_key, state.targets.kiroro.jma_msm.mid.last_success_run_key, 'previous good run kept');
  assert.deepEqual(mid.raw, state.targets.kiroro.jma_msm.mid.raw, 'previous good raw kept');
  const p2 = planCollection({state: s1, meta: m, targets, now: NOW + 30 * MIN});
  assert.deepEqual(p2.collect.map(c => `${key(c)}/${c.reason}/${c.attempt}`), ['kiroro/jma_msm/mid/retry_failed/2']);
  const s2 = applyResults(s1, p2, [ok(p2.collect[0], NOW + 30 * MIN)], NOW + 30 * MIN);
  assert.equal(s2.targets.kiroro.jma_msm.mid.status, 'ok');
  assert.equal(s2.targets.kiroro.jma_msm.mid.failures_total, 1);
  assert.equal(planCollection({state: s2, meta: m, targets, now: NOW + 60 * MIN}).collect.length, 0);
});
await test('after 3 attempts: exponential backoff, never a permanent stop; new run resets', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(a => backoffMs(a) / MIN), [0, 0, 60, 120, 240, 360, 360]);
  const m = meta(NEW_JMA);
  let s = state, t = NOW;
  const step = () => { const p = planCollection({state: s, meta: m, targets, now: t}); s = applyResults(s, p, p.collect.map(c => (c.point === 'mid' ? fail(c, 'timeout') : ok(c, t))), t); return p; };
  step(); t += 30 * MIN; step(); t += 30 * MIN; step(); // attempts 1..3
  assert.equal(s.targets.kiroro.jma_msm.mid.attempts, 3);
  t += 30 * MIN;
  assert(step().skip.some(x => x.point === 'mid' && x.reason === 'backoff'), 'waits after the 3rd failure');
  t = Date.parse(s.targets.kiroro.jma_msm.mid.next_attempt_utc);
  assert.equal(step().collect.find(c => c.point === 'mid')?.attempt, 4, 'retried after backoff');
  const pNew = planCollection({state: s, meta: meta({jma: [T0 + 360 * MIN, T0 + 420 * MIN, 3]}), targets, now: t + MIN});
  assert.equal(pNew.collect.find(c => c.point === 'mid')?.reason, 'new_run', 'new run is not blocked by the old backoff');
});
await test('meta outage: no new run; only incomplete items of the last verified run, while it is still current', () => {
  const m = meta(NEW_JMA);
  const p1 = planCollection({state, meta: m, targets, now: NOW});
  const s1 = applyResults(state, p1, p1.collect.map(c => (c.point === 'mid' ? fail(c) : ok(c, NOW))), NOW);
  const down = meta({jma: null});
  const p2 = planCollection({state: s1, meta: down, targets, now: NOW + 30 * MIN});
  assert.equal(p2.models.jma_msm.new_run, false);
  assert.deepEqual(p2.collect.map(c => `${key(c)}/${c.reason}`), ['kiroro/jma_msm/mid/recover_unverified_meta']);
  assert.equal(p2.collect[0].run_key, s1.models.jma_msm.run_key);
  const s2 = applyResults(s1, p2, [ok(p2.collect[0], NOW + 30 * MIN)], NOW + 30 * MIN);
  assert.equal(s2.targets.kiroro.jma_msm.mid.status, 'unconfirmed');
  assert.equal(s2.targets.kiroro.jma_msm.mid.pending.run_key, s1.models.jma_msm.run_key);
  assert.equal(s2.targets.kiroro.jma_msm.mid.last_success_run_key, s1.targets.kiroro.jma_msm.mid.last_success_run_key, 'confirmed original unchanged');
  assert.equal(s2.models.jma_msm.run_key, s1.models.jma_msm.run_key, 'known run kept during outage');
  // verified run 3 h interval: available T0+300 -> superseded after T0+480; then nothing is recovered
  const late = planCollection({state: s1, meta: down, targets, now: T0 + 481 * MIN});
  assert.equal(late.collect.length, 0);
  assert(late.skip.every(x => x.model !== 'jma_msm' || x.reason === 'meta_unavailable'));
  assert.equal(recoveryAllowed({run_key: 'x', availability_verified: true, available_utc: iso(T0), update_interval_h: null}, T0).ok, false);
});
await test('daily budget: retries before new runs, cut when exceeded, usage accumulates', () => {
  const m = meta(NEW_JMA);
  const p1 = planCollection({state, meta: m, targets, now: NOW});
  const s1 = applyResults(state, p1, p1.collect.map(c => (c.point === 'mid' ? fail(c) : ok(c, NOW))), NOW);
  const m2 = meta({...NEW_JMA, ecmwf: [T0 + 360 * MIN, T0 + 370 * MIN, 6]});
  const cost = () => 2;
  const p = planCollection({state: s1, meta: m2, targets, now: NOW + 30 * MIN, budget: {limit_weighted: 6, cost}});
  assert.equal(p.collect[0].reason, 'retry_failed');
  assert.equal(p.collect.length, 3);
  assert.equal(p.skip.filter(x => x.reason === 'budget_exceeded').length, 5 - 2);
  const s2 = applyResults(s1, p, p.collect.map(c => ok(c, NOW + 30 * MIN)), NOW + 30 * MIN);
  const day = s2.usage['2026-11-20'], before = s1.usage['2026-11-20'];
  assert.equal(day.forecast_requests - before.forecast_requests, 3);
  assert.equal(day.forecast_weighted - before.forecast_weighted, 6);
  assert.equal(planCollection({state: s2, meta: m2, targets, now: NOW + 60 * MIN, budget: {limit_weighted: 6, cost}}).collect.length, 0, 'budget used up');
  assert.equal(itemCost('jma_msm'), 1);   // 8 vars, 4 days
  assert.equal(itemCost('ecmwf_ifs025'), 15 / 14);
  assert.equal(watchBudget(targets).limit_weighted > 0, true);
});
await test('meta requests counted on every check (incl. failed / retried attempts)', async () => {
  let n = 0;
  const fakeFetch = async url => { n++; if (String(url).includes('jma_msm')) throw new Error('down');
    return {ok: true, json: async () => ({last_run_initialisation_time: T0 / 1000, last_run_availability_time: T0 / 1000 + 3600, update_interval_seconds: 10800})}; };
  const {meta: mt, usage} = await readMeta({fetchImpl: fakeFetch, metaFn: fetchRunMeta});
  assert.equal(usage.requests, n);
  assert.equal(usage.requests, 5, '4 meta files + 1 retry of the failing one');
  assert.equal(usage.failed, 2);
  assert.equal(currentRun(mt.jma_msm).status, 'meta_unavailable');
  const p = planCollection({state, meta: mt, targets, now: NOW, metaUsage: usage});
  const s = applyResults(applyResults(state, p, [], NOW), p, [], NOW + MIN);
  assert.equal(s.usage['2026-11-20'].meta_requests - (state.usage['2026-11-20'].meta_requests || 0), 10);
  assert.equal(s.usage['2026-11-20'].checks - state.usage['2026-11-20'].checks, 2);
});
await test('raw store + recompute inputs: new good original where collected, previous good one elsewhere', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pl-raw-'));
  try {
    const store = createFileRawStore(dir);
    const m = meta(NEW_JMA);
    const p = planCollection({state, meta: m, targets, now: NOW});
    const res = p.collect.map(c => (c.point === 'mid' ? fail(c) : {...c, ok: true, raw: store.put({...c, body: {v: c.point}, collected_at_utc: iso(NOW)})}));
    const s = applyResults(state, p, res, NOW);
    const inp = recomputeInputs(s, targets[0], {now: NOW});
    assert.equal(inp.jma_msm.summit.run_key, p.models.jma_msm.run_key);
    assert.deepEqual(store.get(inp.jma_msm.summit), {v: 'summit'});
    assert.equal(inp.jma_msm.mid.run_key, state.targets.kiroro.jma_msm.mid.last_success_run_key, 'failed point uses previous good original');
    assert.equal(store.get({...inp.jma_msm.summit, sha256: 'b'.repeat(64)}), null, 'hash mismatch rejected');
    const refs = [{path: 'old.json', collected_at_utc: iso(NOW - 73 * HOUR)}, {path: 'new.json', collected_at_utc: iso(NOW - HOUR)}, {...inp.jma_msm.mid, collected_at_utc: iso(NOW - 80 * HOUR)}];
    assert.deepEqual(rawPruneCandidates(refs, s, NOW).map(r => r.path), ['old.json'], '72 h window; current good original kept');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
await test('publish record: one publication time, model collection times separate', () => {
  const inp = recomputeInputs(state, targets[0], {now: NOW});
  const rec = publishRecord('kiroro', {fetched_at: iso(NOW + MIN)}, inp);
  assert.equal(rec.published_at, iso(NOW + MIN));
  assert.equal(rec.inputs.jma_msm.summit.collected_at_utc, iso(NOW));
  assert.throws(() => publishRecord('kiroro', {fetched_at: iso(NOW - MIN)}, inp), /collected after publication/);
});
await test('DB rows <-> state round trip; client sends upserts with service key (fake fetch)', async () => {
  const p = planCollection({state, meta: meta(NEW_JMA), targets, now: NOW});
  const s = applyResults(state, p, p.collect.map(c => (c.point === 'mid' ? fail(c) : ok(c, NOW))), NOW);
  const back = rowsToState({...stateToRows(s), usage: Object.entries(s.usage).map(([day, u]) => ({day, ...u}))});
  assert.deepEqual(back.targets, s.targets);
  assert.deepEqual(back.models, s.models);
  assert.deepEqual(back.usage, s.usage);
  const calls = [];
  const db = createSupabaseStateStore({url: 'https://example.invalid', serviceKey: 'k', fetchImpl: async (u, init) => { calls.push({u, init}); return {ok: true, status: 204}; }});
  await db.save('runner-1', s);
  await db.usageAdd([{request_id: 'runner-1:check', day: '2026-11-20', kind: 'check', weighted: 0, failed: false, holder: 'runner-1'}]);
  assert.deepEqual(calls.map(c => c.u.split('/rest/v1/')[1]), ['rpc/weather_watch_commit', 'rpc/weather_usage_add']);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.p_holder, 'runner-1');
  assert.equal('p_usage' in body, false, 'usage is not part of the lease-guarded commit');
  assert.equal(JSON.parse(calls[1].init.body).p_requests[0].request_id, 'runner-1:check', 'usage sent as request-log rows');
  assert(calls.every(c => c.init.headers.authorization === 'Bearer k' && c.init.method === 'POST'));
});
await test('regionTargets: real local files, country profiles, Best Match excluded', () => {
  const t = regionTargets(['kiroro', 'yongpyong', 'nofile']);
  assert.equal(t.length, 2);
  assert(t.every(x => !x.models.includes('best_match') && x.points.length === 3));
  assert(!t.find(x => x.region === 'yongpyong').models.includes('jma_msm'));
});
await test('existing META_MODELS / publish path unchanged', () => {
  assert.deepEqual(META_MODELS, {jma_msm: ['jma_msm'], ecmwf_ifs025: ['ecmwf_ifs025'], gfs_seamless: ['ncep_gfs013', 'ncep_gfs025'], best_match: []});
  assert(outPath('kiroro').replace(/\\/g, '/').endsWith('dist/data/weather-multimodel/kiroro.json'));
  assert.equal(SETTLE_MS, 600000);
});

// ---------------- 3rd round: all regions, unconfirmed originals, budget split, times, prune, concurrency ----------------
const ALL = regionTargets(Object.keys(primarySkiAreas));
const allKeys = ts => ts.flatMap(t => t.models.flatMap(m => t.points.map(p => `${t.region}/${m}/${p}`)));
const fullMeta = meta({jma: [T0, T0 + 120 * MIN, 3]});
const allP0 = planCollection({meta: fullMeta, targets: ALL, now: NOW});
const allState = applyResults(emptyState(), allP0, allP0.collect.map(c => ok(c, NOW)), NOW);

await test('15 regions / 45 points / 117 decision items (JP 9 × 3 models, KR 6 × 2)', () => {
  assert.equal(ALL.length, 15);
  assert.equal(ALL.reduce((a, t) => a + t.points.length, 0), 45);
  const keys = allKeys(ALL);
  assert.equal(keys.length, 117);
  assert.equal(new Set(keys).size, 117, 'no duplicate item');
  assert.equal(ALL.filter(t => t.country === 'JP').length, 9);
  assert(ALL.filter(t => t.country === 'JP').every(t => t.models.join() === 'jma_msm,ecmwf_ifs025,gfs_seamless'));
  assert(ALL.filter(t => t.country === 'KR').every(t => t.models.join() === 'ecmwf_ifs025,gfs_seamless'));
  assert.equal(allP0.collect.length, 117);
  assert.equal(allP0.skip.length, 0);
  assert.deepEqual(allP0.collect.map(key).sort(), keys.sort());
});
await test('15 regions: unchanged -> 0 fetches; each model run selects exactly its own items', () => {
  const same = planCollection({state: allState, meta: fullMeta, targets: ALL, now: NOW + 30 * MIN});
  assert.equal(same.collect.length, 0);
  assert.equal(same.skip.filter(x => x.reason === 'up_to_date').length, 117);
  const count = m => planCollection({state: allState, meta: meta(m), targets: ALL, now: T0 + 600 * MIN}).collect;
  assert.equal(count({jma: [T0 + 180 * MIN, T0 + 300 * MIN, 3]}).length, 27, 'JMA: 9 JP regions × 3');
  assert.equal(count({jma: [T0, T0 + 120 * MIN, 3], ecmwf: [T0 + 360 * MIN, T0 + 400 * MIN, 6]}).length, 45, 'ECMWF: 15 × 3');
  assert.equal(count({jma: [T0, T0 + 120 * MIN, 3], gfs: [T0 + 360 * MIN, T0 + 400 * MIN, 6]}).length, 45, 'GFS: 15 × 3');
  const down = {jma_msm: {identifiable: true, components: {jma_msm: {ok: false, error: 'x'}}}, ecmwf_ifs025: {identifiable: true, components: {ecmwf_ifs025: {ok: false}}},
    gfs_seamless: {identifiable: true, components: {ncep_gfs013: {ok: false}, ncep_gfs025: {ok: false}}}};
  assert.equal(planCollection({state: allState, meta: down, targets: ALL, now: NOW + 30 * MIN}).collect.length, 0, 'full meta outage: nothing new, nothing incomplete');
});
await test('15 regions: partial failure of one model run -> only those items retried', () => {
  const m = meta({jma: [T0 + 180 * MIN, T0 + 300 * MIN, 3]});
  const p1 = planCollection({state: allState, meta: m, targets: ALL, now: NOW});
  const s1 = applyResults(allState, p1, p1.collect.map((c, i) => (i % 4 === 0 ? fail(c) : ok(c, NOW))), NOW);
  const p2 = planCollection({state: s1, meta: m, targets: ALL, now: NOW + 30 * MIN});
  assert.equal(p2.collect.length, Math.ceil(27 / 4));
  assert(p2.collect.every(c => c.reason === 'retry_failed' && c.model === 'jma_msm'));
});

// unconfirmed original: item mid of kiroro/jma_msm recovered during a meta outage
const NEW = meta(NEW_JMA);
const pA = planCollection({state, meta: NEW, targets, now: NOW});
const sA = applyResults(state, pA, pA.collect.map(c => (c.point === 'mid' ? fail(c) : ok(c, NOW))), NOW);
const pDown = planCollection({state: sA, meta: meta({jma: null}), targets, now: NOW + 30 * MIN});
const sDown = applyResults(sA, pDown, pDown.collect.map(c => ok(c, NOW + 30 * MIN)), NOW + 30 * MIN);

await test('unconfirmed original: never a calculation / publication input', () => {
  const it = sDown.targets.kiroro.jma_msm.mid;
  assert.equal(it.status, 'unconfirmed');
  const inp = recomputeInputs(sDown, targets[0], {now: NOW + 30 * MIN});
  assert.equal(inp.jma_msm.mid.run_key, state.targets.kiroro.jma_msm.mid.last_success_run_key, 'previous confirmed original used');
  assert.notEqual(inp.jma_msm.mid.path, it.pending.path);
  assert.throws(() => publishRecord('kiroro', {fetched_at: iso(NOW + HOUR)}, {jma_msm: {mid: {...it.pending, confirmed: false}}}), /unconfirmed/);
  assert.throws(() => publishRecord('kiroro', {fetched_at: iso(NOW + HOUR)}, {jma_msm: {mid: {...it.pending}}}), /unconfirmed/, 'missing flag = unconfirmed');
  const again = planCollection({state: sDown, meta: meta({jma: null}), targets, now: NOW + 60 * MIN});
  assert(again.skip.some(x => x.point === 'mid' && x.reason === 'pending_confirmation'), 'not re-fetched during the outage');
  assert.equal(again.collect.length, 0);
});
await test('unconfirmed original: confirmed when the same run is verified again (no new fetch)', () => {
  const p = planCollection({state: sDown, meta: NEW, targets, now: NOW + 60 * MIN});
  assert(p.skip.some(x => x.point === 'mid' && x.model === 'jma_msm' && x.reason === 'pending_confirmable'));
  assert.equal(p.collect.length, 0);
  const s = applyResults(sDown, p, [], NOW + 60 * MIN);
  const it = s.targets.kiroro.jma_msm.mid;
  assert.equal(it.status, 'ok');
  assert.equal(it.pending, null);
  assert.equal(it.last_success_run_key, p.models.jma_msm.run_key);
  assert.equal(it.raw.path, sDown.targets.kiroro.jma_msm.mid.pending.path);
  assert.equal(recomputeInputs(s, targets[0], {now: NOW + 60 * MIN}).jma_msm.mid.run_key, p.models.jma_msm.run_key, 'now usable');
  assert.equal(planCollection({state: s, meta: NEW, targets, now: NOW + 90 * MIN}).collect.length, 0);
});
await test('unconfirmed original: discarded when a different run is verified; item collected as new run', () => {
  const newer = meta({jma: [T0 + 360 * MIN, T0 + 420 * MIN, 3]});
  const p = planCollection({state: sDown, meta: newer, targets, now: T0 + 440 * MIN});
  const s = applyResults(sDown, p, [], T0 + 440 * MIN);
  const it = s.targets.kiroro.jma_msm.mid;
  assert.equal(it.pending, null);
  assert.equal(it.status, 'ok', 'falls back to its previous confirmed original');
  assert.equal(it.raw.run_key, state.targets.kiroro.jma_msm.mid.last_success_run_key);
  assert(p.collect.some(c => c.point === 'mid' && c.model === 'jma_msm' && c.reason === 'new_run'));
  assert.equal(pendingConfirmable({run_key: 'k', collected_at_utc: iso(T0)}, {status: 'identified', availability_verified: true, run_key: 'k', run_available_utc: iso(T0 + MIN)}), false, 'collected before availability');
});
await test('budget: 2 h pipeline and watch counted once each (parallel vs replace)', () => {
  const par = pipelineDaily(ALL, {mode: 'parallel'}), rep = pipelineDaily(ALL, {mode: 'replace'});
  assert.equal(par.reserved, registeredScenario(2).per_day_weighted, 'parallel = current pipeline usage');
  assert.equal(Math.round((par.reserved - rep.reserved) * 100) / 100, par.multimodel, 'replace drops only the pipeline model requests');
  assert.equal(rep.reserved, rep.collector);
  const b = watchBudget(ALL, {mode: 'parallel'});
  assert.equal(b.limit_weighted, Math.floor(8000 - par.reserved));
  assert.equal(b.expected_watch, watchExpectedDaily(ALL));
  assert(b.total_expected < 10000, `parallel total ${b.total_expected}`);
  assert(watchBudget(ALL, {mode: 'replace'}).total_expected < b.total_expected);
  console.log(`  budget: pipeline parallel ${par.reserved} (collector ${par.collector} + models ${par.multimodel}) · replace ${rep.reserved} · watch expected ${b.expected_watch}/day · watch limit ${b.limit_weighted} · total parallel ${b.total_expected} · total replace ${watchBudget(ALL, {mode: 'replace'}).total_expected} / 10000`);
});
await test('usage delta: independent of state, two concurrent runners add up (no overwrite)', () => {
  const d1 = usageDelta(pA, pA.collect.map(c => ok(c, NOW)), NOW), d2 = usageDelta(pDown, pDown.collect.map(c => ok(c, NOW)), NOW);
  assert.equal(d1.checks, 1);
  assert.equal(d1.forecast_requests, 3);
  const table = {}; for (const d of [d1, d2]) for (const [k, v] of Object.entries(d)) if (k !== 'day') table[k] = (table[k] || 0) + v; // = SQL increment
  assert.equal(table.checks, 2);
  assert.equal(table.forecast_requests, d1.forecast_requests + d2.forecast_requests);
});
await test('times: model run / model collection / publication kept apart', () => {
  const it = sA.targets.kiroro.jma_msm.summit;
  assert.equal(it.run_initialisation_utc, iso(T0 + 180 * MIN), 'model run time from run_key');
  assert.equal(it.raw.collected_at_utc, iso(NOW), 'collection time');
  assert.equal(sA.models.jma_msm.run_available_utc, iso(T0 + 300 * MIN));
  const rec = publishRecord('kiroro', {fetched_at: iso(NOW + 5 * MIN)}, recomputeInputs(sA, targets[0], {now: NOW + 5 * MIN}));
  assert.deepEqual([rec.published_at, rec.inputs.jma_msm.summit.collected_at_utc, rec.inputs.jma_msm.summit.run_initialisation_utc], [iso(NOW + 5 * MIN), iso(NOW), iso(T0 + 180 * MIN)]);
  assert.equal(Object.keys(rec).filter(k => /_at$/.test(k)).length, 1, 'one publication time per region');
  assert.equal(runInitialisation('a@2026-11-20T00:00:00Z|b@2026-11-20T06:00:00Z'), '2026-11-20T06:00:00.000Z');
});
await test('prune: > 72 h removed; current confirmed and pending originals always kept; unknown age kept', () => {
  const conf = sDown.targets.kiroro.jma_msm.summit.raw, pend = sDown.targets.kiroro.jma_msm.mid.pending;
  const refs = [{path: 'a.json', collected_at_utc: iso(NOW - 73 * HOUR)}, {path: 'b.json', collected_at_utc: iso(NOW - 71 * HOUR)},
    {path: conf.path, collected_at_utc: iso(NOW - 500 * HOUR)}, {path: pend.path, collected_at_utc: iso(NOW - 100 * HOUR)}, {path: 'c.json'}];
  assert.deepEqual(rawPruneCandidates(refs, sDown, NOW).map(r => r.path), ['a.json']);
});
await test('DB round trip keeps pending / unconfirmed; lease call shape', async () => {
  const back = rowsToState({...stateToRows(sDown), usage: []});
  assert.deepEqual(back.targets, sDown.targets);
  const calls = [];
  const db = createSupabaseStateStore({url: 'https://example.invalid', serviceKey: 'k', fetchImpl: async (u, init) => { calls.push({u, body: JSON.parse(init.body)}); return {ok: true, status: 200, json: async () => false}; }});
  assert.equal(await db.acquire('runner-2'), false, 'second runner refused -> exits without fetching');
  assert.equal(calls[0].u.endsWith('rpc/weather_watch_lease_acquire'), true);
  assert.equal(calls[0].body.p_ttl_seconds, 25 * 60);
});

// ---------------- 4th round: regressions for the 4 review findings + lease / concurrency / idempotent usage ----------------
const tmpDirs = [];
const tmp = () => { const d = mkdtempSync(path.join(os.tmpdir(), 'pl-watch-')); tmpDirs.push(d); return d; };
const metaFetch = (initS, availS) => async url => ({ok: true, json: async () => ({last_run_initialisation_time: initS, last_run_availability_time: availS, update_interval_seconds: 10800})});

await test('[finding 1] success without original = failure; previous good original and run untouched', () => {
  const p = planCollection({state, meta: meta(NEW_JMA), targets, now: NOW});
  const s = applyResults(state, p, p.collect.map(c => ({region: c.region, model: c.model, point: c.point, ok: true})), NOW);
  const it = s.targets.kiroro.jma_msm.summit;
  assert.equal(it.status, 'failed');
  assert.match(it.error, /without a verified original/);
  assert.equal(it.last_success_run_key, state.targets.kiroro.jma_msm.summit.last_success_run_key);
  assert.equal(it.raw.run_key, it.last_success_run_key);
  const first = applyResults(emptyState(), p0, p0.collect.map(c => ({region: c.region, model: c.model, point: c.point, ok: true, raw: {path: 'x.json', sha256: 'not-a-hash'}})), NOW);
  assert(Object.values(first.targets.kiroro.jma_msm).every(i => i.status === 'failed' && i.raw === null && i.last_success_run_key === null), 'invalid hash = no original');
});
await test('[finding 1] DB round trip never relabels an old original as a newer run (raw_run_key)', () => {
  const legacy = structuredClone(state);
  const it = legacy.targets.kiroro.jma_msm.summit;
  it.last_success_run_key = 'jma_msm@2026-11-20T09:00:00.000Z'; // a newer run recorded, original still of the old run
  const rows = stateToRows(legacy);
  const row = rows.items.find(r => r.region_id === 'kiroro' && r.model === 'jma_msm' && r.point === 'summit');
  assert.equal(row.raw_run_key, state.targets.kiroro.jma_msm.summit.raw.run_key);
  const back = rowsToState({...rows, usage: []});
  assert.equal(back.targets.kiroro.jma_msm.summit.raw.run_key, state.targets.kiroro.jma_msm.summit.raw.run_key, 'own run kept');
  const {inputs, excluded} = recomputeInputsDetailed(back, targets[0], {now: NOW});
  assert.equal(inputs.jma_msm.summit, null);
  assert(excluded.some(e => e.model === 'jma_msm' && e.point === 'summit' && /run != last successful run/.test(e.reason)));
  assert.equal(rowsToState({items: [{...row, raw_run_key: null}]}).targets.kiroro.jma_msm.summit.raw, null, 'no raw_run_key -> no original');
});
await test('[finding 2] lease renewed while collecting; a second runner is refused; commit succeeds past the TTL', async () => {
  let t = NOW;
  const store = createMemoryStore({clock: () => t});
  const raw = createFileRawStore(tmp());
  let refused = null;
  const out = await runCheck({store, rawStore: raw, targets, holder: 'A', clock: () => t,
    readMetaFn: holder => readMeta({fetchImpl: metaFetch(T0 / 1000, T0 / 1000 + 3600), holder, now: () => t}),
    collect: async item => { t += 4 * MIN; if (refused === null && t - NOW > 26 * MIN) refused = await store.acquire('B'); return {ok: true, body: {item: key(item)}}; }});
  assert.equal(out.status, 'committed');
  assert.equal(out.results.length, 10, '40 min of collection > 25 min TTL');
  assert.equal(refused, false, 'second runner refused while A renews');
  assert.equal(store.db.lease.holder, null, 'released');
  assert.equal(Object.values(store.db.state.targets.kiroro.jma_msm).every(i => i.status === 'ok'), true);
});
await test('[finding 2+3] lease lost: no new request after the failed renewal, commit refused, usage of real requests kept', async () => {
  let t = NOW, calls = 0;
  const store = createMemoryStore({clock: () => t});
  const out = await runCheck({store, rawStore: createFileRawStore(tmp()), targets, holder: 'A', clock: () => t,
    readMetaFn: holder => readMeta({fetchImpl: metaFetch(T0 / 1000, T0 / 1000 + 3600), holder, now: () => t}),
    collect: async () => {
      calls++; t += 4 * MIN;
      if (calls === 3) { t += 30 * MIN; assert.equal(await store.acquire('B'), true, 'lease of A expired naturally during a 30 min stall'); }
      return {ok: true, body: {calls}, attempts: calls === 2 ? 3 : 1};
    }});
  assert.equal(out.status, 'lease_lost_before_commit');
  assert.equal(calls, 3, 'stopped issuing requests at the next renewal');
  assert.deepEqual(store.db.state, rowsToState({models: [], items: []}), 'state not written by A');
  const day = store.db.usage['2026-11-20'];
  assert.equal(day.forecast_requests, 1 + 3 + 1, 'every real attempt counted');
  assert.equal(day.meta_requests, 4);
  assert.equal(day.checks, 1);
  assert.equal(store.db.lease.holder, 'B', 'A did not release B\'s lease');
});
await test('[usage] idempotent request ids; concurrent runners add up exactly; DB retry does not double count', async () => {
  const store = createMemoryStore({clock: () => NOW});
  const item = {region: 'kiroro', model: 'jma_msm', point: 'mid', cost: 1};
  const a = forecastRequests('A', item, 2, NOW), b = forecastRequests('B', item, 3, NOW);
  const added = await Promise.all([store.usageAdd(a), store.usageAdd(b), store.usageAdd(a), store.usageAdd([...b, ...a])]);
  assert.deepEqual(added, [2, 3, 0, 0]);
  assert.equal(store.db.usage['2026-11-20'].forecast_requests, 5);
  assert.equal(store.db.usage['2026-11-20'].forecast_weighted, 5);
  assert.equal(new Set([...a, ...b].map(r => r.request_id)).size, 5, 'ids unique per runner and attempt');
  assert.notEqual(runnerId({GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1'}), runnerId({GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1'}), 'runner ids unique even for the same run');
});
await test('[finding 3] content-addressed originals: no overwrite, read-back hash verified, tamper detected', () => {
  const dir = tmp();
  const store = createFileRawStore(dir);
  const base = {region: 'kiroro', model: 'jma_msm', point: 'mid', run_key: 'jma_msm@2026-11-20T09:00:00Z', collected_at_utc: iso(NOW)};
  const r1 = store.put({...base, body: {v: 1}}), r1b = store.put({...base, body: {v: 1}}), r2 = store.put({...base, body: {v: 2}});
  assert.equal(r1.path, r1b.path, 'same content -> same object');
  assert.notEqual(r1.path, r2.path, 'different content of the same run -> new object');
  assert(r1.path.endsWith(`/${r1.sha256}.json`));
  assert.deepEqual(store.get(r1), {v: 1});
  writeFileSync(path.join(dir, r1.path), '{"v":9}');
  assert.equal(store.get(r1), null, 'tampered object rejected');
  assert.throws(() => store.put({...base, body: {v: 1}}), /verification failed/, 'existing object with wrong content never accepted');
});
await test('[finding 3] Supabase Storage store: x-upsert false, 409 accepted only after hash verification', async () => {
  const objects = new Map(), calls = [];
  const fakeFetch = async (u, init = {}) => {
    calls.push({u, method: init.method || 'GET', upsert: init.headers?.['x-upsert']});
    const p = u.split('/object/weather-raw/')[1];
    if (init.method === 'POST') { if (objects.has(p)) return {ok: false, status: 409}; objects.set(p, Buffer.from(init.body)); return {ok: true, status: 200}; }
    return objects.has(p) ? {ok: true, status: 200, arrayBuffer: async () => objects.get(p)} : {ok: false, status: 404};
  };
  const st = createSupabaseRawStore({url: 'https://example.invalid', serviceKey: 'k', fetchImpl: fakeFetch});
  const base = {region: 'kiroro', model: 'jma_msm', point: 'mid', run_key: 'r', collected_at_utc: iso(NOW), body: {v: 1}};
  const ref = await st.put(base);
  assert.equal(calls[0].upsert, 'false');
  assert.deepEqual(await st.put(base), ref, 'duplicate upload (409) verified and reused');
  objects.set(ref.path, Buffer.from('{"v":2}'));
  await assert.rejects(st.put(base), /verification failed/);
  assert.equal(await st.get(ref), null);
});
await test('[finding 3] storage failure: item failed, its request still counted, no DB reference to the object', async () => {
  let t = NOW;
  const store = createMemoryStore({clock: () => t});
  const broken = {put: async () => { throw new Error('upload 500'); }};
  const out = await runCheck({store, rawStore: broken, targets, holder: 'A', clock: () => t,
    readMetaFn: holder => readMeta({fetchImpl: metaFetch(T0 / 1000, T0 / 1000 + 3600), holder, now: () => t}), collect: async () => ({ok: true, body: {}})});
  assert.equal(out.status, 'committed');
  assert(out.results.every(r => !r.ok && /^storage: upload 500/.test(r.error)));
  assert(Object.values(store.db.state.targets.kiroro.jma_msm).every(i => i.status === 'failed' && i.raw === null));
  assert.equal(store.db.usage['2026-11-20'].forecast_requests, 10);
});
await test('[finding 3] prune from a storage listing: only unreferenced > 72 h; confirmed and pending kept', () => {
  const conf = sDown.targets.kiroro.jma_msm.summit.raw.path, pend = sDown.targets.kiroro.jma_msm.mid.pending.path;
  const listing = [{path: conf, created_at_utc: iso(NOW - 900 * HOUR)}, {path: pend, created_at_utc: iso(NOW - 200 * HOUR)},
    {path: 'model-raw/x/old.json', created_at_utc: iso(NOW - 72 * HOUR - MIN)}, {path: 'model-raw/x/young.json', created_at_utc: iso(NOW - 71 * HOUR)}];
  assert.deepEqual(rawPruneCandidates(listing, sDown, NOW).map(r => r.path), ['model-raw/x/old.json']);
  const dir = tmp(), fsStore = createFileRawStore(dir);
  const ref = fsStore.put({region: 'r', model: 'jma_msm', point: 'mid', run_key: 'k', body: {}, collected_at_utc: iso(NOW)});
  assert.deepEqual(fsStore.list().map(x => x.path), [ref.path]);
});
await test('[finding 4] freshness by model interval and real availability: stale originals excluded', () => {
  const s = structuredClone(state);
  const set = (model, point, availMs) => { s.targets.kiroro[model][point].raw.run_available_utc = availMs == null ? null : iso(availMs); };
  set('jma_msm', 'summit', NOW - 8 * HOUR);     // JMA 3 h: max 2×3 h + 1 h = 7 h -> stale
  set('jma_msm', 'mid', NOW - 6 * HOUR);        // fresh
  set('jma_msm', 'base', null);                 // unknown availability -> excluded
  set('ecmwf_ifs025', 'summit', NOW - 8 * HOUR); // ECMWF 6 h: max 13 h -> fresh
  const {inputs, excluded} = recomputeInputsDetailed(s, targets[0], {now: NOW});
  assert.equal(inputs.jma_msm.summit, null);
  assert.notEqual(inputs.jma_msm.mid, null);
  assert.equal(inputs.jma_msm.base, null);
  assert.notEqual(inputs.ecmwf_ifs025.summit, null);
  assert.deepEqual(excluded.map(e => `${e.model}/${e.point}`).sort(), ['jma_msm/base', 'jma_msm/summit']);
  assert.match(excluded.find(e => e.point === 'summit').reason, /stale run \(8 h > 7 h\)/);
  assert.deepEqual([freshness({run_available_utc: iso(NOW - 13 * HOUR)}, 'gfs_seamless', NOW).fresh, freshness({run_available_utc: iso(NOW - 13 * HOUR - MIN)}, 'gfs_seamless', NOW).fresh], [true, false]);
});
await test('[finding 4] publication: invalid / no fresh input / unchanged inputs keep the existing file; new inputs publish', () => {
  const inputs = recomputeInputs(state, targets[0], {now: NOW});
  const cand = {fetched_at: iso(NOW + 5 * MIN)};
  assert.equal(choosePublication({region: 'kiroro', candidate: cand, issues: ['summit: hours without any value'], inputs}).reason, 'invalid_candidate');
  assert.equal(choosePublication({region: 'kiroro', candidate: null, inputs}).publish, false);
  const none = {jma_msm: {summit: null, mid: null, base: null}, ecmwf_ifs025: {summit: null, mid: null, base: null}};
  assert.equal(choosePublication({region: 'kiroro', candidate: cand, inputs: none}).reason, 'no_fresh_input');
  const first = choosePublication({region: 'kiroro', candidate: cand, inputs});
  assert.equal(first.publish, true);
  assert.equal(first.record.published_at, cand.fetched_at);
  const again = choosePublication({region: 'kiroro', candidate: {fetched_at: iso(NOW + 35 * MIN)}, inputs, previousRecord: first.record});
  assert.deepEqual([again.publish, again.reason], [false, 'no_new_input'], 'old originals re-run do not bump fetched_at');
  const changed = recomputeInputs(sA, targets[0], {now: NOW + 5 * MIN});
  assert.equal(choosePublication({region: 'kiroro', candidate: {fetched_at: iso(NOW + 35 * MIN)}, inputs: changed, previousRecord: first.record}).publish, true);
});
await test('times: fetched_at meaning unchanged; published_at prepared (publishedAtOf); one publication time', () => {
  assert.equal(publishedAtOf({fetched_at: 'F'}), 'F');
  assert.equal(publishedAtOf({fetched_at: 'F', published_at: 'P'}), 'P');
  assert.equal(publishedAtOf(null), null);
  const rec = publishRecord('kiroro', {fetched_at: iso(NOW + 5 * MIN)}, recomputeInputs(sA, targets[0], {now: NOW + 5 * MIN}));
  assert.equal(rec.inputs.jma_msm.summit.run_available_utc, iso(T0 + 300 * MIN), 'model run availability kept apart from collection and publication');
});
await test('memory store = SQL semantics: commit refused without the lease; publish never moves backwards', async () => {
  let t = NOW;
  const store = createMemoryStore({clock: () => t});
  await assert.rejects(store.save('X', state), /lease not held/);
  assert.equal(await store.acquire('X', 60), true);
  await store.savePublish('X', {region_id: 'kiroro', published_at: iso(NOW), input_signature: 's1', inputs: {}});
  await store.savePublish('X', {region_id: 'kiroro', published_at: iso(NOW - HOUR), input_signature: 's0', inputs: {}});
  assert.equal(store.db.publish.kiroro.input_signature, 's1');
  t += 61e3;
  await assert.rejects(store.save('X', state), /lease not held/, 'expired lease');
  assert.equal(await store.acquire('Y'), true, 'expired lease can be taken');
});
for (const d of tmpDirs) rmSync(d, {recursive: true, force: true});

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ` -> ${r.error}` : ''}`);
console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
