// Offline tests for scripts/weather-multimodel-engine.mjs (synthetic model runs; no network).
// Writes work/weather/weather-multimodel-tests.json.
import {writeFileSync, readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig, bandFor, blendValue, learnBias, buildForecast} from './weather-multimodel-engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const cfg = loadConfig();
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const near = (a, b, e = 1e-6) => a != null && b != null && Math.abs(a - b) < e;

// Config: band weights sum to 1 and bands are contiguous 1 … 384 h.
check('config.weights_sum_to_one', cfg.bands.every(b => near(Object.values(b.weights).reduce((s, w) => s + w, 0), 1)));
check('config.bands_contiguous', cfg.bands.every((b, i) => i === 0 ? b.lead_h[0] === 1 : b.lead_h[0] === cfg.bands[i - 1].lead_h[1] + 1) && cfg.bands.at(-1).lead_h[1] === 384);
check('config.service_use_false', cfg.service_use === false && cfg.slr_experiment.service_use === false);
// Band boundaries.
check('band.72h_is_d0_3', bandFor(cfg, 72).id === 'd0_3' && bandFor(cfg, 73).id === 'd4_7');
check('band.168_169', bandFor(cfg, 168).id === 'd4_7' && bandFor(cfg, 169).id === 'd8_10');
check('band.240_241', bandFor(cfg, 240).id === 'd8_10' && bandFor(cfg, 241).id === 'd11_16' && bandFor(cfg, 385) === null);

// Blend: F = Σ w F / Σ w; missing model never counted as 0.
const W = {jma_msm: 0.65, ecmwf_ifs025: 0.35}, MIN = cfg.missing_model_policy.min_available_weight;
check('blend.full_weighted_mean', near(blendValue(W, id => ({jma_msm: 2, ecmwf_ifs025: 4})[id], MIN).value, 0.65 * 2 + 0.35 * 4));
const renorm = blendValue(W, id => ({jma_msm: 2, ecmwf_ifs025: null})[id], MIN);
check('blend.missing_model_renormalized_not_zero', near(renorm.value, 2) && renorm.renormalized, renorm);
check('blend.low_weight_null', blendValue(W, id => ({jma_msm: null, ecmwf_ifs025: 4})[id], MIN).value === null);
check('blend.all_missing_null', blendValue(W, () => null, MIN).value === null);
check('blend.zero_is_a_value', near(blendValue(W, () => 0, MIN).value, 0));

// Synthetic runs for buildForecast.
const anchor = Date.parse('2026-11-19T00:00:00Z');
const mkRun = (fn, hours = 400) => {
  const time_utc = Array.from({length: hours}, (_, i) => new Date(anchor + (i + 1) * HOUR).toISOString());
  const values = Object.fromEntries(cfg.variables.map(v => [v, time_utc.map((t, i) => fn(v, i + 1))]));
  return {ok: true, run: {time_utc, values}, index: new Map(time_utc.map((t, i) => [t, i]))};
};
const runs = {
  best_match: mkRun(v => (v === 'temperature_2m' ? -1 : 0.5)),
  jma_msm: mkRun((v, lead) => (lead > 66 ? null : v === 'temperature_2m' ? -2 : 1)),
  ecmwf_ifs025: mkRun((v, lead) => (lead > 360 ? null : v === 'temperature_2m' ? -4 : 0.2)),
  gfs_seamless: mkRun(v => (v === 'temperature_2m' ? -8 : 0))
};
const rows = buildForecast(cfg, runs, anchor, null);
const at = h => rows.find(r => r.lead_h === h);
check('forecast.d0_3_weighted', near(at(10).F.temperature_2m, 0.65 * -2 + 0.35 * -4));
check('forecast.msm_beyond_horizon_null_not_zero', at(70).F.temperature_2m === null, {row: at(70).F});
check('forecast.d4_7_weighted', near(at(100).F.temperature_2m, 0.75 * -4 + 0.25 * -8));
check('forecast.d8_10_ecmwf_only', near(at(200).F.temperature_2m, -4));
check('forecast.d11_16_best_match', near(at(300).F.temperature_2m, -1));
check('forecast.ecmwf_end_in_d11_16_unaffected', near(at(370).F.temperature_2m, -1));
check('forecast.best_match_side_by_side', near(at(10).best_match.temperature_2m, -1));
check('forecast.no_bias_means_final_equals_F', rows.every(r => cfg.variables.every(v => r.final[v] === r.F[v] && r.bias_applied[v] === false)));
check('forecast.slr_separate_from_model_snowfall', at(10).slr_experiment && at(10).F.snowfall !== at(10).slr_experiment.snowfall_cm || at(10).slr_experiment?.snowfall_cm === 0);

// Bias: applied only when sufficient, by lead day; non-negative clamp.
const bias = {temperature_2m: {day0: {sufficient: true, blend: {bias: 1.5}}, day1: {sufficient: false, blend: {bias: 9}}},
  precipitation: {day0: {sufficient: true, blend: {bias: 5}}}};
const br = buildForecast(cfg, runs, anchor, bias);
const bat = h => br.find(r => r.lead_h === h);
check('bias.applied_day0', near(bat(10).final.temperature_2m, bat(10).F.temperature_2m - 1.5) && bat(10).bias_applied.temperature_2m.lead_day === 0);
check('bias.lead_24_is_day0_25_is_day1', bat(24).bias_applied.temperature_2m && bat(25).bias_applied.temperature_2m === false);
check('bias.insufficient_not_applied', bat(30).final.temperature_2m === bat(30).F.temperature_2m);
check('bias.precip_clamped_non_negative', bat(10).final.precipitation === 0, {final: bat(10).final.precipitation});

// learnBias: pairs / sufficiency / lead-day columns; missing observations are skipped, not zero.
{
  const t0 = Date.parse('2026-11-16T00:00:00Z');
  const obs = new Map(Array.from({length: 72}, (_, i) => {
    const t = new Date(t0 + i * HOUR).toISOString();
    return [t, {measurements: {temperature_c: {usable: i >= 10, value: i >= 10 ? 0 : null}, precipitation_1h_mm: {usable: true, value: i % 3 === 0 ? 1 : 0}}}];
  }));
  const hourly = {};
  for (const v of cfg.bias.variables) for (let k = 0; k <= cfg.bias.max_lead_day; k++) {
    const key = k === 0 ? v : `${v}_previous_day${k}`;
    hourly[key] = Array.from({length: 72}, () => (v === 'temperature_2m' ? 1 + k * 0.1 : 0.5));
  }
  const times = Array.from({length: 72}, (_, i) => new Date(t0 + i * HOUR).toISOString());
  const mk = (noMsmAfter) => ({ok: true, index: new Map(times.map((t, i) => [t, i])), hourly: Object.fromEntries(Object.entries(hourly).map(([k, a]) => [k, noMsmAfter && /previous_day[3-9]/.test(k) ? a.map(() => null) : a]))});
  const prev = {best_match: mk(false), jma_msm: mk(true), ecmwf_ifs025: mk(false), gfs_seamless: mk(false)};
  const b = learnBias(cfg, prev, obs);
  check('learn.pairs_exclude_unusable_obs', b.temperature_2m.day0.blend.pairs === 62, {pairs: b.temperature_2m.day0.blend.pairs});
  check('learn.bias_value', near(b.temperature_2m.day0.blend.bias, 1) && near(b.temperature_2m.day2.blend.bias, 1.2));
  check('learn.sufficient_threshold', b.temperature_2m.day0.sufficient === (62 >= cfg.bias.min_pairs));
  check('learn.day3_uses_d4_7_band', b.temperature_2m.day3.band === 'd4_7' && b.temperature_2m.day3.blend.pairs === 62);
  const few = learnBias({...cfg, bias: {...cfg.bias, min_pairs: 100}}, prev, obs);
  check('learn.insufficient_pairs_flagged', few.temperature_2m.day0.sufficient === false && /pairs/.test(few.temperature_2m.day0.reason));
}

// Real output (if present): service flags, no ski-point bias, SLR not validated.
{
  const f = path.join(ROOT, 'work/weather/kiroro-multimodel.json');
  if (existsSync(f)) {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    check('output.service_use_false', d.service_use === false && d.data_kind === 'multimodel_forecast_internal_validation');
    check('output.no_bias_on_ski_points', ['summit', 'mid', 'base'].every(p => d.points[p].bias.applied === false && d.points[p].hourly.every(r => Object.values(r.bias_applied).every(x => x === false))));
    check('output.slr_not_validated', d.slr_validation.validated === false && d.slr_validation.service_use === false);
    check('output.non_negative', Object.values(d.points).every(p => p.hourly.every(r => ['precipitation', 'rain', 'snowfall'].every(v => r.final[v] == null || r.final[v] >= 0))));
    check('output.service_forecast_untouched', !d.points.summit.hourly.some(r => r === null) && d.past_source.path === 'dist/data/weather/kiroro.json');
  }
}

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-multimodel-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r).slice(0, 400));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
