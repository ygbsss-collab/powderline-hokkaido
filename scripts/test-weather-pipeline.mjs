// Offline tests for scripts/weather-pipeline.mjs (no network: the collector is replaced by stubs).
// Writes work/weather/weather-pipeline-tests.json. Published files are checked by sha256 before/after.
import {readFileSync, existsSync, writeFileSync, rmSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateWeather, validateResult, runRegion} from './weather-pipeline.mjs';
import {writeJsonAtomic, publishedPath} from './snow-surface-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const sha = f => (existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex') : null);
const region = 'kiroro';
const weatherFile = path.join(ROOT, 'dist/data/weather', `${region}.json`);
const weather = JSON.parse(readFileSync(weatherFile, 'utf8'));
const fetched = Date.parse(weather.fetched_at);
const ok = {region, notBeforeMs: fetched - 1000, nowMs: fetched + 1000};
const clone = o => structuredClone(o);

// validateWeather
check('weather.current_file_valid_for_its_run', validateWeather(weather, ok).length === 0, {issues: validateWeather(weather, ok)});
check('weather.stale_file_rejected', validateWeather(weather, {...ok, notBeforeMs: fetched + 60e3}).some(i => i.includes('older than this run')));
{ const w = clone(weather); w.hourly.time.splice(10, 1); for (const p of ['summit', 'mid', 'base']) for (const f of Object.keys(w.hourly[p])) w.hourly[p][f].splice(10, 1);
  check('weather.time_gap_rejected', validateWeather(w, ok).some(i => i.includes('1 h steps'))); }
{ const w = clone(weather); delete w.hourly.mid; check('weather.missing_point_rejected', validateWeather(w, ok).some(i => i.includes('hourly.mid missing'))); }
{ const w = clone(weather); w.hourly.base.snowfall.pop(); check('weather.series_length_mismatch_rejected', validateWeather(w, ok).some(i => i.includes('base.snowfall'))); }
{ const w = clone(weather); w.utc_offset_seconds = 0; check('weather.offset_mismatch_rejected', validateWeather(w, ok).some(i => i.includes('offset'))); }
{ const w = clone(weather); w.region_id = 'niseko'; check('weather.region_mismatch_rejected', validateWeather(w, ok).some(i => i.includes('region_id'))); }

// validateResult (built from the real engine output shape)
{
  const {loadInputs, runEngine} = await import('./snow-surface-engine.mjs');
  const inputs = loadInputs(region, weather.fetched_at);
  const res = runEngine(inputs);
  const args = {region, weatherSha: inputs.sources.model.sha256, fetchedAt: weather.fetched_at};
  check('result.engine_output_valid', validateResult(res, args).length === 0, {issues: validateResult(res, args)});
  check('result.other_file_sha_rejected', validateResult(res, {...args, weatherSha: 'x'}).some(i => i.includes('differs')));
  check('result.fetched_at_mismatch_rejected', validateResult(res, {...args, fetchedAt: new Date(fetched + HOUR).toISOString()}).some(i => i.includes('collected_at')));
  const r2 = clone(res); delete r2.points.base; check('result.missing_point_rejected', validateResult(r2, args).some(i => i.includes('points.base')));
}

// Atomic write: target replaced in one step, no temp file left behind, parse-checked content.
{
  const dir = path.join(ROOT, 'work/weather');
  const f = path.join(dir, 'pipeline-atomic-test.json');
  writeJsonAtomic(f, {a: 1});
  writeJsonAtomic(f, {a: 2});
  const leftovers = readdirSync(dir).filter(n => n.startsWith('pipeline-atomic-test.json.tmp-'));
  check('atomic.replaces_and_cleans_temp', JSON.parse(readFileSync(f, 'utf8')).a === 2 && leftovers.length === 0, {leftovers});
  rmSync(f, {force: true});
}

// Failure handling: previous published file must stay byte-identical.
{
  const pub = publishedPath(region);
  const before = sha(pub);
  const weatherBefore = sha(weatherFile);
  const r1 = await runRegion(region, {collectFn: async () => ({exit_code: 1, published: null, errors: [{error: 'stub network failure'}]})});
  check('failure.collect_failed_keeps_previous', !r1.ok && r1.failed_step === 'collect' && sha(pub) === before, {failed_step: r1.failed_step});
  // Collector "succeeds" but the forecast file was not refreshed in this run (old fetched_at) -> rejected, nothing published.
  const r2 = await runRegion(region, {collectFn: async () => ({exit_code: 0, published: 'dist/data/weather/kiroro.json', errors: []})});
  check('failure.stale_forecast_keeps_previous', !r2.ok && r2.failed_step === 'validate_weather' && sha(pub) === before, {issues: r2.steps?.validate_weather?.issues});
  check('failure.forecast_file_untouched', sha(weatherFile) === weatherBefore);
}

// Region independence: a throwing region does not stop the next one (same loop shape as the CLI).
{
  const order = [];
  for (const [id, fn] of [['a', async () => { throw new Error('boom'); }], ['b', async () => ({published: null})]]) {
    try { await runRegion(region, {collectFn: async () => { order.push(id); return fn(); }}); } catch { order.push(`${id}:threw`); }
  }
  check('independence.next_region_still_runs', order.includes('b'), {order});
}

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-pipeline-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
