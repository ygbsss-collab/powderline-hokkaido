// Tests for the Snow Surface Engine. Writes work/weather/<region>-snow-surface-tests.json. Inputs are never modified.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadInputs, runEngine, classifyPoint, meltFreezeEpisodes, sha256, freshness, sourceGrids} from './snow-surface-engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const region = process.argv.slice(2).find(a => !a.startsWith('--')) || 'kiroro';
// --model=<path>: run against a fixed forecast snapshot (default: the published dist/data/weather/<region>.json).
const modelArg = process.argv.slice(2).find(a => a.startsWith('--model='))?.slice(8);
const modelPath = modelArg ? path.resolve(ROOT, modelArg) : path.join(ROOT, 'dist/data/weather', `${region}.json`);
const HOUR = 3600e3;
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const clone = o => structuredClone(o);

// Fixed analysis time (= collection time) keeps every run deterministic.
const collectedAt = JSON.parse(readFileSync(modelPath)).fetched_at;
const inputs = loadInputs(region, collectedAt, {modelPath});
const files = [inputs.sources.model.path, inputs.sources.aligned.path, inputs.sources.config.path];
const before = Object.fromEntries(files.map(f => [f, sha256(readFileSync(path.join(ROOT, f)))]));
const modelSnapshot = JSON.stringify(inputs.model), alignedSnapshot = JSON.stringify(inputs.aligned);
const base = runEngine(clone(inputs));

// 1. Time order: 72 consecutive hours ending at the anchor, no forecast hour included.
for (const [p, r] of Object.entries(base.points)) {
  const m72 = r.metrics?.['72h'];
  check(`time_order.${p}.window_bounds`, m72 && m72.first_hour_utc === base.analysis_window.first_hour_utc && m72.last_hour_utc === base.analysis_window.last_hour_utc,
    {first: m72?.first_hour_utc, last: m72?.last_hour_utc});
  const sub = ['24h', '48h'].every(h => r.metrics[h].last_hour_utc === m72.last_hour_utc && Date.parse(r.metrics[h].first_hour_utc) === Date.parse(m72.last_hour_utc) - (parseInt(h) - 1) * HOUR);
  check(`time_order.${p}.nested_24_48_72`, sub);
  const eps = r.rules?.find(x => x.state === 'melt_freeze')?.observed.episodes || [];
  check(`time_order.${p}.melt_before_refreeze`, eps.every(e => Date.parse(e.melt_start_utc) <= Date.parse(e.melt_end_utc) && (e.refreeze_utc == null || Date.parse(e.refreeze_utc) > Date.parse(e.melt_end_utc))), {episodes: eps.length});
}
check('time_order.anchor_not_after_fetch', Date.parse(base.analysis_window.last_hour_utc) <= Date.parse(inputs.model.fetched_at),
  {anchor: base.analysis_window.last_hour_utc, fetched_at: inputs.model.fetched_at});
// Shuffled hourly input order must give the identical result.
{
  const m = clone(inputs.model); const n = m.hourly.time.length; const order = [...Array(n).keys()].reverse();
  m.hourly.time = order.map(i => m.hourly.time[i]);
  for (const p of ['summit', 'mid', 'base']) for (const f of Object.keys(m.hourly[p])) m.hourly[p][f] = order.map(i => m.hourly[p][f][i]);
  const r = runEngine({...clone(inputs), model: m});
  check('time_order.reversed_input_same_result', JSON.stringify(r.points) === JSON.stringify(base.points));
}
// Melt-freeze order: refreeze BEFORE melt must not count.
{
  const mk = Ts => Ts.map((T, k) => ({t: k * HOUR, iso: `h${k}`, v: {temperature_2m: T, snow_depth: 0.2}}));
  const mf = {...inputs.cfg.melt_freeze};
  check('melt_freeze.freeze_then_melt_not_counted', meltFreezeEpisodes(mk([-5, -5, 2, 2, 2]), mf, 0.01).filter(e => e.qualifies).length === 0);
  check('melt_freeze.melt_then_freeze_counted', meltFreezeEpisodes(mk([-5, 2, 2, 0, -2]), mf, 0.01).filter(e => e.qualifies).length === 1);
}

// 2. Missing handling: drop 12h of temperature at summit -> summit null, mid/base unchanged.
const nullOut = (m, p, f, from, count) => { const i0 = m.hourly.time.findIndex(t => Date.parse(t) === Date.parse(base.analysis_window.last_hour_utc)) - from; for (let k = 0; k < count; k++) m.hourly[p][f][i0 - k] = null; };
{
  const m = clone(inputs.model); nullOut(m, 'summit', 'temperature_2m', 0, 12);
  const r = runEngine({...clone(inputs), model: m});
  check('missing.summit_temperature_12h_gives_null', r.points.summit.primary_state === null && r.points.summit.reason === 'insufficient_input_data', {reason: r.points.summit.reason});
  check('independence.mid_unchanged_when_summit_missing', JSON.stringify(r.points.mid) === JSON.stringify(base.points.mid));
  check('independence.base_unchanged_when_summit_missing', JSON.stringify(r.points.base) === JSON.stringify(base.points.base));
}
{ // Few missing hours (<10%) keep a state; snowfall sum with low coverage is null, not 0.
  const m = clone(inputs.model); nullOut(m, 'base', 'snowfall', 0, 5);
  const r = runEngine({...clone(inputs), model: m});
  check('missing.24h_snow_low_coverage_is_null_not_zero', r.points.base.metrics['24h'].new_snow_cm.value === null && r.points.base.metrics['72h'].new_snow_cm.value !== null,
    {v24: r.points.base.metrics['24h'].new_snow_cm, v72: r.points.base.metrics['72h'].new_snow_cm});
  check('missing.zero_vs_null_distinct', base.points.base.metrics['24h'].new_snow_cm.value === 0 && r.points.base.metrics['24h'].new_snow_cm.value === null);
}
{ // Missing timestamps (row removed) are explicit gaps, not shifted.
  const m = clone(inputs.model); const i = m.hourly.time.findIndex(t => Date.parse(t) === Date.parse(base.analysis_window.last_hour_utc)) - 30;
  m.hourly.time.splice(i, 10); for (const p of ['summit', 'mid', 'base']) for (const f of Object.keys(m.hourly[p])) m.hourly[p][f].splice(i, 10);
  const r = runEngine({...clone(inputs), model: m});
  check('missing.removed_rows_counted_as_gap', ['summit', 'mid', 'base'].every(p => r.points[p].data_sufficiency.missing_hours_72h === 10 && r.points[p].primary_state === null));
}

// 3. Independence: perturb mid only.
{
  const m = clone(inputs.model); m.hourly.mid.snowfall = m.hourly.mid.snowfall.map(v => (v == null ? v : v + 1));
  const r = runEngine({...clone(inputs), model: m});
  check('independence.mid_change_does_not_affect_summit_base', JSON.stringify(r.points.summit) === JSON.stringify(base.points.summit) && JSON.stringify(r.points.base) === JSON.stringify(base.points.base),
    {mid_state_after: r.points.mid.primary_state});
}

// 4. Synthetic classification cases (72 hourly rows).
{
  const cfg = inputs.cfg;
  const rows = f => Array.from({length: 72}, (_, k) => ({t: k * HOUR, iso: new Date(k * HOUR).toISOString(),
    v: {temperature_2m: -6, precipitation: 0, rain: 0, snowfall: 0, snow_depth: 0.5, wind_speed_10m: 2, wind_gusts_10m: 4, ...f(k)}}));
  const cases = [
    ['fresh_powder', rows(k => (k >= 60 ? {snowfall: 1} : {})), 'fresh_powder'],
    ['wind_affected', rows(k => (k >= 40 && k < 44 ? {snowfall: 1} : k >= 60 ? {wind_speed_10m: 10} : {})), 'wind_affected'],
    ['rain_on_snow', rows(k => (k >= 50 && k < 54 ? {rain: 1, temperature_2m: 1} : {})), 'rain_on_snow'],
    ['melt_freeze', rows(k => (k >= 30 && k < 36 ? {temperature_2m: 3} : {})), 'melt_freeze'],
    ['low_change', rows(() => ({})), 'low_change'],
    ['buried_rain_crust', rows(k => (k >= 20 && k < 24 ? {rain: 1, temperature_2m: 1} : k >= 60 ? {snowfall: 1} : {})), 'fresh_powder'],
    ['no_snowpack_null', rows(() => ({snow_depth: 0})), null],
    ['rain_without_snowpack_not_ros', rows(k => (k >= 50 && k < 54 ? {rain: 1, temperature_2m: 0.3, snow_depth: 0} : {})), 'low_change']
  ];
  for (const [name, r, expect] of cases) {
    const out = classifyPoint(r, cfg);
    check(`classify.${name}`, out.primary_state === expect, {primary_state: out.primary_state, modifiers: out.modifiers});
  }
}

// 6. v0.2 boundary tests (thresholds read from config so the tests follow the experimental settings).
{
  const cfg = inputs.cfg;
  const rows = f => Array.from({length: 72}, (_, k) => ({t: k * HOUR, iso: new Date(k * HOUR).toISOString(),
    v: {temperature_2m: -6, precipitation: 0, rain: 0, snowfall: 0, snow_depth: 0.5, wind_speed_10m: 2, wind_gusts_10m: 4, ...f(k)}}));
  const st = (name, r, expect, extra) => { const o = classifyPoint(r, cfg); check(`boundary.${name}`, o.primary_state === expect && (!extra || extra(o)), {primary_state: o.primary_state, modifiers: o.modifiers, reason: o.reason}); return o; };
  const dState = cfg.snowpack.min_depth_for_state_m, dMin = cfg.snowpack.min_depth_m;
  // Snowpack gate: history kept, state not confirmed.
  st('depth_just_below_state_min_null', rows(() => ({snow_depth: dState - 0.001})), null,
    o => o.reason === 'modelled_snowpack_too_shallow_for_state' && o.metrics['72h'] && o.rules.length > 0 && o.modifiers.includes('shallow_modelled_snowpack'));
  st('depth_at_state_min_confirmed', rows(() => ({snow_depth: dState})), 'low_change');
  st('depth_below_min_no_snowpack', rows(() => ({snow_depth: dMin - 0.0001})), null, o => o.reason === 'no_modelled_snowpack_at_window_end' && o.metrics['24h']);
  st('shallow_gate_keeps_rule_hits', rows(k => ({snow_depth: dState - 0.001, ...(k >= 60 ? {snowfall: 1} : {})})), null, o => o.unconfirmed_rule_hits.includes('fresh_powder'));
  // Fresh powder 24h snow threshold (7 x 0.7 = 4.9 cm vs 5 x 1.0 = 5.0 cm).
  st('fresh_snow_4_9_not', rows(k => (k >= 65 ? {snowfall: 0.7} : {})), 'low_change');
  st('fresh_snow_5_0_yes', rows(k => (k >= 67 ? {snowfall: 1} : {})), 'fresh_powder');
  st('fresh_tmax_above_limit_not', rows(k => (k >= 67 ? {snowfall: 1} : k === 66 ? {temperature_2m: cfg.fresh_powder.max_temp_c + 0.1} : {})), 'low_change');
  // Wind: exactly the threshold speed counts; hours min-1 vs min.
  const wind = n => rows(k => (k >= 40 && k < 43 ? {snowfall: 1} : k >= 72 - n ? {wind_speed_10m: cfg.wind_affected.strong_wind_ms} : {}));
  st('wind_hours_below_min_not', wind(cfg.wind_affected.min_strong_wind_hours - 1), 'low_change');
  st('wind_hours_at_min_yes', wind(cfg.wind_affected.min_strong_wind_hours), 'wind_affected');
  // Melt-freeze: melt hours and refreeze temperature edges.
  const mf = (h, refT) => rows(k => (k >= 30 && k < 30 + h ? {temperature_2m: cfg.melt_freeze.melt_temp_c} : k === 30 + h ? {temperature_2m: refT} : k > 30 + h ? {temperature_2m: 0} : {}));
  st('melt_hours_below_min_not', mf(cfg.melt_freeze.min_melt_hours - 1, -5), 'low_change');
  st('melt_hours_at_min_yes', mf(cfg.melt_freeze.min_melt_hours, -5), 'melt_freeze');
  st('refreeze_just_above_limit_not', mf(3, cfg.melt_freeze.refreeze_temp_c + 0.1), 'low_change');
  st('refreeze_at_limit_yes', mf(3, cfg.melt_freeze.refreeze_temp_c), 'melt_freeze');
  // Rain-on-snow amount edge (0.9 vs 1.0 mm), rain at +0.3 C so no melt episode.
  const ros = mm => rows(k => (k >= 50 && k < 55 ? {rain: mm / 5, temperature_2m: 0.3} : {}));
  st('ros_0_9mm_not', ros(0.9), 'low_change');
  st('ros_1_0mm_yes', ros(1.0), 'rain_on_snow');
  // Time order: snow BEFORE the refreeze does not bury the rain crust; snow AFTER refreeze does (threshold edge 4.9 / 5.0).
  st('ros_snow_before_refreeze_not_buried', rows(k => (k >= 40 && k < 45 ? {rain: 1, temperature_2m: 0.3} : k >= 45 && k < 51 ? {snowfall: 1, temperature_2m: 0} : k === 51 ? {temperature_2m: -3} : {})),
    'rain_on_snow', o => o.events.rain_on_snow?.refrozen === true && o.events.rain_on_snow.new_snow_after_cm === 0);
  const bury = cm => rows(k => (k >= 20 && k < 25 ? {rain: 1, temperature_2m: 0.3} : k === 25 ? {temperature_2m: -3} : k >= 30 && k < 37 ? {snowfall: cm / 7} : {}));
  st('ros_buried_4_9_not', bury(4.9), 'rain_on_snow');
  st('ros_buried_5_0_yes', bury(5.0), 'low_change', o => o.modifiers.includes('buried_rain_on_snow'));
  st('ros_unrefrozen_never_buried', rows(k => (k >= 40 && k < 45 ? {rain: 1, temperature_2m: 0.3} : k >= 45 ? {snowfall: 0.5, temperature_2m: 0} : {})),
    'rain_on_snow', o => o.events.rain_on_snow.refrozen === false);
  // Coverage edge: 7 missing of 72 (0.903) ok, 8 missing (0.889) null.
  st('coverage_7_missing_ok', rows(k => (k < 7 ? {temperature_2m: null} : {})), 'low_change');
  st('coverage_8_missing_null', rows(k => (k < 8 ? {temperature_2m: null} : {})), null, o => o.reason === 'insufficient_input_data');
  // Freshness edges.
  const f = cfg.freshness, t0 = Date.parse('2026-11-18T07:00:00Z');
  const fr = h => freshness(t0, t0 + h * HOUR, f);
  check('boundary.freshness_at_fresh_max', fr(f.fresh_max_age_h).status === 'fresh');
  check('boundary.freshness_just_over_fresh_is_stale', fr(f.fresh_max_age_h + 0.01).status === 'stale' && fr(f.fresh_max_age_h + 0.01).display_as_current);
  check('boundary.freshness_at_stale_max', fr(f.stale_max_age_h).status === 'stale');
  check('boundary.freshness_over_stale_is_expired', fr(f.stale_max_age_h + 0.01).status === 'expired' && !fr(f.stale_max_age_h + 0.01).display_as_current);
  check('boundary.freshness_no_data', freshness(null, t0, f).status === 'no_valid_data');
}
// Freshness end-to-end: a much later analysis time hides the current state but keeps the historical one.
{
  const late = loadInputs(region, Date.parse(collectedAt) + 48 * HOUR, {modelPath});
  const r = runEngine(late);
  check('freshness.expired_run_has_no_current_state', Object.values(r.points).every(p => p.primary_state === null && p.freshness.status === 'expired'),
    {statuses: Object.fromEntries(Object.entries(r.points).map(([k, p]) => [k, p.freshness.status]))});
  check('freshness.expired_run_same_window_as_collection', r.analysis_window.last_hour_utc === base.analysis_window.last_hour_utc
    && JSON.stringify(Object.values(r.points).map(p => p.state_at_last_valid_hour)) === JSON.stringify(Object.values(base.points).map(p => p.state_at_last_valid_hour)));
  check('timestamps.collected_analysis_lastvalid_distinct', r.timestamps.collected_at_utc === inputs.model.fetched_at && r.timestamps.analysis_at_utc !== r.timestamps.collected_at_utc
    && Object.values(r.timestamps.last_valid_weather_hour_utc).every(t => t && Date.parse(t) <= Date.parse(r.timestamps.collected_at_utc)), r.timestamps);
  const early = runEngine(loadInputs(region, Date.parse(collectedAt) - 10 * HOUR, {modelPath}));
  check('timestamps.analysis_before_collection_uses_no_later_hours', Date.parse(early.analysis_window.last_hour_utc) <= Date.parse(collectedAt) - 10 * HOUR);
}
// source_grid: recorded from the response; absent -> null (no inference).
{
  const g = sourceGrids(inputs.model);
  check('source_grid.recorded_from_response', g.summit?.basis === 'open_meteo_response_grid' && g.summit.shared_with.includes('mid') && g.mid.shared_with.includes('summit'), g);
  const m = clone(inputs.model); for (const p of m.points) { delete p.grid_latitude; delete p.grid_longitude; }
  const g2 = sourceGrids(m);
  check('source_grid.missing_not_inferred', g2.summit === null && g2.mid === null && g2.base === null);
}
// Model snow depth is labelled as model data; SLR / blend experiments are not read.
{
  check('model_snow_depth.labelled_not_observed', Object.values(base.points).every(p => p.data_sufficiency?.model_snow_depth?.basis === 'open_meteo_model_snow_depth_not_observed'));
  const src = readFileSync(path.join(ROOT, 'scripts/snow-surface-engine.mjs'), 'utf8');
  check('no_slr_or_blend_inputs', !/readFileSync\([^)]*(snowfall-analysis|dynamic-blend|slr)/i.test(src) && !/-(snowfall-analysis|dynamic-blend)\.json`/.test(src.replace(/excluded_inputs[^\n]*/, '')));
}

// 5. Source preservation.
const after = Object.fromEntries(files.map(f => [f, sha256(readFileSync(path.join(ROOT, f)))]));
check('preservation.input_files_sha256_unchanged', files.every(f => before[f] === after[f]), {sha256: after});
check('preservation.in_memory_inputs_unchanged', JSON.stringify(inputs.model) === modelSnapshot && JSON.stringify(inputs.aligned) === alignedSnapshot);
check('preservation.aligned_sha_matches_its_model_reference', inputs.aligned.inputs?.model?.sha256 === inputs.sources.model.sha256);
check('preservation.jma_not_merged', base.jma_reference?.usage === 'reference_only_not_merged_into_model'
  && base.model_crosscheck_with_aligned_view?.mismatches === 0, base.model_crosscheck_with_aligned_view);

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
const out = path.join(ROOT, 'work/weather', `${region}-snow-surface-v2-tests.json`);
writeFileSync(out, JSON.stringify({schema_version: 1, region_id: region, ran_at: new Date().toISOString(), config_id: inputs.cfg.config_id, summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', r.name, JSON.stringify(r));
console.log(summary, '->', path.relative(ROOT, out));
process.exitCode = summary.failed ? 1 : 0;
