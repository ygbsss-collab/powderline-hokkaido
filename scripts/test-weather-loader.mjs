// Tests of the forecast loader in dist/weather.js (real code, sandboxed fetch + clock): source switch, Best Match
// fallback rules, and the 30 min reload of cached forecasts. Writes work/weather/weather-loader-tests.json.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const src = readFileSync(path.join(ROOT, 'dist/weather.js'), 'utf8');
const grab = (start, end) => { const a = src.indexOf(start), b = src.indexOf(end, a); if (a < 0 || b < 0) throw new Error(`section not found: ${start}`); return src.slice(a, b); };
const code = grab('  const cache = new Map();', '  let regionId') + grab('  const getJson = url =>', '  // "2026-11-18T16:45:00+09:00"');
const bm = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather/kiroro.json'), 'utf8'));
const mm = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather-multimodel/kiroro.json'), 'utf8'));

function makeLoader(files) {
  const calls = [];
  let now = Date.parse('2026-11-19T00:00:00Z');
  const ctx = {
    document: {baseURI: 'https://x/app/'}, URL, Promise, JSON, Object, Map, Date: class extends Date { static now() { return now; } },
    fetch: async url => { const k = String(url).replace('https://x/app/', './'); calls.push(k); const f = files[k]; return f === undefined ? {ok: false} : {ok: true, json: async () => structuredClone(f)}; }
  };
  vm.createContext(ctx);
  vm.runInContext(`${code}\nthis.load = load;`, ctx);
  return {load: id => ctx.load(id), calls, advance: ms => { now += ms; }, files};
}
const sw = p => ({'./data/weather-source.json': {primary: p}});
const both = {'./data/weather/kiroro.json': bm, './data/weather-multimodel/kiroro.json': mm};
const run = async files => { const L = makeLoader(files); const r = await L.load('kiroro'); return r ? `${r.forecastSource}${r.forecastFallback ? `:${r.forecastFallback}` : ''}` : 'null'; };

check('switch_multimodel_uses_multimodel', await run({...sw('multimodel'), ...both}) === 'multimodel');
check('switch_best_match_rollback', await run({...sw('best_match'), ...both}) === 'best_match');
check('no_switch_file_best_match', await run(both) === 'best_match');
check('multimodel_missing_falls_back', await run({...sw('multimodel'), './data/weather/kiroro.json': bm}) === 'best_match:multimodel_unavailable');
check('multimodel_invalid_falls_back', await run({...sw('multimodel'), './data/weather/kiroro.json': bm, './data/weather-multimodel/kiroro.json': {...mm, multimodel: {...mm.multimodel, validation: {ok: false}}}}) === 'best_match:multimodel_rejected');
check('multimodel_older_than_bm_falls_back', await run({...sw('multimodel'), './data/weather/kiroro.json': {...bm, fetched_at: new Date(Date.parse(mm.fetched_at) + 2 * 3600e3).toISOString()}, './data/weather-multimodel/kiroro.json': mm}) === 'best_match:multimodel_rejected');
check('wrong_region_falls_back', await run({...sw('multimodel'), './data/weather/kiroro.json': bm, './data/weather-multimodel/kiroro.json': {...mm, region_id: 'niseko'}}) === 'best_match:multimodel_rejected');
check('nothing_null', await run(sw('multimodel')) === 'null');
{
  const L = makeLoader({...sw('multimodel'), ...both});
  await L.load('kiroro'); const n1 = L.calls.length;
  L.advance(10 * 60e3); await L.load('kiroro'); const n2 = L.calls.length;
  L.advance(25 * 60e3); await L.load('kiroro'); const n3 = L.calls.length;
  check('cached_within_30min', n2 === n1, {n1, n2});
  check('reloaded_after_30min_incl_switch', n3 > n2 && L.calls.slice(n2).includes('./data/weather-source.json'), {n3});
  // A newer file published by CI is picked up after the reload window.
  L.files['./data/weather-multimodel/kiroro.json'] = {...mm, fetched_at: '2026-11-19T06:20:00.000Z'};
  L.files['./data/weather/kiroro.json'] = {...bm, fetched_at: '2026-11-19T06:10:00.000Z'};
  L.advance(31 * 60e3); const r = await L.load('kiroro');
  check('new_publication_picked_up', r.fetched_at === '2026-11-19T06:20:00.000Z' && r.forecastSource === 'multimodel');
}
// ---- Android app (Capacitor): remote GitHub Pages copy first, APK copy as fallback, newest file wins ----
const REMOTE = 'https://ygbsss-collab.github.io/powderline-hokkaido/';
function makeNative({remote = {}, local = {}, remoteDown = false, storage = new Map()}) {
  const calls = [];
  let now = Date.parse('2026-11-19T00:00:00Z');
  const localStorage = {getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), key: i => [...storage.keys()][i] ?? null, get length() { return storage.size; }};
  const ctx = {
    document: {baseURI: 'https://localhost/'}, URL, Promise, JSON, Object, Map, AbortController, setTimeout, clearTimeout, localStorage,
    window: {Capacitor: {isNativePlatform: () => true}}, Date: class extends Date { static now() { return now; } },
    fetch: async url => {
      const s = String(url); calls.push(s);
      if (s.startsWith(REMOTE)) {
        if (remoteDown) throw new TypeError('Failed to fetch');
        const f = remote['./' + s.slice(REMOTE.length)];
        return f === undefined ? {ok: false, status: 404, json: async () => { throw new SyntaxError('HTML'); }} : {ok: true, json: async () => structuredClone(f)};
      }
      const f = local[s.replace('https://localhost/', './')];
      return f === undefined ? {ok: false} : {ok: true, json: async () => structuredClone(f)};
    }
  };
  vm.createContext(ctx);
  vm.runInContext(`${code}\nthis.load = load;`, ctx);
  return {load: id => ctx.load(id), calls, advance: ms => { now += ms; }, remote, local, storage};
}
const at = (j, iso) => ({...j, fetched_at: iso});
const pair = (b, m) => ({'./data/weather/kiroro.json': b, './data/weather-multimodel/kiroro.json': m});
{
  const remoteData = {...sw('multimodel'), ...pair(at(bm, '2026-11-19T04:00:00.000Z'), at(mm, '2026-11-19T04:00:01.000Z'))};
  const localData = {...sw('multimodel'), ...pair(at(bm, '2026-11-18T22:00:00.000Z'), at(mm, '2026-11-18T22:00:01.000Z'))};
  let L = makeNative({remote: remoteData, local: localData});
  let r = await L.load('kiroro');
  check('native.remote_first', r.dataOrigin === 'remote' && r.fetched_at === '2026-11-19T04:00:01.000Z' && r.forecastSource === 'multimodel' && L.calls.some(c => c === `${REMOTE}data/weather-source.json`), {origin: r.dataOrigin});
  check('native.remote_saved_on_device', JSON.parse(L.storage.get('powderline.weather.v1.kiroro')).fetched_at === '2026-11-19T04:00:01.000Z');
  const saved = L.storage;
  // network down -> last good remote copy (newer than the APK)
  L = makeNative({remote: remoteData, local: localData, remoteDown: true, storage: saved});
  r = await L.load('kiroro');
  check('native.offline_uses_saved_newer_than_apk', r.dataOrigin === 'saved' && r.fetched_at === '2026-11-19T04:00:01.000Z', {origin: r.dataOrigin});
  // network down, nothing saved -> APK copy
  L = makeNative({remote: remoteData, local: localData, remoteDown: true});
  r = await L.load('kiroro');
  check('native.offline_falls_back_to_apk', r.dataOrigin === 'bundled' && r.fetched_at === '2026-11-18T22:00:01.000Z' && r.forecastSource === 'multimodel', {origin: r?.dataOrigin});
  // remote returns the GitHub 404 HTML page (not deployed) -> APK copy
  L = makeNative({remote: {}, local: localData});
  r = await L.load('kiroro');
  check('native.remote_404_html_falls_back_to_apk', r.dataOrigin === 'bundled' && r.forecastSource === 'multimodel', {origin: r?.dataOrigin});
  // remote switch missing -> APK switch decides (multimodel), remote data still used
  L = makeNative({remote: pair(at(bm, '2026-11-19T04:00:00.000Z'), at(mm, '2026-11-19T04:00:01.000Z')), local: localData});
  r = await L.load('kiroro');
  check('native.remote_switch_missing_uses_apk_switch', r.dataOrigin === 'remote' && r.forecastSource === 'multimodel');
  // remote switch best_match wins over APK switch multimodel
  L = makeNative({remote: {...sw('best_match'), ...pair(at(bm, '2026-11-19T04:00:00.000Z'), at(mm, '2026-11-19T04:00:01.000Z'))}, local: localData});
  r = await L.load('kiroro');
  check('native.remote_switch_preferred', r.dataOrigin === 'remote' && r.forecastSource === 'best_match');
  // remote OLDER than the saved copy -> saved copy kept, not overwritten
  L = makeNative({remote: {...sw('multimodel'), ...pair(at(bm, '2026-11-19T00:00:00.000Z'), at(mm, '2026-11-19T00:00:01.000Z'))}, local: localData, storage: new Map(saved)});
  r = await L.load('kiroro');
  check('native.older_remote_does_not_replace_saved', r.dataOrigin === 'saved' && r.fetched_at === '2026-11-19T04:00:01.000Z' && JSON.parse(L.storage.get('powderline.weather.v1.kiroro')).fetched_at === '2026-11-19T04:00:01.000Z');
  // remote OLDER than the APK copy -> APK copy
  L = makeNative({remote: {...sw('multimodel'), ...pair(at(bm, '2026-11-18T10:00:00.000Z'), at(mm, '2026-11-18T10:00:01.000Z'))}, local: localData});
  r = await L.load('kiroro');
  check('native.older_remote_does_not_replace_apk', r.dataOrigin === 'bundled');
  // 30 min reload keeps working and picks up a newer remote publication (new "HH:mm 기준")
  L = makeNative({remote: structuredClone(remoteData), local: localData});
  r = await L.load('kiroro'); const t1 = r.current.summit.forecast_time; const n1 = L.calls.length;
  L.advance(10 * 60e3); await L.load('kiroro');
  check('native.cached_within_30min', L.calls.length === n1);
  const next = at(mm, '2026-11-19T06:00:01.000Z'); next.current = structuredClone(mm.current); next.current.summit.forecast_time = '2026-11-19T15:00:00+09:00';
  L.remote['./data/weather-multimodel/kiroro.json'] = next; L.remote['./data/weather/kiroro.json'] = at(bm, '2026-11-19T06:00:00.000Z');
  L.advance(25 * 60e3); r = await L.load('kiroro');
  check('native.reload_after_30min_new_base_time', r.dataOrigin === 'remote' && r.current.summit.forecast_time === '2026-11-19T15:00:00+09:00' && r.current.summit.forecast_time !== t1);
}
{ // storage throwing on every call
  const storage = new Map();
  const L = makeNative({remote: {...sw('multimodel'), ...pair(at(bm, '2026-11-19T04:00:00.000Z'), at(mm, '2026-11-19T04:00:01.000Z'))}, local: {}, storage});
  storage.set = () => { throw new Error('QuotaExceededError'); }; storage.get = () => { throw new Error('denied'); }; storage.has = () => { throw new Error('denied'); };
  const r = await L.load('kiroro');
  check('native.storage_errors_ignored', r?.dataOrigin === 'remote');
}
// Every region (Korea + Japan) resolves remote paths under the same base.
{
  const regions = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/livecams.json'), 'utf8')).regions;
  const ids = Object.keys(regions);
  const L = makeNative({remote: {}, local: {}});
  for (const id of ids) await L.load(id);
  check('native.all_regions_request_remote', ids.length >= 15 && ids.every(id => L.calls.includes(`${REMOTE}data/weather/${encodeURIComponent(id)}.json`)), {regions: ids.length});
}
{ const L = makeLoader({...sw('multimodel'), ...both}); await L.load('kiroro'); check('web_build_has_no_remote_requests', L.calls.length > 0 && L.calls.every(c => c.startsWith('./'))); }
check('fetch_uses_no_cache', /cache: 'no-cache'/.test(code));
check('stale_label_after_6h_exists', /STALE_MS = 6 \* 3600 \* 1000/.test(src) && /· 이전/.test(src));

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-loader-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
