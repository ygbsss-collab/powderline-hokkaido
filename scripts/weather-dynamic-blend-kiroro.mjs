// Experimental, snapshot-based Kiroro SLR and two-model blend.
// Run: node scripts/weather-dynamic-blend-kiroro.mjs
import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const COMPARISON = 'work/weather/kiroro-model-comparison.json';
const ANALYSIS = 'work/weather/kiroro-snowfall-analysis.json';
const OUTPUT = 'work/weather/kiroro-dynamic-blend.json';
const POINTS = ['summit', 'mid', 'base'];
const MODELS = ['best_match', 'jma_msm', 'ecmwf_ifs025'];
const BLEND_MODELS = ['jma_msm', 'ecmwf_ifs025'];
const FIELDS = ['temperature_2m', 'precipitation', 'rain', 'snowfall'];
const UNITS = {temperature_2m: '°C', precipitation: 'mm', rain: 'mm', snowfall: 'cm'};
const HOUR_MS = 3600000;
const CONFIG = {
  status: 'experimental_unvalidated',
  slr: {base_ratio: 10, temperature_coefficient_per_c: -1, minimum_ratio: 5, maximum_ratio: 20},
  weights: {jma_msm: 0.65, ecmwf_ifs025: 0.35}
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const round = (value, places = 4) => Number(value.toFixed(places));
const total = values => round(values.reduce((sum, value) => sum + value, 0));

export function calculateDynamicSlr(temperatureC, settings = CONFIG.slr) {
  if (!Number.isFinite(temperatureC)) return null;
  return Math.max(settings.minimum_ratio, Math.min(settings.maximum_ratio,
    settings.base_ratio + settings.temperature_coefficient_per_c * temperatureC));
}

function snowWaterEquivalent(precipitationMm, rainMm) {
  if (precipitationMm === null || rainMm === null) return {
    value_mm: null, reason: 'precipitation_or_rain_missing'
  };
  // Non-rain precipitation is a proxy, not a direct observation of snow phase.
  return {value_mm: round(Math.max(precipitationMm - rainMm, 0)), reason: null};
}

function validValue(value, field) {
  return Number.isFinite(value) && (field === 'temperature_2m' || value >= 0) ? value : null;
}

function processModel(raw, previous) {
  const original = Object.fromEntries(FIELDS.map(field => [field, validValue(raw?.[field], field)]));
  const missing = FIELDS.filter(field => original[field] === null);
  const swe = snowWaterEquivalent(original.precipitation, original.rain);
  const slr = calculateDynamicSlr(original.temperature_2m);
  const estimate = swe.value_mm === null || slr === null ? null
    : round(swe.value_mm * slr / 10);
  if (previous) {
    assert(previous.temperature_2m_c === original.temperature_2m &&
      previous.precipitation_mm === original.precipitation &&
      previous.rain_mm === original.rain &&
      previous.original_snowfall_cm === original.snowfall,
    'prior analysis and comparison source disagree');
    assert(previous.experimental_snowfall_cm === estimate,
      'prior SLR estimate and configured formula disagree');
  }
  return {
    original, snow_water_equivalent_proxy_mm: swe.value_mm,
    snow_water_equivalent_missing_reason: swe.reason,
    dynamic_slr_ratio: slr, dynamic_slr_snowfall_cm: estimate,
    missing_variables: missing,
    complete: missing.length === 0 && estimate !== null
  };
}

function spread(values) {
  if (values.some(value => value === null)) return {
    minimum_cm: null, maximum_cm: null, difference_cm: null,
    relative_difference: null, model_agreement_fraction: null,
    reason: 'one_or_both_models_missing'
  };
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const difference = maximum - minimum;
  const relative = maximum === 0 ? 0 : difference / maximum;
  return {minimum_cm: round(minimum), maximum_cm: round(maximum),
    difference_cm: round(difference), relative_difference: round(relative),
    model_agreement_fraction: round(1 - relative), reason: null};
}

function blend(row) {
  const missingModels = BLEND_MODELS.filter(id => !row.models[id].complete);
  if (missingModels.length) return {
    weighted_original_snowfall_cm: null, weighted_dynamic_slr_snowfall_cm: null,
    reason: `missing_model_values:${missingModels.join(',')}`
  };
  const weighted = field => round(BLEND_MODELS.reduce((sum, id) =>
    sum + CONFIG.weights[id] * row.models[id][field], 0));
  return {
    weighted_original_snowfall_cm: round(BLEND_MODELS.reduce((sum, id) =>
      sum + CONFIG.weights[id] * row.models[id].original.snowfall, 0)),
    weighted_dynamic_slr_snowfall_cm: weighted('dynamic_slr_snowfall_cm'),
    reason: null
  };
}

function aggregate(rows, expectedHours) {
  const models = Object.fromEntries(MODELS.map(id => {
    const available = rows.filter(row => row.models[id].complete);
    const complete = available.length === expectedHours;
    const sumField = getter => complete ? total(available.map(row => getter(row.models[id]))) : null;
    return [id, {complete, available_hours: available.length, expected_hours: expectedHours,
      missing_valid_times_utc: rows.filter(row => !row.models[id].complete)
        .map(row => row.valid_time_utc),
      precipitation_mm: sumField(model => model.original.precipitation),
      rain_mm: sumField(model => model.original.rain),
      snow_water_equivalent_proxy_mm: sumField(model => model.snow_water_equivalent_proxy_mm),
      original_snowfall_cm: sumField(model => model.original.snowfall),
      dynamic_slr_snowfall_cm: sumField(model => model.dynamic_slr_snowfall_cm)}];
  }));
  const availableBlend = rows.filter(row => row.blend.reason === null);
  const blendComplete = availableBlend.length === expectedHours;
  const weightedTotal = field => blendComplete ? round(BLEND_MODELS.reduce((sum, id) =>
    sum + CONFIG.weights[id] * models[id][field], 0)) : null;
  const blended = {complete: blendComplete, available_hours: availableBlend.length,
    expected_hours: expectedHours,
    missing_valid_times_utc: rows.filter(row => row.blend.reason !== null)
      .map(row => row.valid_time_utc),
    weighted_original_snowfall_cm: weightedTotal('original_snowfall_cm'),
    weighted_dynamic_slr_snowfall_cm: weightedTotal('dynamic_slr_snowfall_cm')};
  return {models, blend: blended,
    model_spread: {
      original_snowfall: spread(BLEND_MODELS.map(id => models[id].original_snowfall_cm)),
      dynamic_slr_snowfall: spread(BLEND_MODELS.map(id => models[id].dynamic_slr_snowfall_cm))
    }};
}

async function main() {
  assert(Math.abs(Object.values(CONFIG.weights).reduce((a, b) => a + b, 0) - 1) < 1e-12,
    'blend weights must sum to one');
  const bytes = Object.fromEntries(await Promise.all([COMPARISON, ANALYSIS].map(async path =>
    [path, await readFile(path)])));
  const hash = data => createHash('sha256').update(data).digest('hex');
  const sourceHashes = Object.fromEntries(Object.entries(bytes).map(([path, data]) => [path, hash(data)]));
  const comparison = JSON.parse(bytes[COMPARISON].toString('utf8'));
  const analysis = JSON.parse(bytes[ANALYSIS].toString('utf8'));
  assert(comparison.region_id === 'kiroro' && comparison.data_kind === 'model_comparison',
    'unexpected model comparison source');
  assert(analysis.region_id === 'kiroro' && analysis.data_kind === 'experimental_snowfall_analysis',
    'unexpected snowfall analysis source');
  assert(analysis.inputs?.[COMPARISON]?.sha256 === sourceHashes[COMPARISON],
    'snowfall analysis was produced from a different comparison snapshot');
  assert(MODELS.every(id => comparison.models.some(model => model.id === id)),
    'required model absent');
  for (const point of POINTS) for (const id of MODELS) {
    const run = comparison.runs.find(item => item.point_type === point && item.model_id === id);
    assert(run, `missing run ${point}/${id}`);
    for (const field of FIELDS) assert(run.units?.[field] === UNITS[field],
      `unit mismatch ${point}/${id}/${field}`);
  }
  const firstMs = Date.parse(analysis.first_valid_time_utc);
  assert(Number.isFinite(firstMs) && firstMs % HOUR_MS === 0, 'invalid analysis time anchor');
  const points = {};
  for (const point of POINTS) {
    const sourceRows = new Map(comparison.comparison?.[point]?.rows?.map(row =>
      [row.valid_time_utc, row]) || []);
    const previousRows = new Map(analysis.points?.[point]?.hourly?.map(row =>
      [row.valid_time_utc, row]) || []);
    assert(sourceRows.size > 0 && previousRows.size > 0, `missing point rows: ${point}`);
    const hourly = Array.from({length: 48}, (_, offset) => {
      const validMs = firstMs + offset * HOUR_MS;
      const validTime = new Date(validMs).toISOString();
      const source = sourceRows.get(validTime);
      const previous = previousRows.get(validTime);
      const models = Object.fromEntries(MODELS.map(id => [id,
        processModel(source?.models?.[id], previous?.models?.[id])]));
      const row = {valid_time_utc: validTime,
        preceding_interval_start_utc: new Date(validMs - HOUR_MS).toISOString(),
        models};
      row.blend = blend(row);
      row.model_spread = {
        original_snowfall: spread(BLEND_MODELS.map(id => models[id].original.snowfall)),
        dynamic_slr_snowfall: spread(BLEND_MODELS.map(id => models[id].dynamic_slr_snowfall_cm))
      };
      return row;
    });
    points[point] = {point_metadata: comparison.points?.find(item => item.point_type === point) ?? null,
      windows: {'24h': aggregate(hourly.slice(0, 24), 24),
        '48h': aggregate(hourly, 48)}, hourly};
  }
  const result = {
    schema_version: 1, region_id: 'kiroro', data_kind: 'experimental_dynamic_slr_weighted_blend',
    calculated_at_utc: new Date().toISOString(),
    first_valid_time_utc: analysis.first_valid_time_utc,
    input_hashes_sha256: sourceHashes, config: CONFIG,
    model_sources: comparison.models,
    method: {
      input_snapshot: 'existing comparison and snowfall analysis; no new forecast API request',
      time_axis: 'exact UTC valid hour, preceding-hour precipitation and snowfall interval',
      units: UNITS,
      snow_water_equivalent_proxy: 'max(precipitation_mm - rain_mm, 0); null if either missing',
      slr: 'clamp(base_ratio + temperature_coefficient_per_c * temperature_2m_c, minimum_ratio, maximum_ratio)',
      estimated_snowfall: 'snow_water_equivalent_proxy_mm * dynamic_slr_ratio / 10 (cm)',
      weighted_values: '65% JMA MSM + 35% ECMWF IFS, only when both exact-UTC model hours are complete',
      agreement: '1 - (max(model cm) - min(model cm)) / max(model cm); both zero => 1. Model-to-model similarity only, NOT forecast accuracy.',
      completeness: '24h/48h total is null unless every hour in that window is complete',
      warning: 'Unvalidated temperature-only SLR experiment. Non-rain precipitation is a snow-water proxy; do not use as an operational forecast.'
    },
    points
  };
  for (const path of [COMPARISON, ANALYSIS]) assert(hash(await readFile(path)) === sourceHashes[path],
    `input changed during processing: ${path}`);
  await mkdir('work/weather', {recursive: true});
  await writeFile(`${OUTPUT}.tmp`, JSON.stringify(result, null, 2));
  await rename(`${OUTPUT}.tmp`, OUTPUT);
  console.log(JSON.stringify({output: OUTPUT, input_hashes_unchanged: true,
    first_valid_time_utc: result.first_valid_time_utc,
    complete_windows: Object.fromEntries(POINTS.map(point => [point,
      Object.fromEntries(['24h', '48h'].map(window => [window,
        points[point].windows[window].blend.complete]))]))}));
}

// Run only as a script; importing (e.g. weather-multimodel-engine.mjs) reuses the functions without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
