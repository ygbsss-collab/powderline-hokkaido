// Offline tests for scripts/weather-multimodel-publish.mjs: stub model runs on the real Best Match time axis.
// Writes work/weather/weather-multimodel-publish-tests.json. dist/ files are only read (sha-checked).
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publishRegion, blendAt, blendDirection, validateService, liquidRain} from './weather-multimodel-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const near = (a, b, e = 0.006) => a != null && b != null && Math.abs(a - b) < e;
const region = 'kiroro';
const bmPath = path.join(ROOT, 'dist/data/weather', `${region}.json`);
const bmSha = () => createHash('sha256').update(readFileSync(bmPath)).digest('hex');
const before = bmSha();
const bm = JSON.parse(readFileSync(bmPath, 'utf8'));
const now = Date.parse(bm.fetched_at);
const anchor = Math.floor(now / HOUR) * HOUR;
const axis = bm.hourly.time.map(t => Date.parse(t));

// Stub: constant per-model values; JMA ends at lead 66 (its horizon); options knock out models / single hours.
const VAL = {
  best_match:   {temperature_2m: -1, precipitation: 0.5, rain: 0.1, showers: 0.1, snowfall: 0.2, wind_speed_10m: 3, wind_direction_10m: 90, weather_code: 3},
  jma_msm:      {temperature_2m: -2, precipitation: 1.0, rain: 0.2, showers: 0.1, snowfall: 0.4, wind_speed_10m: 4, wind_direction_10m: 350, weather_code: 73},
  ecmwf_ifs025: {temperature_2m: -4, precipitation: 0.2, rain: 0.0, showers: 0.0, snowfall: 0.14, wind_speed_10m: 6, wind_direction_10m: 10, weather_code: 71},
  gfs_seamless: {temperature_2m: -8, precipitation: 0.0, rain: 0.0, showers: 0.0, snowfall: 0.0, wind_speed_10m: 2, wind_direction_10m: 180, weather_code: 3}
};
const stub = ({fail = [], holeAt = null} = {}) => async id => {
  if (fail.includes(id)) throw new Error('stub failure');
  const at = new Map(), last = {};
  for (const t of axis) {
    const lead = Math.round((t - anchor) / HOUR);
    if (id !== 'best_match' && lead < 1) continue;
    if (id === 'jma_msm' && lead > 66) continue;
    const v = VAL[id];
    const hole = holeAt != null && id === 'jma_msm' && lead === holeAt;
    const row = {temperature_2m: hole ? null : v.temperature_2m, precipitation: v.precipitation, rain: v.rain + v.showers, snowfall: v.snowfall,
      wind_speed_10m: v.wind_speed_10m, wind_direction_10m: v.wind_direction_10m, weather_code: v.weather_code};
    at.set(t, row);
    for (const [k, x] of Object.entries(row)) if (x != null) last[k] = t;
  }
  return {ok: true, at, last, range_utc: null, response_coordinate: null};
};
// Offline run metadata (same run before and after the fetch).
const META_STUB = async () => ({ok: true, initialisation_utc: '2026-11-18T18:00:00.000Z', availability_utc: '2026-11-19T01:00:00.000Z', update_interval_h: 6});
const leadIdx = (mm, lead) => mm.hourly.time.findIndex(t => Math.round((Date.parse(t) - anchor) / HOUR) === lead);

{
  const {mm, issues} = await publishRegion(region, {now, metaFn: META_STUB, previous: null, fetchFn: stub()});
  const s = mm.hourly.summit, src = mm.multimodel.hourly_source.summit;
  const at = lead => leadIdx(mm, lead);
  check('structure.validation_passes', issues.length === 0, {issues});
  check('structure.same_time_axis_as_best_match', JSON.stringify(mm.hourly.time) === JSON.stringify(bm.hourly.time));
  check('structure.same_hourly_keys', ['summit', 'mid', 'base'].every(p => JSON.stringify(Object.keys(mm.hourly[p])) === JSON.stringify(Object.keys(bm.hourly[p]))));
  check('band.d0_3_jma_ecmwf', near(s.temperature_2m[at(10)], 0.65 * -2 + 0.35 * -4) && src[at(10)] === 'd0_3');
  check('band.jma_end_ecmwf_alone', near(s.temperature_2m[at(70)], -4) && /horizon switch: jma_msm/.test(mm.multimodel.hourly_reason.summit[at(70)]));
  check('band.72_vs_73', src[at(72)] === 'd0_3' && src[at(73)] === 'd4_7');
  check('band.d4_7_ecmwf_gfs', near(s.temperature_2m[at(100)], 0.75 * -4 + 0.25 * -8));
  check('band.168_169_d8_10_ecmwf', src[at(168)] === 'd4_7' && src[at(169)] === 'd8_10' && near(s.temperature_2m[at(200)], -4));
  check('band.240_241_best_match', src[at(240)] === 'd8_10' && src[at(241)] === 'd11_16' && near(s.temperature_2m[at(300)], bm.hourly.summit.temperature_2m[at(300)]));
  check('band.past_hours_best_match', src[at(0)] === 'best_match' && near(s.temperature_2m[at(0)], bm.hourly.summit.temperature_2m[at(0)]));
  check('band.no_gaps_no_duplicates', new Set(mm.hourly.time).size === mm.hourly.time.length && src.every(x => x && x !== 'missing'));
  check('snow.weighted_original_snowfall', near(s.snowfall[at(10)], 0.65 * 0.4 + 0.35 * 0.14), {v: s.snowfall[at(10)]});
  check('snow.no_slr_no_rederivation', !near(s.snowfall[at(10)], (s.precipitation[at(10)] - s.rain[at(10)]) * 1));
  check('rain.liquid_rain_plus_showers', near(s.rain[at(10)], 0.65 * 0.3 + 0.35 * 0));
  check('rain.not_above_precipitation', s.rain.every((r, i) => r == null || r <= s.precipitation[i] + 0.05));
  check('wind.vector_direction_350_10', s.wind_direction_10m[at(10)] <= 5 || s.wind_direction_10m[at(10)] >= 355, {dir: s.wind_direction_10m[at(10)]});
  check('wind.speed_scalar_mean', near(s.wind_speed_10m[at(10)], 0.65 * 4 + 0.35 * 6));
  check('code.highest_weight_model', s.weather_code[at(10)] === 73 && s.weather_code[at(100)] === 71);
  check('passthrough.snow_depth_from_best_match', s.snow_depth[at(10)] === bm.hourly.summit.snow_depth[at(10)]);
  const di = mm.daily.time.findIndex(d => mm.hourly.time.filter(t => t.startsWith(d)).length === 24 && d > mm.hourly.time[at(200)].slice(0, 10));
  const dsum = mm.hourly.time.reduce((a, t, i) => a + (t.startsWith(mm.daily.time[di]) ? s.snowfall[i] : 0), 0);
  check('daily.snow_equals_hourly_local_day', near(mm.daily.summit.snowfall_sum[di], dsum, 0.011), {daily: mm.daily.summit.snowfall_sum[di], hourly: dsum});
  check('current.uses_multimodel_slot', mm.current.summit && /multimodel hourly slot/.test(mm.current.summit.basis));
  check('meta.policy_recorded', /NOT proven/.test(mm.multimodel.policy) && /not applied/i.test(mm.multimodel.policy));
}
// Fallbacks
{
  const {mm, issues} = await publishRegion(region, {now, metaFn: META_STUB, previous: null, fetchFn: stub({fail: ['ecmwf_ifs025']})});
  const src = mm.multimodel.hourly_source.summit, at = l => leadIdx(mm, l);
  check('fallback.ecmwf_down_d0_3_jma_only', src[at(10)] === 'd0_3' && near(mm.hourly.summit.temperature_2m[at(10)], -2));
  check('fallback.ecmwf_down_d4_7_to_best_match', src[at(100)] === 'best_match' && /fallback/.test(mm.multimodel.hourly_reason.summit[at(100)]) && near(mm.hourly.summit.temperature_2m[at(100)], bm.hourly.summit.temperature_2m[at(100)]));
  check('fallback.ecmwf_down_still_valid', issues.length === 0, {issues});
}
{
  const {mm} = await publishRegion(region, {now, metaFn: META_STUB, previous: null, fetchFn: stub({holeAt: 20})});
  const src = mm.multimodel.hourly_source.summit, at = l => leadIdx(mm, l);
  check('fallback.missing_value_not_zero_hour_to_best_match', src[at(20)] === 'best_match' && near(mm.hourly.summit.temperature_2m[at(20)], bm.hourly.summit.temperature_2m[at(20)]) && src[at(21)] === 'd0_3');
}
{
  const {mm, issues} = await publishRegion(region, {now, metaFn: META_STUB, previous: null, fetchFn: stub({fail: ['best_match', 'jma_msm', 'ecmwf_ifs025', 'gfs_seamless']})});
  check('fallback.all_down_uses_reused_best_match', !mm.multimodel.hourly_source.summit.includes('missing') &&
    mm.multimodel.model_sources.summit.best_match.reused_published_file === true &&
    mm.hourly.summit.temperature_2m.every((value, index) => value === bm.hourly.summit.temperature_2m[index] ||
      (value == null && bm.hourly.summit.temperature_2m[index] == null)), {issues: issues.slice(0, 3)});
}
// Rain rule (no double counting of showers that are already snowfall)
check('rain.separate_showers_added', near(liquidRain(1.2, 0.5, 0.7, 0).value, 1.2) && liquidRain(1.2, 0.5, 0.7, 0).rule === 'separate');
check('rain.showers_inside_snowfall_not_added', near(liquidRain(0.5, 0, 0.5, 0.35).value, 0) && liquidRain(0.5, 0, 0.5, 0.35).rule === 'overlap');
check('rain.ambiguous_rain_only', near(liquidRain(0.8, 0, 0.7, 0.42).value, 0) && liquidRain(0.8, 0, 0.7, 0.42).rule === 'ambiguous');
check('rain.indistinguishable_small_showers_not_added', near(liquidRain(0.5, 0, 0.1, 0.28).value, 0) && liquidRain(0.5, 0, 0.1, 0.28).rule === 'consistent');
check('rain.missing_is_null_not_zero', liquidRain(1, null, 0, 0).value === null);
// Unit helpers
check('blend.min_weight_without_horizon_reason', blendAt({a: 0.35, b: 0.65}, {a: {ok: true, at: new Map([[1, {x: 2}]]), last: {x: 1}}, b: {ok: false}}, 'x', 1, 0.6).value === null);
check('direction.calm_null', blendDirection({a: 1}, {a: {ok: true, at: new Map([[1, {wind_speed_10m: 0, wind_direction_10m: 90}]])}}, 1) === null);
{
  const {mm} = await publishRegion(region, {now, metaFn: META_STUB, previous: null, fetchFn: stub()});
  const broken = structuredClone(mm); broken.hourly.summit.snowfall[5] = -1;
  check('validate.negative_rejected', validateService(broken, bm).some(i => /negative/.test(i)));
  const b2 = structuredClone(mm); b2.hourly.time = b2.hourly.time.slice(1);
  check('validate.axis_mismatch_rejected', validateService(b2, bm).some(i => /axis/.test(i)));
}
check('preservation.best_match_file_unchanged', bmSha() === before);

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-multimodel-publish-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r).slice(0, 400));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
