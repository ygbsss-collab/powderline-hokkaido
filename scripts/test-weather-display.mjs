// Tests of the shared display judgement in dist/weather.js (the real functions, extracted by the audit loader),
// plus the audit invariants on the published multi-model files. Writes work/weather/weather-display-tests.json.
import {writeFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadDisplayFunctions, auditRegion} from './audit-weather-multimodel.mjs';
import {primarySkiAreas} from './weather-points.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const make = loadDisplayFunctions();
const f = make({hourly: {time: []}, daily: {time: []}}, 'summit');
const k = (code, snow, rain, isDay = true) => { const w = f.classifyWeather({code, snow, rain, isDay}); return `${w.kind}|${w.icon}|${w.label}`; };

check('snow', k(73, 0.5, 0) === 'snow|weather_snowy|눈');
check('rain', k(61, 0, 0.5) === 'rain|rainy|약한 비');
check('mixed_real_both', k(85, 0.5, 2.2) === 'mixed|weather_mix|눈·비');
check('mixed_needs_both_real_trace_rain_is_snow', k(73, 1.0, 0.05) === 'snow|weather_snowy|눈');
check('clear_day_night', k(0, 0, 0, true) === 'clear|sunny|맑음' && k(0, 0, 0, false) === 'clear|clear_night|맑음');
check('partly_night', k(2, 0, 0, false) === 'partly|partly_cloudy_night|구름 조금');
check('cloudy', k(3, 0, 0) === 'cloudy|cloud|흐림');
check('fog', k(45, 0, 0) === 'fog|foggy|안개' && k(48, 0, 0) === 'fog|foggy|착빙성 안개');
check('thunder_keeps_kind', k(95, 0, 3).startsWith('thunder|thunderstorm'));
check('missing_code', k(null, 1, 0) === 'missing|remove|--');
check('dry_code_trace_stays_dry', k(3, 0.05, 0) === 'cloudy|cloud|흐림');
check('dry_code_real_snow_shown_as_snow', k(2, 0.16, 0) === 'snow|weather_snowy|눈');
check('dry_code_real_rain_shown_as_rain', k(3, 0, 0.3) === 'rain|rainy|비');
check('snow_code_only_rain_real_is_uncertain', k(71, 0.07, 0.3) === 'mixed|weather_mix|눈·비 혼합 가능');
check('rain_code_only_snow_real_is_uncertain', k(61, 0.5, 0) === 'mixed|weather_mix|눈·비 혼합 가능');
check('basis_real_mixed_vs_conflict', f.classifyWeather({code: 85, snow: 0.5, rain: 2.2}).precipBasis === 'mixed_amounts' && f.classifyWeather({code: 71, snow: 0.07, rain: 0.3}).precipBasis === 'code_amount_phase' && f.classifyWeather({code: 73, snow: 0.5, rain: 0}).precipBasis === null);
check('precip_code_zero_amounts_keeps_code', k(51, 0, 0) === 'rain|rainy|이슬비');
check('missing_amounts_keep_code_not_zero', k(73, null, null) === 'snow|weather_snowy|눈');
check('no_temperature_input', f.classifyWeather.length === 1); // judgement never takes temperature
// Daily: totals with the same trace rule
const d = (snow, rain, codes = Array(24).fill(3)) => f.classifyDay('2026-11-20', {snow, rain}, {codes}).kind;
check('daily_mixed_real', d(10, 7.9) === 'mixed');
check('daily_trace_rain_is_snow', d(10, 0.05) === 'snow');
check('daily_dry_majority_code', d(0, 0, [...Array(14).fill(0), ...Array(10).fill(3)]) === 'clear');
check('daily_missing', d(null, null) === 'missing');

// Audit invariants on the real published files (skipped when not published).
for (const region of Object.keys(primarySkiAreas)) {
  if (!existsSync(path.join(ROOT, 'dist/data/weather-multimodel', `${region}.json`))) continue;
  const a = auditRegion(region, make);
  check(`audit.${region}.valid_no_gaps_no_dups`, a.structure.validation_ok && a.structure.gaps === 0 && a.structure.duplicates === 0 && a.structure.axis_equals_best_match);
  check(`audit.${region}.no_unresolved_display_conflict`, ['summit', 'mid', 'base'].every(p => a.conflicts[p].unresolved.count === 0));
  check(`audit.${region}.home_equals_hourly_and_daily_equals_hourly`, ['summit', 'mid', 'base'].every(p => a.consistency[p].home_slot_equals_hourly !== false && a.consistency[p].daily_vs_hourly_mismatches === 0));
  check(`audit.${region}.boundaries_hourly_steps`, ['summit', 'mid', 'base'].every(p => Object.values(a.boundaries[p].transitions).every(j => j.step_h === 1)));
  check(`audit.${region}.shared_grid_recorded`, a.grid_recorded_in_metadata);
  check(`audit.${region}.built_from_current_best_match`, a.timestamps.built_from_current_best_match && a.timestamps.multimodel_not_older_than_bm_minus_1h && a.timestamps.anchor_le_fetched);
}

const summary = {passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length};
writeFileSync(path.join(ROOT, 'work/weather/weather-display-tests.json'), JSON.stringify({ran_at: new Date().toISOString(), summary, results}, null, 2) + '\n');
for (const r of results) if (!r.pass) console.log('FAIL', JSON.stringify(r).slice(0, 300));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
