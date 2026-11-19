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
check('fetch_uses_no_cache', /cache: 'no-cache'/.test(code));
check('stale_label_after_6h_exists', /STALE_MS = 6 \* 3600 \* 1000/.test(src) && /· 이전/.test(src));

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-loader-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
