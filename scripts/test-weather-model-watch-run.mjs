// Offline integration tests for scripts/weather-model-watch-run.mjs (fake Open-Meteo, in-memory DB with the SQL
// semantics, local file stores) and for the app's Supabase manifest path in dist/weather.js (real code in a vm).
// No network. Writes nothing outside the OS temp directory.
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {regionTargets, readMeta, createMemoryStore, createFileRawStore, createFilePublicStore, watchItems, BEST_MATCH, MANIFEST_PATH, recomputeInputs} from './weather-model-watch.mjs';
import {runWatch, createMemoryOps, collectModel, storedMetaFn, readRepoBmText} from './weather-model-watch-run.mjs';
import {publishRegion, parseModelBody, FETCH_VARS} from './weather-multimodel-publish.mjs';
import {primarySkiAreas} from './weather-points.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const test = async (name, fn) => { try { await fn(); results.push({name, pass: true}); } catch (e) { results.push({name, pass: false, error: e.stack?.split('\n').slice(0, 3).join(' | ') || e.message}); } };
const MIN = 60e3, HOUR = 3600e3;
const iso = ms => new Date(ms).toISOString();
const sha = t => createHash('sha256').update(t).digest('hex');
const UNITS = {temperature_2m: '°C', precipitation: 'mm', rain: 'mm', showers: 'mm', snowfall: 'cm', wind_speed_10m: 'm/s', wind_direction_10m: '°', weather_code: 'wmo code'};
const tmpDirs = []; const tmp = () => { const d = mkdtempSync(path.join(os.tmpdir(), 'pl-run-')); tmpDirs.push(d); return d; };

const ALL = regionTargets(Object.keys(primarySkiAreas));
let NOW = Date.parse('2026-11-20T03:00:00Z');
const clock = () => NOW;
// Fake Open-Meteo: model responses on a UTC hourly axis from the current hour, values depending on model + run.
let runTag = 0, failing = new Set(), apiCalls = 0;
const fakeApi = async url => {
  apiCalls++;
  const u = new URL(String(url));
  const id = u.searchParams.get('models'), days = Number(u.searchParams.get('forecast_days'));
  const key = `${u.searchParams.get('latitude')}|${id}`;
  if ([...failing].some(f => key.includes(f))) return {ok: false, status: 503, json: async () => ({error: true, reason: 'down'})};
  const start = Math.floor(NOW / HOUR) * HOUR, n = days * 24;
  const time = Array.from({length: n}, (_, i) => iso(start + i * HOUR).slice(0, 16));
  const base = {jma_msm: -6, ecmwf_ifs025: -4, gfs_seamless: -8}[id] ?? -5;
  const hourly = {time, temperature_2m: time.map((_, i) => base + runTag * 0.1 + (i % 24) * 0.05), precipitation: time.map(() => 0.5), rain: time.map(() => 0),
    showers: time.map(() => 0), snowfall: time.map(() => 0.35), wind_speed_10m: time.map(() => 3), wind_direction_10m: time.map(() => 270), weather_code: time.map(() => 71)};
  return {ok: true, status: 200, json: async () => ({latitude: Number(u.searchParams.get('latitude')), longitude: Number(u.searchParams.get('longitude')), elevation: Number(u.searchParams.get('elevation')),
    utc_offset_seconds: 0, hourly_units: Object.fromEntries(FETCH_VARS.map(v => [v, UNITS[v]])), hourly})};
};
const runAt = {}; // run tag -> time the run was first served (fixed afterwards: same run until runTag changes)
const metaApi = () => async url => ({ok: true, json: async () => ({last_run_initialisation_time: Math.floor(((runAt[runTag] ??= NOW) - 4 * HOUR) / 1000), last_run_availability_time: Math.floor((runAt[runTag] - 2 * HOUR) / 1000),
  update_interval_seconds: String(url).includes('jma') ? 10800 : 21600})});
// Best Match files from the repo, re-stamped as freshly collected by the 2 h pipeline at bmAt (axis unchanged).
let bmAt = null, bmBroken = new Set();
const readBmText = async region => {
  const j = JSON.parse(readRepoBmText(region));
  if (bmBroken.has(region)) j.hourly = null;
  if (bmAt != null) j.fetched_at = iso(bmAt);
  return JSON.stringify(j);
};
const env = () => {
  const store = createMemoryStore({clock});
  const dir = tmp();
  return {store, ops: createMemoryOps(store), rawStore: createFileRawStore(path.join(dir, 'raw')), publicStore: createFilePublicStore(path.join(dir, 'public')), dir};
};
const country = Object.fromEntries(ALL.map(t => [t.region, t.country]));
const go = (e, targets = ALL, extra = {}) => runWatch({targets, ...e, clock, readBmText, holder: `t-${Math.random()}`,
  readMetaFn: h => readMeta({fetchImpl: metaApi(), holder: h, now: clock}),
  collect: item => collectModel(item, {country: country[item.region], fetchImpl: fakeApi, readBmText, wait: async () => {}}), ...extra});

const E = env();
bmAt = NOW - 30 * MIN;
const first = await go(E);

await test('15 regions: 117 model items collected, 45 Best Match observed = 162 watched items', () => {
  assert.equal(first.status, 'committed');
  assert.equal(first.results.length, 117);
  assert(first.results.every(r => r.ok));
  assert.equal(watchItems(ALL).length, 162);
  const st = E.store.db.state;
  const have = watchItems(ALL).filter(k => st.targets?.[k.region]?.[k.model]?.[k.point]?.status === 'ok');
  assert.equal(have.length, 162);
  assert.equal(first.report.best_match_changed, 45);
});
await test('15 regions: every region recalculated with the existing formula, validated and published + manifest', () => {
  assert.equal(first.report.published.length, 15, JSON.stringify(first.report.publish_skipped.map(p => `${p.region}:${p.reason}:${(p.issues || []).join('|')}`)));
  const man = JSON.parse(readFileSync(path.join(E.dir, 'public', MANIFEST_PATH), 'utf8'));
  assert.equal(Object.keys(man.files).length, 30);
  for (const [rel, f] of Object.entries(man.files)) assert.equal(sha(readFileSync(path.join(E.dir, 'public', rel))), f.sha256, rel);
  const mm = JSON.parse(readFileSync(path.join(E.dir, 'public', 'weather-multimodel/kiroro.json'), 'utf8'));
  assert.equal(mm.multimodel.validation.ok, true);
  assert.equal(mm.published_at, mm.fetched_at, 'published_at = fetched_at (meaning unchanged)');
});
await test('stored-original path == direct path (same formula, weights, missing policy)', async () => {
  const region = 'kiroro', target = ALL.find(t => t.region === region);
  const bmText = await readBmText(region), bm = JSON.parse(bmText);
  const direct = await publishRegion(region, {now: NOW, bm, bmBuf: Buffer.from(bmText), previous: null, metaFn: storedMetaFn(E.store.db.state),
    fetchFn: async (id, m, point) => { const {modelUrl} = await import('./weather-multimodel-publish.mjs'); return parseModelBody(id, await (await fakeApi(modelUrl(id, m, point))).json()); }});
  const pub = JSON.parse(readFileSync(path.join(E.dir, 'public', `weather-multimodel/${region}.json`), 'utf8'));
  assert.deepEqual(pub.hourly, direct.mm.hourly);
  assert.deepEqual(pub.daily, direct.mm.daily);
  assert.deepEqual(pub.multimodel.hourly_weights, direct.mm.multimodel.hourly_weights);
  assert.equal(recomputeInputs(E.store.db.state, target, {now: NOW}).jma_msm.summit.confirmed, true);
});
await test('usage: 117 forecast requests + 4 meta + 1 check counted once', () => {
  const u = E.store.db.usage['2026-11-20'];
  assert.deepEqual([u.forecast_requests, u.meta_requests, u.checks], [117, 4, 1]);
  // weighted with the weather-api-usage rule: JP 9 × 3 × (1 + 1.0714 + 1.1429) + KR 6 × 3 × (1.0714 + 1.1429)
  assert(Math.abs(u.forecast_weighted - (27 * (1 + 15 / 14 + 16 / 14) + 18 * (15 / 14 + 16 / 14))) < 0.5, String(u.forecast_weighted));
});
await test('no new run, no new Best Match: nothing fetched, nothing republished', async () => {
  NOW += 30 * MIN; const before = apiCalls;
  const r = await go(E);
  assert.equal(r.results.length, 0);
  assert.equal(apiCalls, before);
  assert.equal(r.report.published.length, 0);
});
await test('new JMA run only, one point failing: other regions publish; failing region keeps previous good inputs', async () => {
  runTag = 1; NOW += 30 * MIN; failing = new Set(['jma_msm']);
  const K = ALL.find(t => t.region === 'kiroro');
  const lat = String(JSON.parse(await readBmText('kiroro')).points.find(p => p.point_type === 'mid').latitude);
  failing = new Set([`${lat}|jma_msm`]);
  const prevPub = readFileSync(path.join(E.dir, 'public', 'weather-multimodel/kiroro.json'), 'utf8');
  const r = await go(E);
  assert(r.results.length > 0);
  const failed = r.results.filter(x => !x.ok);
  assert(failed.length >= 1 && failed.every(x => x.model === 'jma_msm'));
  const it = E.store.db.state.targets.kiroro.jma_msm.mid;
  assert.equal(it.status, 'failed');
  assert(it.raw, 'previous good original kept');
  assert(recomputeInputs(E.store.db.state, K, {now: NOW}).jma_msm.mid, 'previous original still fresh -> still used');
  assert(r.report.published.length >= 1);
  const nowPub = readFileSync(path.join(E.dir, 'public', 'weather-multimodel/kiroro.json'), 'utf8');
  assert.notEqual(nowPub, prevPub, 'kiroro republished with its new summit/base inputs');
  failing = new Set();
});
await test('invalid recalculation never published: previous file kept', async () => {
  const before = readFileSync(path.join(E.dir, 'public', 'weather-multimodel/niseko.json'), 'utf8');
  bmBroken = new Set(['niseko']); runTag = 2; NOW += 30 * MIN;
  const r = await go(E, ALL.filter(t => t.region === 'niseko'));
  const sk = r.report.publish_skipped.find(p => p.region === 'niseko');
  assert(sk, 'niseko skipped');
  assert.equal(readFileSync(path.join(E.dir, 'public', 'weather-multimodel/niseko.json'), 'utf8'), before);
  bmBroken = new Set();
});
await test('lease: a second concurrent watch is refused (lease_busy) and fetches nothing', async () => {
  const S = env();
  let inner = null; const calls0 = apiCalls;
  runTag = 3; NOW += 30 * MIN;
  const outer = await go(S, ALL.slice(0, 1), {collect: async item => { if (!inner) inner = await go(S, ALL.slice(0, 1)); return collectModel(item, {country: country[item.region], fetchImpl: fakeApi, readBmText, wait: async () => {}}); }});
  assert.equal(outer.status, 'committed');
  assert.equal(inner.status, 'lease_busy');
  assert.equal(apiCalls - calls0, outer.results.length, 'only the lease holder fetched');
});
await test('admin alerts: 24 h stale -> one alert with region/model/point; 48 h -> one re-alert; recovery -> one notice; no duplicates', async () => {
  const A = env(); const two = ALL.filter(t => ['kiroro', 'yongpyong'].includes(t.region));
  runTag = 10; NOW = Date.parse('2026-11-21T00:00:00Z'); bmAt = NOW - 30 * MIN;
  await go(A, two);
  const lat = String(JSON.parse(await readBmText('kiroro')).points.find(p => p.point_type === 'base').latitude);
  failing = new Set([`${lat}|ecmwf_ifs025`]);
  const step = async h => { NOW += h * HOUR; runTag++; bmAt = NOW - 30 * MIN; return go(A, two); };
  for (let i = 0; i < 4; i++) await step(6);       // 24 h later
  let alerts = Object.values(A.store.db.alerts);
  assert.equal(alerts.length, 1, JSON.stringify(alerts.map(a => a.alert_key)));
  assert.equal(alerts[0].kind, 'stale_24h');
  assert.match(alerts[0].body, /kiroro·ECMWF·하단\(24h\)/);
  assert.deepEqual(alerts[0].items.map(i => `${i.region}/${i.model}/${i.point}`), ['kiroro/ecmwf_ifs025/base']);
  await step(6); await step(6);                    // still stale, no duplicate
  assert.equal(Object.values(A.store.db.alerts).length, 1);
  for (let i = 0; i < 2; i++) await step(6);       // 48 h
  alerts = Object.values(A.store.db.alerts);
  assert.deepEqual(alerts.map(a => a.kind).sort(), ['stale_24h', 'stale_48h']);
  failing = new Set();
  await step(6);
  alerts = Object.values(A.store.db.alerts);
  assert.deepEqual(alerts.map(a => a.kind).sort(), ['recovered', 'stale_24h', 'stale_48h']);
  assert(Object.values(A.store.db.incidents).every(i => i.closed_at), 'incident closed');
  await step(6);
  assert.equal(Object.values(A.store.db.alerts).length, 3, 'no new alert while healthy');
  assert(alerts.every(a => a.status === 'pending'), 'queued only (sending is a separate approved step)');
});
await test('Best Match not updated by the 2 h pipeline for 24 h -> its 3 points alert too', async () => {
  const B = env(); const one = ALL.filter(t => t.region === 'yongpyong');
  runTag = 50; NOW = Date.parse('2026-11-25T00:00:00Z'); bmAt = NOW - 30 * MIN;
  await go(B, one);
  const frozen = bmAt;
  for (let i = 0; i < 5; i++) { NOW += 6 * HOUR; runTag++; bmAt = frozen; await go(B, one); }
  const a = Object.values(B.store.db.alerts);
  assert.equal(a.length, 1);
  assert.deepEqual(a[0].items.map(i => `${i.model}/${i.point}`).sort(), ['best_match/base', 'best_match/mid', 'best_match/summit']);
  bmAt = null;
});

// ---------------- app: Supabase manifest path in dist/weather.js (real code in a vm) ----------------
const src = readFileSync(path.join(ROOT, 'dist/weather.js'), 'utf8');
const grab = (start, end) => { const a = src.indexOf(start), b = src.indexOf(end, a); if (a < 0 || b < 0) throw new Error(`section not found: ${start}`); return src.slice(a, b); };
const code = grab('  const cache = new Map();', '  let regionId') + grab('  const getJson = url =>', '  // "2026-11-18T16:45:00+09:00"')
  + grab('  const wallTime = iso =>', '  function renderCard');
function app(files, {native = true} = {}) {
  const storage = new Map(), calls = [];
  const localStorage = {getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), key: i => [...storage.keys()][i] ?? null, get length() { return storage.size; }};
  const ctx = {document: {baseURI: 'https://localhost/'}, URL, Promise, JSON, Object, Map, Array, Uint8Array, TextEncoder, crypto: webcrypto, structuredClone, AbortController, setTimeout, clearTimeout, localStorage,
    Date, Number, String, window: {Capacitor: {isNativePlatform: () => native}},
    fetch: async (url, opts) => {
      const k = String(url); calls.push(k);
      const f = files[k.split('?')[0]] ?? files[k];
      if (f === undefined) return {ok: false, json: async () => { throw new Error('404'); }, text: async () => ''};
      const body = typeof f === 'string' ? f : JSON.stringify(f);
      return {ok: true, json: async () => JSON.parse(body), text: async () => body};
    }};
  vm.createContext(ctx);
  vm.runInContext(`${code}\nthis.load = load; this.cache = cache; this.publishedLabel = publishedLabel;`, ctx);
  return {ctx, calls, storage, files};
}
const GH = 'https://ygbsss-collab.github.io/powderline-hokkaido/data/';
const SB = 'https://lxfsvhwibiaspnaduhri.supabase.co/storage/v1/object/public/weather-public/';
const pubDir = path.join(E.dir, 'public');
const sbText = rel => readFileSync(path.join(pubDir, rel), 'utf8');
const manifest = () => JSON.parse(sbText(MANIFEST_PATH));
const ghFiles = sw => ({[`${GH}weather-source.json`]: sw, [`${GH}weather/kiroro.json`]: JSON.parse(readRepoBmText('kiroro')),
  [`${GH}weather-multimodel/kiroro.json`]: JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather-multimodel/kiroro.json'), 'utf8'))});
const sbFiles = () => ({[`${SB}manifest.json`]: sbText(MANIFEST_PATH), [`${SB}weather/kiroro.json`]: sbText('weather/kiroro.json'), [`${SB}weather-multimodel/kiroro.json`]: sbText('weather-multimodel/kiroro.json')});

await test('app: switch {"supabase": true} -> newest valid file from the manifest wins, saved for offline', async () => {
  const A = app({...ghFiles({primary: 'multimodel', supabase: true}), ...sbFiles()});
  const r = await A.ctx.load('kiroro');
  assert.equal(r.dataOrigin, 'supabase');
  assert.equal(r.forecastSource, 'multimodel');
  assert.equal(r.fetched_at, JSON.parse(sbText('weather-multimodel/kiroro.json')).fetched_at);
  assert(A.storage.has('powderline.weather.v1.kiroro'), 'saved copy for offline use (existing cache)');
  assert(A.calls.some(c => c.startsWith(`${SB}weather-multimodel/kiroro.json?v=`)));
});
await test('app: unchanged sha256 -> served from the device copy, no file download', async () => {
  const A = app({...ghFiles({primary: 'multimodel', supabase: true}), ...sbFiles()});
  await A.ctx.load('kiroro');
  A.ctx.cache.clear();
  const n = A.calls.filter(c => c.startsWith(`${SB}weather`)).length;
  vm.runInContext('sbManifest = null; sourceConfigs.clear();', A.ctx);
  const r = await A.ctx.load('kiroro');
  assert.equal(r.dataOrigin, 'supabase');
  assert.equal(A.calls.filter(c => c.startsWith(`${SB}weather`)).length, n, 'only the manifest was fetched again');
});
await test('app: file not matching the manifest hash is rejected (GitHub copy used)', async () => {
  const files = {...ghFiles({primary: 'multimodel', supabase: true}), ...sbFiles()};
  const tampered = JSON.parse(sbText('weather-multimodel/kiroro.json')); tampered.hourly.summit.temperature_2m[0] = 99;
  files[`${SB}weather-multimodel/kiroro.json`] = JSON.stringify(tampered);
  files[`${SB}weather/kiroro.json`] = '{}';
  const A = app(files);
  const r = await A.ctx.load('kiroro');
  assert.notEqual(r.dataOrigin, 'supabase');
});
await test('app: switch without supabase -> manifest never requested (current service unchanged)', async () => {
  const A = app({...ghFiles({primary: 'multimodel'}), ...sbFiles()});
  const r = await A.ctx.load('kiroro');
  assert.equal(r.dataOrigin, 'remote');
  assert(!A.calls.some(c => c.startsWith(SB)));
});
const LOCAL = 'https://localhost/data/';
const webFiles = sw => ({[`${LOCAL}weather-source.json`]: sw, [`${LOCAL}weather/kiroro.json`]: ghFiles({})[`${GH}weather/kiroro.json`],
  [`${LOCAL}weather-multimodel/kiroro.json`]: ghFiles({})[`${GH}weather-multimodel/kiroro.json`]});
const olderSb = () => { // Supabase copy published BEFORE the GitHub data (stale Supabase)
  const f = sbFiles(), mm = JSON.parse(f[`${SB}weather-multimodel/kiroro.json`]), bm = JSON.parse(f[`${SB}weather/kiroro.json`]);
  mm.fetched_at = mm.published_at = '2026-01-01T00:00:00.000Z'; bm.fetched_at = '2026-01-01T00:00:00.000Z';
  const t = {mm: JSON.stringify(mm), bm: JSON.stringify(bm)};
  const man = {data_kind: 'powderline_weather_manifest', schema_version: 1, files: {'weather-multimodel/kiroro.json': {sha256: sha(t.mm)}, 'weather/kiroro.json': {sha256: sha(t.bm)}}};
  return {[`${SB}manifest.json`]: JSON.stringify(man), [`${SB}weather-multimodel/kiroro.json`]: t.mm, [`${SB}weather/kiroro.json`]: t.bm};
};
await test('web: {"supabase": true} -> newer Supabase copy used; GitHub Pages copy otherwise', async () => {
  const W = app({...webFiles({primary: 'multimodel', supabase: true}), ...sbFiles()}, {native: false});
  const r = await W.ctx.load('kiroro');
  const sbAt = JSON.parse(sbText('weather-multimodel/kiroro.json')).fetched_at, ghAt = webFiles({})[`${LOCAL}weather-multimodel/kiroro.json`].fetched_at;
  assert.equal(r.dataOrigin, Date.parse(sbAt) > Date.parse(ghAt) ? 'supabase' : undefined);
  const W0 = app({...webFiles({primary: 'multimodel'}), ...sbFiles()}, {native: false});
  assert.equal((await W0.ctx.load('kiroro')).dataOrigin, undefined, 'switch off: unchanged web behaviour');
  assert(!W0.calls.some(c => c.startsWith(SB)));
});
await test('fallback: stale Supabase copy -> GitHub data (web and Android)', async () => {
  const W = app({...webFiles({primary: 'multimodel', supabase: true}), ...olderSb()}, {native: false});
  assert.notEqual((await W.ctx.load('kiroro')).dataOrigin, 'supabase');
  const A = app({...ghFiles({primary: 'multimodel', supabase: true}), ...olderSb()});
  assert.equal((await A.ctx.load('kiroro')).dataOrigin, 'remote');
});
await test('fallback: Supabase down / manifest missing -> GitHub data, saved copy kept', async () => {
  const A = app({...ghFiles({primary: 'multimodel', supabase: true})}); // no Supabase files at all
  const r = await A.ctx.load('kiroro');
  assert.equal(r.dataOrigin, 'remote');
  assert(A.storage.has('powderline.weather.v1.kiroro'));
  const W = app({...webFiles({primary: 'multimodel', supabase: true})}, {native: false});
  assert.equal((await W.ctx.load('kiroro')).forecastSource, 'multimodel');
});
await test('fallback: offline -> newest saved copy (existing cache priority unchanged)', async () => {
  const A = app({...ghFiles({primary: 'multimodel', supabase: true}), ...sbFiles()});
  const first = await A.ctx.load('kiroro');
  for (const k of Object.keys(A.files)) delete A.files[k]; // network gone
  A.ctx.cache.clear(); vm.runInContext('sbManifest = null; sourceConfigs.clear();', A.ctx);
  const r = await A.ctx.load('kiroro');
  assert.equal(r.dataOrigin, 'saved');
  assert.equal(r.fetched_at, first.fetched_at);
});
await test('app: home banner and detail header use the same final publication time', () => {
  const A = app({});
  const mm = JSON.parse(sbText('weather-multimodel/kiroro.json'));
  const label = A.ctx.publishedLabel(mm);
  const wall = new Date(Date.parse(mm.published_at) + mm.utc_offset_seconds * 1000).toISOString().slice(11, 16);
  assert.equal(label, `게시 ${wall}`);
  assert.equal(A.ctx.publishedLabel({...mm, published_at: undefined}), label, 'falls back to fetched_at (same instant)');
  const homeLine = src.match(/timeEl\.textContent = s \? `\$\{wallTime\(s\.time\)\}\$\{pub \?/), detailLine = src.match(/기준\$\{stale \? ' · 이전' : ''\}\$\{pub \?/);
  assert(homeLine && detailLine, 'both render publishedLabel(data)');
});

for (const d of tmpDirs) rmSync(d, {recursive: true, force: true});
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ` -> ${r.error}` : ''}`);
console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
