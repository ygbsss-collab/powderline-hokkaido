// Experimental snowfall comparison from the existing Kiroro three-model snapshot.
// Run: node scripts/weather-snow-analysis-kiroro.mjs
// Reads inputs only and writes work/weather/kiroro-snowfall-analysis.json.
import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const SOURCE = 'work/weather/kiroro-model-comparison.json';
const OBSERVATIONS = 'work/weather/kiroro-jma-amedas-observations.json';
const OUTPUT = 'work/weather/kiroro-snowfall-analysis.json';
const HOUR_MS = 3600000;
const WINDOWS = [24, 48, 72];
const VARIABLES = ['temperature_2m', 'precipitation', 'rain', 'snowfall'];
const POINTS = ['summit', 'mid', 'base'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const round = value => Number(value.toFixed(2));
const sum = values => round(values.reduce((total, value) => total + value, 0));

function ratioForTemperature(temperatureC) {
  return Math.max(5, Math.min(20, 10 - temperatureC));
}

function hourForModels(row, ids, nowMs, firstValidMs) {
  const validMs = Date.parse(row.valid_time_utc);
  assert(Number.isFinite(validMs), `invalid UTC valid time: ${row.valid_time_utc}`);
  if (!(validMs > nowMs && validMs >= firstValidMs && validMs % HOUR_MS === 0)) return null;
  const models = Object.fromEntries(ids.map(id => {
    const raw = row.models?.[id] || {};
    const values = Object.fromEntries(VARIABLES.map(name => [name,
      Number.isFinite(raw[name]) && raw[name] >= (name === 'temperature_2m' ? -Infinity : 0)
        ? raw[name] : null]));
    const missing = VARIABLES.filter(name => values[name] === null);
    // Precipitation minus rain is a water-equivalent proxy, not a phase observation.
    const snowWater = values.precipitation !== null && values.rain !== null
      ? Math.max(0, values.precipitation - values.rain) : null;
    const ratio = values.temperature_2m === null ? null : ratioForTemperature(values.temperature_2m);
    return [id, {
      temperature_2m_c: values.temperature_2m,
      precipitation_mm: values.precipitation,
      rain_mm: values.rain,
      snow_water_equivalent_proxy_mm: snowWater,
      original_snowfall_cm: values.snowfall,
      experimental_slr: ratio,
      experimental_snowfall_cm: snowWater === null || ratio === null ? null
        : Number((snowWater * ratio / 10).toFixed(4)),
      complete: missing.length === 0,
      missing_variables: missing
    }];
  }));
  return {valid_time_utc: row.valid_time_utc, preceding_interval_start_utc:
    new Date(validMs - HOUR_MS).toISOString(), models,
    common_complete: ids.every(id => models[id].complete)};
}

function totalsFor(rows, modelId, expectedHours) {
  const values = rows.map(row => row?.models?.[modelId] || null);
  const available = values.filter(value => value?.complete);
  const missing = values.map((value, index) => value?.complete ? null : {
    valid_time_utc: rows[index]?.valid_time_utc ?? null,
    variables: value?.missing_variables ?? VARIABLES,
    reason: value ? 'missing_model_variables' : 'hour_absent'
  }).filter(Boolean);
  const partial = {
    precipitation_mm: sum(available.map(value => value.precipitation_mm)),
    rain_mm: sum(available.map(value => value.rain_mm)),
    snow_water_equivalent_proxy_mm: sum(available.map(value => value.snow_water_equivalent_proxy_mm)),
    original_snowfall_cm: sum(available.map(value => value.original_snowfall_cm)),
    experimental_snowfall_cm: sum(available.map(value => value.experimental_snowfall_cm))
  };
  const complete = available.length === expectedHours && missing.length === 0;
  return {complete, available_hours: available.length, expected_hours: expectedHours,
    totals: complete ? partial : Object.fromEntries(Object.keys(partial).map(name => [name, null])),
    partial_totals: complete ? null : partial,
    missing_hours: missing.length,
    missing: missing.length ? missing : []};
}

function spread(modelTotals, ids, name) {
  const amounts = ids.map(id => modelTotals[id].totals[name]);
  if (amounts.some(amount => amount === null)) return {
    complete: false, minimum: null, maximum: null, range: null,
    reason: 'not_all_models_have_complete_window'
  };
  return {complete: true, minimum: Math.min(...amounts), maximum: Math.max(...amounts),
    range: round(Math.max(...amounts) - Math.min(...amounts)), reason: null};
}

function analyzePoint(sourceRows, ids, firstValidMs) {
  const futureRows = sourceRows.map(row => hourForModels(row, ids, firstValidMs - 1, firstValidMs))
    .filter(Boolean);
  const index = new Map(futureRows.map(row => [Date.parse(row.valid_time_utc), row]));
  const windows = Object.fromEntries(WINDOWS.map(hours => {
    const rows = Array.from({length: hours}, (_, offset) => {
      const validMs = firstValidMs + offset * HOUR_MS;
      return index.get(validMs) || {valid_time_utc: new Date(validMs).toISOString(), models: {}};
    });
    const models = Object.fromEntries(ids.map(id => [id, totalsFor(rows, id, hours)]));
    const commonRows = rows.filter(row => ids.every(id => row.models?.[id]?.complete));
    const commonPartial = Object.fromEntries(ids.map(id => [id, {
      precipitation_mm: sum(commonRows.map(row => row.models[id].precipitation_mm)),
      original_snowfall_cm: sum(commonRows.map(row => row.models[id].original_snowfall_cm)),
      experimental_snowfall_cm: sum(commonRows.map(row => row.models[id].experimental_snowfall_cm))
    }]));
    return [`${hours}h`, {
      hours, start_interval_utc: new Date(firstValidMs - HOUR_MS).toISOString(),
      first_valid_time_utc: new Date(firstValidMs).toISOString(),
      last_valid_time_utc: new Date(firstValidMs + (hours - 1) * HOUR_MS).toISOString(),
      common_complete_hours: commonRows.length,
      common_complete: commonRows.length === hours,
      models,
      spread: {
        precipitation_mm: spread(models, ids, 'precipitation_mm'),
        original_snowfall_cm: spread(models, ids, 'original_snowfall_cm'),
        experimental_snowfall_cm: spread(models, ids, 'experimental_snowfall_cm')
      },
      common_partial_totals: commonRows.length === hours ? null : {
        hours: commonRows.length,
        first_valid_time_utc: commonRows[0]?.valid_time_utc ?? null,
        last_valid_time_utc: commonRows.at(-1)?.valid_time_utc ?? null,
        models: commonPartial,
        warning: 'partial common hours; not a complete window total'
      }
    }];
  }));
  return {windows, hourly: futureRows.filter(row =>
    Date.parse(row.valid_time_utc) < firstValidMs + 72 * HOUR_MS)};
}

async function main() {
  const inputBytes = Object.fromEntries(await Promise.all([SOURCE, OBSERVATIONS].map(async path =>
    [path, await readFile(path)])));
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const sourceHashes = Object.fromEntries(Object.entries(inputBytes).map(([path, bytes]) => [path, sha256(bytes)]));
  const source = JSON.parse(inputBytes[SOURCE].toString('utf8'));
  const observations = JSON.parse(inputBytes[OBSERVATIONS].toString('utf8'));
  assert(source.region_id === 'kiroro' && source.data_kind === 'model_comparison', 'unexpected comparison source');
  assert(observations.region_id === 'kiroro' && observations.data_kind === 'observation', 'unexpected observation source');
  const ids = source.models.map(model => model.id);
  assert(ids.length === 3 && new Set(ids).size === 3, 'expected three distinct models');
  assert(POINTS.every(point => source.comparison?.[point]?.rows), 'missing model point comparison');
  const nowMs = Date.now();
  // A preceding-hour amount must cover a wholly future hour, so skip the interval containing now.
  const firstValidMs = (Math.floor(nowMs / HOUR_MS) + 2) * HOUR_MS;
  const points = Object.fromEntries(POINTS.map(point => [point,
    analyzePoint(source.comparison[point].rows, ids, firstValidMs)]));
  const result = {
    schema_version: 1, region_id: 'kiroro', data_kind: 'experimental_snowfall_analysis',
    analyzed_at_utc: new Date(nowMs).toISOString(),
    first_valid_time_utc: new Date(firstValidMs).toISOString(),
    inputs: Object.fromEntries(Object.entries(sourceHashes).map(([path, hash]) => [path, {sha256: hash}])),
    model_sources: source.models,
    model_points: source.points,
    model_usable_ranges: source.runs.map(run => ({model_id: run.model_id, point_id: run.point_id,
      usable_time_range_utc: run.usable_time_range_utc})),
    observation_anchors: observations.stations.map(station => ({provider: 'JMA', data_kind: 'observation',
      station_code: station.station_code, role: station.role, latitude: station.latitude,
      longitude: station.longitude, elevation_m: station.elevation_m})),
    observation_values_used: false,
    method: {
      forecast_only: true,
      time_axis: 'UTC valid time; preceding-hour precipitation/snowfall interval',
      first_interval_rule: 'the full preceding hour must start after analyzed_at_utc',
      snow_water_equivalent_proxy: 'max(precipitation_mm - rain_mm, 0); null if either input is missing',
      slr_experiment: 'SLR = clamp(10 - temperature_2m_c, 5, 20)',
      slr_snowfall: 'snow_water_equivalent_proxy_mm * SLR / 10 (cm)',
      caution: 'Experimental surface-temperature heuristic, not a calibrated snowfall prediction. Non-rain precipitation is only a snow-water proxy.',
      completeness: 'full totals and between-model spreads are null unless every hour and variable in the window is present'
    },
    points
  };
  const hashesAfter = Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async path =>
    [path, sha256(await readFile(path))])));
  assert(Object.keys(sourceHashes).every(path => hashesAfter[path] === sourceHashes[path]), 'input changed during analysis');
  await mkdir('work/weather', {recursive: true});
  await writeFile(`${OUTPUT}.tmp`, JSON.stringify(result, null, 2));
  await rename(`${OUTPUT}.tmp`, OUTPUT);
  console.log(JSON.stringify({output: OUTPUT, analyzed_at_utc: result.analyzed_at_utc,
    first_valid_time_utc: result.first_valid_time_utc, input_hashes_unchanged: true,
    windows: Object.fromEntries(POINTS.map(point => [point,
      Object.fromEntries(WINDOWS.map(hours => {
        const window = points[point].windows[`${hours}h`];
        return [`${hours}h`, {common_hours: window.common_complete_hours,
          complete: window.common_complete, models: Object.fromEntries(ids.map(id => [id, {
            complete: window.models[id].complete, totals: window.models[id].totals}])),
          spread: window.spread}];
      }))]))}));
}

await main();
