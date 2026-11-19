// Align existing Kiroro JMA observations and Open-Meteo model data on 72 UTC hours.
// Run: node scripts/weather-combine-kiroro.mjs
// Inputs are read-only. The output is a separate, reproducible validation snapshot.
import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const INPUTS = {
  observations: 'work/weather/kiroro-jma-amedas-observations.json',
  model: 'dist/data/weather/kiroro.json'
};
const OUTPUT = 'work/weather/kiroro-observation-model-aligned.json';
const HOURS = 72;
const HOUR_MS = 3600000;
const JST_MS = 9 * HOUR_MS;
const FIELDS = {
  temperature_c: {observation: 'temperature_c', model: 'temperature_2m', unit: 'degC', model_unit: '°C', period: 'instantaneous'},
  precipitation_1h_mm: {observation: 'precipitation_1h_mm', model: 'precipitation', unit: 'mm', model_unit: 'mm', period: 'preceding_1h'},
  wind_speed_ms: {observation: 'wind_speed_ms', model: 'wind_speed_10m', unit: 'm/s', model_unit: 'm/s', period: 'source_specific', observation_period: 'previous_10m_average', model_period: 'model_hourly_value'},
  new_snow_1h_cm: {observation: 'new_snow_1h_cm', model: 'snowfall', unit: 'cm', model_unit: 'cm', period: 'preceding_1h', observation_basis: 'positive_snow_depth_change', model_basis: 'modelled_snowfall'}
};
const MODEL_POINTS = ['summit', 'mid', 'base'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseHour(iso, context) {
  assert(typeof iso === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(iso), `${context}: missing timezone offset`);
  const ms = Date.parse(iso);
  assert(Number.isFinite(ms) && ms % HOUR_MS === 0, `${context}: invalid UTC hour ${iso}`);
  return ms;
}

function jstIso(ms) {
  return `${new Date(ms + JST_MS).toISOString().slice(0, 19)}+09:00`;
}

function empty(reason, unit, period) {
  return {value: null, unit, period, reason};
}

function observationValue(measurement, field) {
  if (!measurement) return {...empty('field_absent', field.unit, field.period), raw_value: null, quality_code: null, quality_status: null};
  const status = measurement.quality_status ?? null;
  const sourceUnit = measurement.unit ?? null;
  const usable = measurement.usable === true && [0, 1].includes(measurement.quality_code)
    && Number.isFinite(measurement.value);
  const reason = sourceUnit !== field.unit ? 'unit_mismatch'
    : usable ? null
      : status === 'not_observed' ? 'not_observed'
        : status === 'missing' ? 'quality_missing'
          : status === 'suspended' ? 'quality_suspended'
            : measurement.quality_code != null && ![0, 1].includes(measurement.quality_code) ? 'quality_unusable'
              : 'value_missing';
  return {
    value: reason ? null : measurement.value,
    unit: field.unit,
    period: field.period,
    reason,
    raw_value: measurement.raw_value ?? null,
    quality_code: measurement.quality_code ?? null,
    quality_status: status,
    source_unit: sourceUnit
  };
}

function modelValue(series, index, field, sourceUnit) {
  if (sourceUnit !== field.model_unit) return {...empty('unit_mismatch', field.unit, field.period), source_unit: sourceUnit ?? null};
  if (index == null) return {...empty('hour_absent', field.unit, field.period), source_unit: sourceUnit};
  if (!Array.isArray(series)) return {...empty('field_absent', field.unit, field.period), source_unit: sourceUnit};
  if (!Number.isFinite(series[index])) return {...empty('value_missing', field.unit, field.period), source_unit: sourceUnit};
  return {value: series[index], unit: field.unit, period: field.period, reason: null, source_unit: sourceUnit};
}

function indexedObservations(source) {
  const index = new Map();
  for (const record of source.records || []) {
    const utc = parseHour(record.observed_at_utc, `JMA ${record.station_code}`);
    assert(parseHour(record.observed_at_local, `JMA local ${record.station_code}`) === utc,
      `JMA UTC/JST mismatch: ${record.station_code} ${record.observed_at_utc}`);
    assert(record.observed_at_local === jstIso(utc), `JMA local time is not JST: ${record.observed_at_local}`);
    const key = `${record.station_code}|${utc}`;
    assert(!index.has(key), `duplicate JMA station-hour: ${key}`);
    index.set(key, record);
  }
  return index;
}

function indexedModelTimes(source) {
  const index = new Map();
  for (const [i, local] of (source.hourly?.time || []).entries()) {
    const utc = parseHour(local, `Open-Meteo hourly index ${i}`);
    assert(!index.has(utc), `duplicate Open-Meteo hour: ${local}`);
    index.set(utc, i);
  }
  return index;
}

function summarizeLayer(rows, layer, ids) {
  return Object.fromEntries(ids.map(id => [id, Object.fromEntries(Object.keys(FIELDS).map(name => {
    const values = rows.map(row => row[layer][id].values[name]);
    const present = values.filter(item => item.value !== null);
    const reasons = {};
    for (const item of values) if (item.reason) reasons[item.reason] = (reasons[item.reason] || 0) + 1;
    return [name, {available: present.length, missing: values.length - present.length, reasons}];
  }))]));
}

function compare(rows, stationCode, pointId) {
  return Object.fromEntries(Object.keys(FIELDS).map(name => {
    const pairs = rows.map(row => [row.observations[stationCode].values[name].value,
      row.model[pointId].values[name].value]).filter(([observation, model]) => observation != null && model != null);
    if (!pairs.length) return [name, {paired_hours: 0, mean_model_minus_observation: null,
      observation_total: null, model_total: null, reason: 'no_comparable_values'}];
    const sum = index => Number(pairs.reduce((total, pair) => total + pair[index], 0).toFixed(2));
    return [name, {
      paired_hours: pairs.length,
      mean_model_minus_observation: Number(((sum(1) - sum(0)) / pairs.length).toFixed(2)),
      observation_total: ['precipitation_1h_mm', 'new_snow_1h_cm'].includes(name) ? sum(0) : null,
      model_total: ['precipitation_1h_mm', 'new_snow_1h_cm'].includes(name) ? sum(1) : null,
      reason: null
    }];
  }));
}

async function main() {
  const raw = Object.fromEntries(await Promise.all(Object.entries(INPUTS).map(async ([name, path]) =>
    [name, await readFile(path)])));
  const hash = Object.fromEntries(Object.entries(raw).map(([name, bytes]) => [name,
    createHash('sha256').update(bytes).digest('hex')]));
  const observations = JSON.parse(raw.observations.toString('utf8'));
  const model = JSON.parse(raw.model.toString('utf8'));
  assert(observations.region_id === 'kiroro' && observations.provider === 'JMA'
    && observations.data_kind === 'observation', 'unexpected JMA source');
  assert(model.region_id === 'kiroro' && model.source === 'Open-Meteo', 'unexpected model source');
  assert(observations.stations?.length > 0 && MODEL_POINTS.every(id => model.points?.some(p => p.point_type === id)),
    'required station or model point metadata missing');
  assert(model.timezone === 'Asia/Tokyo' && model.utc_offset_seconds === 32400,
    'unexpected Open-Meteo time zone');
  const end = parseHour(observations.window.end_utc, 'JMA window end');
  const start = end - (HOURS - 1) * HOUR_MS;
  assert(parseHour(observations.window.start_utc, 'JMA window start') === start, 'JMA window is not 72 hours');
  const stationIndex = indexedObservations(observations);
  const modelIndex = indexedModelTimes(model);
  const modelFetchedMs = Date.parse(model.fetched_at);
  assert(Number.isFinite(modelFetchedMs), 'invalid model fetched_at');
  const rows = Array.from({length: HOURS}, (_, hour) => {
    const utcMs = start + hour * HOUR_MS;
    const modelHourIndex = modelIndex.get(utcMs);
    if (modelHourIndex != null) {
      assert(model.hourly.time[modelHourIndex] === jstIso(utcMs),
        `Open-Meteo UTC/JST mismatch: ${model.hourly.time[modelHourIndex]}`);
    }
    return {
      time_utc: new Date(utcMs).toISOString(),
      time_jst: jstIso(utcMs),
      observations: Object.fromEntries(observations.stations.map(station => {
        const record = stationIndex.get(`${station.station_code}|${utcMs}`);
        return [station.station_code, {
          provider: 'JMA', data_kind: 'observation', station_code: station.station_code,
          station_role: station.role, elevation_m: station.elevation_m,
          time_utc: record?.observed_at_utc ?? null, time_jst: record?.observed_at_local ?? null,
          values: Object.fromEntries(Object.entries(FIELDS).map(([name, field]) => [name,
            record ? observationValue(record.measurements?.[field.observation], field)
              : {...empty('station_hour_absent', field.unit, field.period), raw_value: null,
                quality_code: null, quality_status: null}]))
        }];
      })),
      model: Object.fromEntries(MODEL_POINTS.map(id => {
        const point = model.points.find(item => item.point_type === id);
        return [id, {
          provider: 'Open-Meteo', data_kind: 'model', model: model.model,
          point_id: `kiroro:${id}`, elevation_m: point.elevation, fetched_at: model.fetched_at,
          time_utc: modelHourIndex == null ? null : new Date(utcMs).toISOString(),
          time_jst: modelHourIndex == null ? null : model.hourly.time[modelHourIndex],
          valid_time_relative_to_fetch: modelHourIndex == null ? null : utcMs > modelFetchedMs ? 'future' : 'past_or_current',
          values: Object.fromEntries(Object.entries(FIELDS).map(([name, field]) => [name,
            modelValue(model.hourly[id]?.[field.model], modelHourIndex, field,
              model.units?.hourly?.[field.model])]))
        }];
      }))
    };
  });
  const aligned = {
    schema_version: 1,
    region_id: 'kiroro',
    data_kind: 'parallel_observation_model_view',
    inputs: Object.fromEntries(Object.entries(INPUTS).map(([name, path]) => [name, {path, sha256: hash[name]}])),
    time_axis: {timezone: 'UTC', local_timezone: 'Asia/Tokyo', hours: HOURS,
      first_utc: rows[0].time_utc, last_utc: rows.at(-1).time_utc,
      first_jst: rows[0].time_jst, last_jst: rows.at(-1).time_jst,
      alignment: 'exact_hour_no_interpolation'},
    fields: Object.fromEntries(Object.entries(FIELDS).map(([name, field]) => [name, {
      unit: field.unit, period: field.period, jma_field: field.observation, open_meteo_field: field.model,
      observation_period: field.observation_period || field.period,
      model_period: field.model_period || field.period,
      observation_basis: field.observation_basis || null,
      model_basis: field.model_basis || null
    }])),
    snow_basis: {
      jma: 'snow1h: positive change in measured snow depth between consecutive hourly observations',
      open_meteo: 'snowfall: modelled snowfall amount for preceding hour',
      same_hour_window: 't-1h < time <= t',
      interchangeable: false
    },
    stations: observations.stations.map(s => ({station_code: s.station_code, role: s.role,
      name_ja: s.name_ja, latitude: s.latitude, longitude: s.longitude,
      elevation_m: s.elevation_m, distance_from_kiroro_km: s.distance_from_kiroro_km})),
    model_points: model.points.map(p => ({point_id: `kiroro:${p.point_type}`, point_type: p.point_type,
      latitude: p.latitude, longitude: p.longitude, elevation_m: p.elevation})),
    rows,
    validation: {
      unique_utc_hours: new Set(rows.map(row => row.time_utc)).size,
      jst_utc_mismatches: rows.filter(row => parseHour(row.time_jst, 'output JST') !== Date.parse(row.time_utc)).length,
      observations: summarizeLayer(rows, 'observations', observations.stations.map(s => s.station_code)),
      model: summarizeLayer(rows, 'model', MODEL_POINTS),
      model_future_at_fetch_hours: rows.filter(row => row.model.summit.valid_time_relative_to_fetch === 'future').length,
      differences: Object.fromEntries(observations.stations.map(station => [station.station_code,
        Object.fromEntries(MODEL_POINTS.map(id => [id, compare(rows, station.station_code, id)]))]))
    }
  };
  assert(aligned.validation.unique_utc_hours === HOURS && aligned.validation.jst_utc_mismatches === 0,
    'output time alignment failed');
  await mkdir('work/weather', {recursive: true});
  await writeFile(`${OUTPUT}.tmp`, JSON.stringify(aligned, null, 2));
  await rename(`${OUTPUT}.tmp`, OUTPUT);
  console.log(JSON.stringify({output: OUTPUT, inputs_sha256: hash, time_axis: aligned.time_axis,
    observation_available: aligned.validation.observations,
    model_available: aligned.validation.model,
    model_future_at_fetch_hours: aligned.validation.model_future_at_fetch_hours}));
}

await main();
