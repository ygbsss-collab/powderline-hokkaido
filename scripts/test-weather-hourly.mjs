// Hourly-update robustness tests (offline; stubs for model data, run meta and git HEAD contents):
// model run not yet published, API lag, identical forecast repeated, JMA-only update, ECMWF / GFS missing, partial
// data, 429 / timeout, all models failing, stale kept files, and an older result arriving after a newer one.
// Writes work/weather/weather-hourly-tests.json.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publishRegion, runClaims, regressedModels, fetchRunMeta} from './weather-multimodel-publish.mjs';
import {fetchForecast} from './weather-model-compare-kiroro.mjs';
import {decide, contentSignature, timeAxisMoved, MAX_AGE_H} from './weather-ci-stage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const region = 'kiroro';
const bmBuf = readFileSync(path.join(ROOT, 'dist/data/weather', `${region}.json`));
const bm = JSON.parse(bmBuf);
const now = Date.parse(bm.fetched_at);
const anchor = Math.floor(now / HOUR) * HOUR;
const axis = bm.hourly.time.map(t => Date.parse(t));
const clone = o => structuredClone(o);

// ---- stubs ----
const VAL = {best_match: -1, jma_msm: -2, ecmwf_ifs025: -4, gfs_seamless: -8};
const stubFetch = ({fail = [], partial = null, jmaShift = 0} = {}) => async id => {
  if (fail.includes(id)) throw new Error('stub failure');
  const at = new Map(), last = {};
  for (const t of axis) {
    const lead = Math.round((t - anchor) / HOUR);
    if (id !== 'best_match' && lead < 1) continue;
    if (id === 'jma_msm' && lead > 66) continue;
    const T = VAL[id] + (id === 'jma_msm' ? jmaShift : 0);
    const hole = partial && partial.id === id && lead >= partial.from && lead <= partial.to;
    const row = {temperature_2m: hole ? null : T, precipitation: 0.5, rain: 0.1, snowfall: 0.2, wind_speed_10m: 3, wind_direction_10m: 90, weather_code: 3};
    at.set(t, row);
    for (const [k, x] of Object.entries(row)) if (x != null) last[k] = t;
  }
  return {ok: true, at, last, range_utc: null, response_coordinate: {latitude: 1, longitude: 1}};
};
// meta per component: {name: init ISO} ; `after` lets a run land during the fetch
const metaStub = (inits, after = null) => {
  let calls = 0;
  const names = ['jma_msm', 'ecmwf_ifs025', 'ncep_gfs013', 'ncep_gfs025'];
  return async name => {
    calls++;
    const phaseAfter = after && calls > names.length; // first 4 calls = "before", next 4 = "after"
    const init = (phaseAfter ? after : inits)[name];
    return init ? {ok: true, initialisation_utc: init, availability_utc: init, update_interval_h: name === 'jma_msm' ? 3 : 6} : {ok: false, error: 'HTTP 503'};
  };
};
const RUN1 = {jma_msm: '2026-11-18T21:00:00.000Z', ecmwf_ifs025: '2026-11-18T18:00:00.000Z', ncep_gfs013: '2026-11-18T18:00:00.000Z', ncep_gfs025: '2026-11-18T12:00:00.000Z'};
const RUN2_JMA = {...RUN1, jma_msm: '2026-11-19T00:00:00.000Z'};
const pub = (o = {}) => publishRegion(region, {now, previous: null, fetchFn: stubFetch(o.fetch || {}), metaFn: metaStub(o.meta || RUN1, o.after || null), ...o.opts});
const lead = (mm, L) => mm.hourly.time.findIndex(t => Math.round((Date.parse(t) - anchor) / HOUR) === L);

// 1. run identification
{
  const {mm} = await pub();
  const r = mm.multimodel.model_runs;
  check('meta.jma_run_identified', r.jma_msm.status === 'identified' && r.jma_msm.run_initialisation_utc === RUN1.jma_msm);
  check('meta.gfs_two_components', r.gfs_seamless.components.ncep_gfs013.initialisation_utc === RUN1.ncep_gfs013 && r.gfs_seamless.components.ncep_gfs025.initialisation_utc === RUN1.ncep_gfs025);
  check('meta.best_match_not_invented', r.best_match.status === 'not_identifiable' && r.best_match.run_initialisation_utc === null);
  check('meta.fetched_at_is_collection_time_not_run', mm.fetched_at !== r.jma_msm.run_initialisation_utc && /not a model run time/.test(mm.multimodel.run_note));
}
// 2. API lag / run landing during the fetch -> run not claimed
{
  const {mm, issues} = await pub({after: RUN2_JMA});
  check('lag.run_changed_during_fetch_not_claimed', mm.multimodel.model_runs.jma_msm.status === 'run_changed_during_fetch' && mm.multimodel.model_runs.jma_msm.run_initialisation_utc === null && issues.length === 0);
}
{
  const {mm, issues} = await pub({meta: {...RUN1, ecmwf_ifs025: null}});
  check('lag.meta_unavailable_data_still_used', mm.multimodel.model_runs.ecmwf_ifs025.status === 'meta_unavailable' && mm.multimodel.hourly_source.summit[lead(mm, 100)] === 'd4_7' && issues.length === 0);
}
// 3. called before the new run is published: same run -> identical forecast content -> no commit (fetched_at differs)
const a = (await pub()).mm, b = (await publishRegion(region, {now: now + 20 * 60e3, previous: null, fetchFn: stubFetch(), metaFn: metaStub(RUN1)})).mm;
check('repeat.same_forecast_same_signature', contentSignature(a, 'multimodel') === contentSignature(b, 'multimodel') && a.fetched_at !== b.fetched_at);
// 4. JMA-only update: signature changes, other runs unchanged
{
  const c = (await pub({fetch: {jmaShift: 0.5}, meta: RUN2_JMA})).mm;
  check('jma_only.signature_changes', contentSignature(c, 'multimodel') !== contentSignature(a, 'multimodel'));
  check('jma_only.other_runs_unchanged', c.multimodel.model_runs.ecmwf_ifs025.run_initialisation_utc === a.multimodel.model_runs.ecmwf_ifs025.run_initialisation_utc);
  check('jma_only.only_d0_3_values_change', c.hourly.summit.temperature_2m[lead(c, 10)] !== a.hourly.summit.temperature_2m[lead(a, 10)] && c.hourly.summit.temperature_2m[lead(c, 100)] === a.hourly.summit.temperature_2m[lead(a, 100)]);
}
// 5. ECMWF or GFS missing -> per-hour fallback, still valid, no "--"
for (const miss of ['ecmwf_ifs025', 'gfs_seamless']) {
  const {mm, issues} = await pub({fetch: {fail: [miss]}});
  const s = mm.multimodel.hourly_source.summit;
  check(`missing.${miss}_valid_no_missing_hours`, issues.length === 0 && !s.includes('missing') && mm.hourly.summit.temperature_2m.every(v => v != null), {issues});
}
// 6. partial data (JMA hole 20..30 h) -> those hours Best Match, rest blended
{
  const {mm, issues} = await pub({fetch: {partial: {id: 'jma_msm', from: 20, to: 30}}});
  const s = mm.multimodel.hourly_source.summit;
  check('partial.hole_hours_fallback_rest_blended', issues.length === 0 && s[lead(mm, 25)] === 'best_match' && s[lead(mm, 19)] === 'd0_3' && s[lead(mm, 31)] === 'd0_3');
  check('partial.weights_sum_1_everywhere', mm.multimodel.hourly_weights.summit.every(w => Math.abs(Object.values(w).reduce((x, y) => x + y, 0) - 1) < 0.002));
}
// 7. 429 then success (retry) / persistent timeout (fails after retries) / meta endpoint down
{
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => (++n === 1 ? {ok: false, status: 429, json: async () => ({error: true, reason: 'Too many requests'})} : {ok: true, status: 200, json: async () => ({hourly: {time: []}})});
  let ok429 = false; try { await fetchForecast('https://api.open-meteo.com/v1/forecast?x'); ok429 = n === 2; } catch {}
  check('retry.429_then_success', ok429, {calls: n});
  n = 0;
  globalThis.fetch = async () => { n++; throw new Error('The operation was aborted due to timeout'); };
  let threw = false; try { await fetchForecast('https://api.open-meteo.com/v1/forecast?y'); } catch { threw = true; }
  check('retry.timeout_gives_up_after_3', threw && n === 3, {calls: n});
  globalThis.fetch = real;
  const m = await fetchRunMeta('jma_msm', async () => { throw new Error('timeout'); });
  check('retry.meta_down_reported_not_invented', m.ok === false && !('initialisation_utc' in m));
  const {mm, issues} = await pub({fetch: {fail: ['jma_msm']}});
  check('retry.jma_failed_d0_3_uses_ecmwf_or_fallback', issues.length === 0 && !mm.multimodel.hourly_source.summit.includes('missing'));
}
// 8. all external model calls fail -> reused Best Match file values, file still complete
{
  const {mm} = await pub({fetch: {fail: ['best_match', 'jma_msm', 'ecmwf_ifs025', 'gfs_seamless']}});
  check('allfail.reused_best_match_values', !mm.multimodel.hourly_source.summit.includes('missing') &&
    mm.multimodel.model_sources.summit.best_match.reused_published_file === true &&
    mm.hourly.summit.temperature_2m.every((v, i) => v === bm.hourly.summit.temperature_2m[i] || (v == null && bm.hourly.summit.temperature_2m[i] == null)));
}
// 9. older run arrives after a newer one was published -> that model excluded (fallback), recorded
{
  const previous = {multimodel: {model_runs: runClaims(
    {ecmwf_ifs025: {identifiable: true, components: {ecmwf_ifs025: {ok: true, initialisation_utc: '2026-11-19T00:00:00.000Z'}}}},
    {ecmwf_ifs025: {identifiable: true, components: {ecmwf_ifs025: {ok: true, initialisation_utc: '2026-11-19T00:00:00.000Z'}}}})}};
  check('late.regression_detected', Object.keys(regressedModels(runClaims(
    {ecmwf_ifs025: {identifiable: true, components: {ecmwf_ifs025: {ok: true, initialisation_utc: RUN1.ecmwf_ifs025}}}},
    {ecmwf_ifs025: {identifiable: true, components: {ecmwf_ifs025: {ok: true, initialisation_utc: RUN1.ecmwf_ifs025}}}}), previous.multimodel.model_runs)).includes('ecmwf_ifs025'));
  const {mm, issues} = await publishRegion(region, {now, previous, fetchFn: stubFetch(), metaFn: metaStub(RUN1)});
  check('late.older_ecmwf_excluded_and_fallback', /older than published/.test(mm.multimodel.models_excluded_as_older_run.ecmwf_ifs025 || '') && mm.multimodel.hourly_source.summit[lead(mm, 100)] === 'best_match' && issues.length === 0);
}

// ---- staging decisions with committed (HEAD) contents ----
{
  const mmNew = a;
  const mmBuf = Buffer.from(JSON.stringify(mmNew));
  const started = new Date(Date.parse(bm.fetched_at) - 60e3).toISOString();
  const rec = {region, started_at_utc: started, steps: {validate_weather: {ok: true, sha256: (await import('node:crypto')).createHash('sha256').update(bmBuf).digest('hex')}, multimodel_service: {ok: true}}};
  const summary = {started_at_utc: started, run_at_utc: bm.fetched_at, regions: [rec]};
  const files = {'dist/data/weather/kiroro.json': bmBuf, 'dist/data/weather-multimodel/kiroro.json': mmBuf, 'dist/data/weather-source.json': Buffer.from('{"primary":"multimodel"}')};
  // multimodel validation in decide() checks best_match_source sha; make the stub file consistent with bmBuf
  const mmFixed = clone(mmNew); mmFixed.multimodel.best_match_source.sha256 = rec.steps.validate_weather.sha256;
  files['dist/data/weather-multimodel/kiroro.json'] = Buffer.from(JSON.stringify(mmFixed));
  const base = {regions: [region], notBeforeMs: Date.parse(started) - 60e3, read: f => files[f] ?? null, nowMs: Date.parse(bm.fetched_at)};
  const headWith = (bmH, mmH) => f => (f.endsWith('weather/kiroro.json') ? Buffer.from(JSON.stringify(bmH)) : f.endsWith('weather-multimodel/kiroro.json') ? Buffer.from(JSON.stringify(mmH)) : null);
  const older = (j, h) => { const x = clone(j); x.fetched_at = new Date(Date.parse(j.fetched_at) - h * HOUR).toISOString(); return x; };
  const shiftCurrent = (j, h) => { const x = clone(j); for (const p of ['summit', 'mid', 'base']) if (x.current?.[p]) x.current[p].forecast_time = new Date(Date.parse(x.current[p].forecast_time) - h * HOUR).toISOString().replace('Z', '+00:00'); return x; };
  // identical forecast, only collection metadata (fetched_at 1 h older, current slot 1 h back) -> unchanged, no stage
  let p = decide(summary, {...base, readHead: headWith(older(bm, 1), shiftCurrent(older(mmFixed, 1), 1))});
  check('stage.identical_forecast_not_committed', p.regions.kiroro.unchanged === true && !p.stage.some(f => f.includes('kiroro')), {r: p.regions.kiroro});
  // time axis moved >= 3 h -> commit
  p = decide(summary, {...base, readHead: headWith(older(bm, 1), shiftCurrent(older(mmFixed, 1), 3))});
  check('stage.slot_moved_3h_committed', !p.regions.kiroro.unchanged && p.stage.includes('dist/data/weather-multimodel/kiroro.json'), {content: p.regions.kiroro.content});
  // committed file MAX_AGE_H old -> commit (stays below the UI 6 h stale label)
  p = decide(summary, {...base, readHead: headWith(older(bm, MAX_AGE_H), older(mmFixed, MAX_AGE_H))});
  check('stage.old_committed_file_refreshed', !p.regions.kiroro.unchanged && p.stage.includes('dist/data/weather/kiroro.json'), {content: p.regions.kiroro.content});
  // changed forecast -> commit
  const mmChanged = clone(mmFixed); mmChanged.hourly.summit.temperature_2m[200] += 1;
  p = decide(summary, {...base, readHead: headWith(bm, mmChanged)});
  check('stage.changed_forecast_committed', p.regions.kiroro.content === 'forecast changed' && p.stage.includes('dist/data/weather-multimodel/kiroro.json'));
  // late result: committed Best Match is NEWER than this run's -> keep committed
  const bmNewer = clone(bm); bmNewer.fetched_at = new Date(Date.parse(bm.fetched_at) + HOUR).toISOString();
  p = decide(summary, {...base, readHead: headWith(bmNewer, mmFixed)});
  check('stage.late_older_result_rejected', !p.stage.some(f => f.includes('kiroro')) && p.regions.kiroro.reasons.some(x => /late result/.test(x)));
  // late result: committed multimodel used a NEWER ECMWF run -> keep committed multimodel
  const mmNewerRun = clone(mmFixed); mmNewerRun.multimodel.model_runs.ecmwf_ifs025.components.ecmwf_ifs025.initialisation_utc = '2026-11-19T06:00:00.000Z';
  p = decide(summary, {...base, readHead: headWith(older(bm, 1), mmNewerRun)});
  check('stage.older_model_run_rejected', !p.stage.includes('dist/data/weather-multimodel/kiroro.json') && p.regions.kiroro.reasons.some(x => /older model runs/.test(x)));
  // failed region keeps an old committed file -> age / remaining forecast reported
  const failed = {...summary, regions: [{...rec, steps: {validate_weather: {ok: false}}, failed_step: 'collect'}]};
  p = decide(failed, {...base, nowMs: Date.parse(bm.fetched_at) + 8 * HOUR, readHead: headWith(bm, mmFixed)});
  check('stage.stale_kept_file_flagged', p.regions.kiroro.kept_age_h >= 6 && p.regions.kiroro.reasons.some(x => /이전/.test(x)), {r: p.regions.kiroro});
  check('stage.time_axis_helper', timeAxisMoved(mmFixed, mmFixed, Date.parse(mmFixed.fetched_at)) === null);
}

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-hourly-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r).slice(0, 500));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
