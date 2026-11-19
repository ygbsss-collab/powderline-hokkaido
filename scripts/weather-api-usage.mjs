// Open-Meteo weighted API usage estimate from the ACTUAL request parameters in the code.
// Weighting (open-meteo.com/en/pricing): 1 call = up to 10 variables and up to 14 days for one location; more counts
// proportionally (fractional): weight = max(1, variables / 10) × max(1, days / 14). Assumption: hourly + daily + current
// variables of one request are counted together. Model meta files (/data/<model>/static/meta.json) are static files and
// are listed separately (assumed NOT counted). Free non-commercial limits: 600/min, 5,000/h, 10,000/day, 300,000/month.
// Usage: node scripts/weather-api-usage.mjs [--regions=25,30] [--interval-h=2]   -> work/weather/weather-api-usage.json
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig, profileConfig, profileModels} from './weather-multimodel-engine.mjs';
import {FETCH_VARS, META_MODELS} from './weather-multimodel-publish.mjs';
import {writeJsonAtomic} from './snow-surface-publish.mjs';
import {CURRENT_VARS, HOURLY_VARS, DAILY_VARS, FORECAST_DAYS, PAST_DAYS_BY_COUNTRY} from './weather-collect.mjs';
import {weatherRegions, weatherRegionCounts} from './weather-regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LIMITS = {per_minute: 600, per_hour: 5000, per_day: 10000, per_month: 300000};
export const weight = (vars, days) => Math.max(1, vars / 10) * Math.max(1, days / 14);
const r2 = v => Math.round(v * 100) / 100;

export function collectorRequest(country = 'JP') {
  const current = CURRENT_VARS.length, hourly = HOURLY_VARS.length, daily = DAILY_VARS.length;
  const days = PAST_DAYS_BY_COUNTRY[country] + FORECAST_DAYS;
  return {variables: current + hourly + daily, breakdown: {current, hourly, daily}, days, weight: r2(weight(current + hourly + daily, days))};
}

// Best Match is reused from the collector output; configured DEM validation is cached in weather-regions.mjs.
export function perRegion(country, {points = 3} = {}) {
  const cfg = profileConfig(loadConfig(), country);
  const models = profileModels(cfg);
  const col = collectorRequest(country);
  const mm = Object.entries(models).filter(([id]) => id !== 'best_match').map(([id, m]) => {
    const days = m.forecast_days;
    return {model: id, variables: FETCH_VARS.length, days, weight: r2(weight(FETCH_VARS.length, days))};
  });
  const mmPerPoint = mm.reduce((a, x) => a + x.weight, 0);
  const metaFiles = Object.keys(models).reduce((a, id) => a + (META_MODELS[id]?.length || 0), 0) * 2; // before + after
  return {country, points, collector: {...col, requests: points, weighted: r2(points * col.weight)},
    dem: {requests: 0, weighted: 0, note: 'validated point DEM is cached in weather-regions.mjs'},
    multimodel: {models: mm, requests: points * mm.length, weighted: r2(points * mmPerPoint)},
    best_match_reused_requests: points,
    requests: points + points * mm.length, weighted: r2(points * col.weight + points * mmPerPoint), meta_file_requests_not_counted: metaFiles};
}

export function scenario({jp, kr, intervalH}) {
  const J = perRegion('JP'), K = perRegion('KR');
  const run = jp * J.weighted + kr * K.weighted, req = jp * J.requests + kr * K.requests;
  const runsPerDay = 24 / intervalH;
  const day = run * runsPerDay;
  return {regions: jp + kr, jp, kr, interval_h: intervalH, per_run: {requests: req, weighted: r2(run)}, per_day_weighted: r2(day), per_month_weighted: r2(day * 30),
    peak_hour_weighted: r2(run), within_free_limits: run <= LIMITS.per_hour && day <= LIMITS.per_day && day * 30 <= LIMITS.per_month,
    share_of_daily_limit: `${Math.round(day / LIMITS.per_day * 100)}%`, share_of_monthly_limit: `${Math.round(day * 30 / LIMITS.per_month * 100)}%`};
}

export function registeredScenario(intervalH = 2) {
  return {...scenario({jp: weatherRegionCounts.JP, kr: weatherRegionCounts.KR, intervalH}),
    region_ids: weatherRegions.map(region => region.id)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
  const counts = arg('regions', '25,30').split(',').map(Number);
  const interval = Number(arg('interval-h', 2));
  const J = perRegion('JP'), K = perRegion('KR');
  const registered = registeredScenario(interval);
  const scenarios = [];
  for (const n of counts) for (const [jp, kr] of [[n, 0], [Math.round(n / 2), n - Math.round(n / 2)], [0, n]]) for (const ih of [interval, 1]) scenarios.push(scenario({jp, kr, intervalH: ih}));
  const out = {computed_at: new Date().toISOString(), rule: 'weight = max(1, variables/10) × max(1, days/14) per location request', limits_free: LIMITS, per_region: {JP: J, KR: K}, scenarios};
  out.registered_regions = registered;
  if (!registered.within_free_limits) process.exitCode = 2;
  writeJsonAtomic(path.join(ROOT, 'work/weather/weather-api-usage.json'), out);
  console.log(`registered ${registered.regions} regions (JP ${registered.jp} / KR ${registered.kr}) every ${interval} h: ${registered.per_run.requests} forecast-data requests / ${registered.per_run.weighted} weighted per run; ${registered.per_day_weighted}/day; ${registered.per_month_weighted}/month; ${registered.within_free_limits ? 'OK' : 'EXCEEDED'}`);
  console.log(`per region and run  JP: ${J.requests} req / ${J.weighted} weighted   KR: ${K.requests} req / ${K.weighted} weighted   (collector request ${J.collector.variables} vars × ${J.collector.days} d = ${J.collector.weight} each)`);
  for (const s of scenarios) console.log(`${String(s.regions).padStart(2)} regions (JP ${String(s.jp).padStart(2)} / KR ${String(s.kr).padStart(2)}) every ${s.interval_h} h: run ${s.per_run.weighted} · day ${s.per_day_weighted} (${s.share_of_daily_limit}) · month ${s.per_month_weighted} (${s.share_of_monthly_limit}) · free limits ${s.within_free_limits ? 'OK' : 'EXCEEDED'}`);
}
