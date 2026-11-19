// Compare separate Open-Meteo Best Match, JMA MSM and ECMWF IFS forecasts for Kiroro.
// Run: node scripts/weather-model-compare-kiroro.mjs
// Writes only work/weather/kiroro-model-comparison.json.
import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {deriveRegionPoints} from './weather-points.mjs';

const OUTPUT = 'work/weather/kiroro-model-comparison.json';
const STATIC_MODEL = 'dist/data/weather/kiroro.json';
const JMA_OBSERVATIONS = 'work/weather/kiroro-jma-amedas-observations.json';
const VARIABLES = ['temperature_2m', 'precipitation', 'rain', 'snowfall',
  'wind_speed_10m', 'wind_gusts_10m', 'freezing_level_height'];
const MODELS = [
  {id: 'best_match', endpoint: 'forecast', forecast_days: 16, provider: 'Open-Meteo'},
  {id: 'jma_msm', endpoint: 'forecast', forecast_days: 4, provider: 'JMA via Open-Meteo'},
  {id: 'ecmwf_ifs025', endpoint: 'ecmwf', forecast_days: 15, provider: 'ECMWF via Open-Meteo'}
];
const POINT_TYPES = ['summit', 'mid', 'base'];
const UNIT_EXPECTED = {
  temperature_2m: '°C', precipitation: 'mm', rain: 'mm', snowfall: 'cm',
  wind_speed_10m: 'm/s', wind_gusts_10m: 'm/s', freezing_level_height: 'm'
};
const HOUR_MS = 3600000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function fetchForecast(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.error) {
        const error = new Error(`HTTP ${response.status}: ${body?.reason || 'invalid response'}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      assert(Array.isArray(body?.hourly?.time), 'hourly time array absent');
      return body;
    } catch (error) {
      if (attempt === 3 || error.retryable === false) throw new Error(`${url}: ${error.message}`);
      await sleep(800 * 2 ** (attempt - 1));
    }
  }
}

export function forecastUrl(config, point) {
  const url = new URL(`https://api.open-meteo.com/v1/${config.endpoint}`);
  url.search = new URLSearchParams({
    latitude: String(point.latitude), longitude: String(point.longitude), elevation: String(point.elevation),
    models: config.id, hourly: VARIABLES.join(','), forecast_days: String(config.forecast_days),
    timezone: 'UTC', temperature_unit: 'celsius', precipitation_unit: 'mm', wind_speed_unit: 'ms'
  }).toString();
  return url;
}

export function normalize(config, point, body, fetchedAt) {
  assert(body.utc_offset_seconds === 0, `${config.id}/${point.point_type}: expected UTC`);
  const time = body.hourly.time.map(value => {
    assert(/^\d{4}-\d\d-\d\dT\d\d:00$/.test(value), `${config.id}: unexpected hour ${value}`);
    const utc = `${value}:00.000Z`;
    assert(Number.isFinite(Date.parse(utc)), `${config.id}: invalid time ${value}`);
    return utc;
  });
  assert(new Set(time).size === time.length, `${config.id}/${point.point_type}: duplicate time`);
  assert(time.every((value, index) => index === 0 || Date.parse(value) - Date.parse(time[index - 1]) === HOUR_MS),
    `${config.id}/${point.point_type}: non-hourly time axis`);
  const values = {}, missing_reasons = {}, availability = {}, units = {};
  for (const variable of VARIABLES) {
    const unit = body.hourly_units?.[variable] ?? null;
    assert(unit === null || unit === 'undefined' || unit === UNIT_EXPECTED[variable],
      `${config.id}/${point.point_type}/${variable}: unexpected unit ${unit}`);
    const source = body.hourly[variable];
    values[variable] = time.map((_, index) => unit === UNIT_EXPECTED[variable] && Number.isFinite(source?.[index])
      ? source[index] : null);
    const count = values[variable].filter(value => value !== null).length;
    const firstValid = values[variable].findIndex(value => value !== null);
    const lastValid = values[variable].findLastIndex(value => value !== null);
    missing_reasons[variable] = values[variable].map((value, index) => value !== null ? null
      : unit === 'undefined' ? 'unsupported'
        : firstValid !== -1 && (index < firstValid || index > lastValid) ? 'outside_model_horizon'
          : 'api_missing');
    const reasons = {};
    for (const reason of missing_reasons[variable]) if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
    availability[variable] = {available_hours: count, missing_hours: time.length - count,
      status: count ? 'available' : unit === 'undefined' ? 'unsupported' : 'unavailable',
      missing_by_reason: reasons};
    units[variable] = unit;
  }
  const usableIndices = time.map((_, index) => index).filter(index =>
    ['temperature_2m', 'precipitation', 'wind_speed_10m'].some(name => values[name][index] !== null));
  return {
    provider: config.provider, data_kind: 'model', model_id: config.id,
    point_id: point.point_id, point_type: point.point_type,
    requested_coordinate: {latitude: point.latitude, longitude: point.longitude, elevation_m: point.elevation},
    response_coordinate: {latitude: body.latitude, longitude: body.longitude, elevation_m: body.elevation},
    issued_at_utc: null, issued_at_reason: 'not_provided_by_forecast_response',
    fetched_at_utc: fetchedAt, time_utc: time, units, values, missing_reasons, availability,
    usable_time_range_utc: usableIndices.length ? [time[usableIndices[0]], time[usableIndices.at(-1)]] : [null, null],
    time_steps: time.length, usable_time_steps: usableIndices.length,
    source: {endpoint: `/v1/${config.endpoint}`, model_parameter: config.id,
      forecast_days_requested: config.forecast_days}
  };
}

function alignedComparison(runs) {
  const byPoint = {};
  for (const pointType of POINT_TYPES) {
    const selected = Object.fromEntries(MODELS.map(config => [config.id,
      runs.find(run => run.point_type === pointType && run.model_id === config.id)]));
    const indexes = Object.fromEntries(Object.entries(selected).map(([id, run]) => [id,
      new Map(run.time_utc.map((time, index) => [time, index]))]));
    const allTimes = [...new Set(Object.values(selected).flatMap(run => run.time_utc))].sort();
    const rows = allTimes.map(time => {
      const models = Object.fromEntries(MODELS.map(config => {
        const run = selected[config.id];
        const index = indexes[config.id].get(time);
        return [config.id, Object.fromEntries(VARIABLES.map(variable => [variable,
          index == null ? null : run.values[variable][index]]))];
      }));
      return {valid_time_utc: time, models};
    });
    const common = rows.filter(row => MODELS.every(config =>
      row.models[config.id].precipitation !== null && row.models[config.id].snowfall !== null));
    const totals = Object.fromEntries(MODELS.map(config => [config.id, {
      precipitation_mm: Number(common.reduce((sum, row) => sum + row.models[config.id].precipitation, 0).toFixed(2)),
      snowfall_cm: Number(common.reduce((sum, row) => sum + row.models[config.id].snowfall, 0).toFixed(2))
    }]));
    byPoint[pointType] = {
      hours: rows.length, first_utc: rows[0]?.valid_time_utc ?? null,
      last_utc: rows.at(-1)?.valid_time_utc ?? null,
      common_precipitation_snowfall_hours: common.length,
      common_time_range_utc: [common[0]?.valid_time_utc ?? null, common.at(-1)?.valid_time_utc ?? null],
      common_hour_totals: totals,
      rows
    };
  }
  return byPoint;
}

async function main() {
  const sourceBytes = Object.fromEntries(await Promise.all([STATIC_MODEL, JMA_OBSERVATIONS]
    .map(async path => [path, await readFile(path)])));
  const sourceHashes = Object.fromEntries(Object.entries(sourceBytes).map(([path, bytes]) => [path,
    createHash('sha256').update(bytes).digest('hex')]));
  const existing = JSON.parse(sourceBytes[STATIC_MODEL].toString('utf8'));
  assert(existing.region_id === 'kiroro' && existing.model === 'best_match', 'unexpected existing weather data');
  const derived = await deriveRegionPoints('kiroro', {checkDem: false});
  assert(derived.points.length === 3, `expected three Kiroro points, got ${derived.points.length}`);
  const points = POINT_TYPES.map(pointType => {
    const point = derived.points.find(item => item.point_type === pointType);
    const prior = existing.points.find(item => item.point_type === pointType);
    assert(point && prior && point.latitude === prior.latitude && point.longitude === prior.longitude
      && point.elevation === prior.elevation,
    `${pointType}: weather-points and existing Best Match point differ`);
    return point;
  });
  const runs = [];
  for (const config of MODELS) {
    for (const point of points) {
      const body = await fetchForecast(forecastUrl(config, point));
      runs.push(normalize(config, point, body, new Date().toISOString()));
    }
  }
  const comparison = alignedComparison(runs);
  for (const pointType of POINT_TYPES) {
    assert(comparison[pointType].common_precipitation_snowfall_hours > 0,
      `${pointType}: no overlapping precipitation and snowfall values`);
  }
  const output = {
    schema_version: 1, region_id: 'kiroro', data_kind: 'model_comparison', generated_at_utc: new Date().toISOString(),
    source_hashes_before: sourceHashes,
    points: points.map(({point_id, point_type, latitude, longitude, elevation}) =>
      ({point_id, point_type, latitude, longitude, elevation_m: elevation})),
    models: MODELS.map(({id, endpoint, forecast_days, provider}) =>
      ({id, provider, endpoint: `/v1/${endpoint}`, forecast_days_requested: forecast_days})),
    value_semantics: {
      precipitation: 'original Open-Meteo precipitation, mm, preceding hour',
      rain: 'original Open-Meteo rain, mm, preceding hour',
      snowfall: 'original Open-Meteo snowfall, cm, preceding hour; no local conversion or correction',
      jma_msm_rain_snow: 'Open-Meteo derives rain/snow from JMA total precipitation and temperature; JMA has no native snowfall field',
      model_run_time: 'not supplied by these forecast API responses; issued_at_utc is null'
    },
    runs, comparison
  };
  const sourceHashesAfter = Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async path =>
    [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  assert(Object.keys(sourceHashes).every(path => sourceHashes[path] === sourceHashesAfter[path]),
    'an input file changed during collection');
  output.source_hashes_after = sourceHashesAfter;
  await mkdir('work/weather', {recursive: true});
  await writeFile(`${OUTPUT}.tmp`, JSON.stringify(output));
  await rename(`${OUTPUT}.tmp`, OUTPUT);
  console.log(JSON.stringify({output: OUTPUT, source_hashes: sourceHashesAfter,
    runs: runs.map(run => ({model: run.model_id, point: run.point_type, time_steps: run.time_steps,
      usable_time_steps: run.usable_time_steps, range: run.usable_time_range_utc,
      missing: Object.fromEntries(VARIABLES.map(name => [name, run.availability[name].missing_hours]))})),
    common_hours: Object.fromEntries(POINT_TYPES.map(point => [point,
      comparison[point].common_precipitation_snowfall_hours]))}));
}

// Run only as a script; importing (e.g. weather-multimodel-engine.mjs) reuses the functions without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
