// Powderline Weather observations: JMA AMeDAS, Kiroro, rolling 72 completed hours.
// Run: node scripts/weather-observe-jma.mjs
// Output is observation-only and never reads or writes dist/data/weather/*.json.
import {mkdir, rename, writeFile} from 'node:fs/promises';

const BASE_URL = 'https://www.jma.go.jp/bosai/amedas';
const STATION_TABLE_URL = `${BASE_URL}/const/amedastable.json`;
const LATEST_TIME_URL = `${BASE_URL}/data/latest_time.txt`;
const OUTPUT_FILE = 'work/weather/kiroro-jma-amedas-observations.json';
const HOURS = 72;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KIRORO = {latitude: 43.08, longitude: 140.99};
const STATION_ROLES = [
  {station_code: '16091', role: 'weather', expected_name: '小樽'},
  {station_code: '16126', role: 'snow', expected_name: '赤井川'}
];

const QUALITY = {
  0: {status: 'normal', usable: true},
  1: {status: 'quasi_normal', usable: true},
  2: {status: 'doubtful', usable: false},
  3: {status: 'doubtful', usable: false},
  4: {status: 'insufficient', usable: false},
  5: {status: 'suspended', usable: false},
  6: {status: 'missing', usable: false}
};
const FIELDS = {
  temperature_c: {source: 'temp', unit: 'degC', element_index: 0},
  precipitation_1h_mm: {source: 'precipitation1h', unit: 'mm', element_index: 1},
  wind_speed_ms: {source: 'wind', unit: 'm/s', element_index: 3},
  wind_direction_16: {source: 'windDirection', unit: '16_point', element_index: 2},
  new_snow_1h_cm: {source: 'snow1h', unit: 'cm', element_index: 5},
  snow_depth_cm: {source: 'snow', unit: 'cm', element_index: 5}
};
const WIND_DIRECTIONS = [
  'calm', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S',
  'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N'
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchResource(url, {json = true, attempts = 3} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {'User-Agent': 'Powderline-Hokkaido/1.0 (JMA AMeDAS observations)'},
        signal: AbortSignal.timeout(20000)
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || (json && !contentType.includes('json'))) {
        const error = new Error(`HTTP ${response.status}${json && !contentType.includes('json') ? ` (${contentType || 'unknown content type'})` : ''}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return json ? response.json() : (await response.text()).trim();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || error.retryable === false) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${url}: ${lastError?.message || lastError}`);
}

function decimalDegrees([degrees, minutes]) {
  return Number((degrees + minutes / 60).toFixed(6));
}

function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude), lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Number((6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(2));
}

function jstParts(epochMs) {
  const iso = new Date(epochMs + JST_OFFSET_MS).toISOString();
  return {date: iso.slice(0, 10), hour: iso.slice(11, 13), minute: iso.slice(14, 16), second: iso.slice(17, 19)};
}

function observationKey(epochMs) {
  const p = jstParts(epochMs);
  return `${p.date.replaceAll('-', '')}${p.hour}${p.minute}${p.second}`;
}

function pointFileUrl(stationCode, epochMs) {
  const p = jstParts(epochMs);
  const blockHour = String(Math.floor(Number(p.hour) / 3) * 3).padStart(2, '0');
  return `${BASE_URL}/data/point/${stationCode}/${p.date.replaceAll('-', '')}_${blockHour}.json`;
}

function localIso(epochMs) {
  const p = jstParts(epochMs);
  return `${p.date}T${p.hour}:${p.minute}:${p.second}+09:00`;
}

function reading(tuple) {
  const present = Array.isArray(tuple);
  const rawValue = present && Number.isFinite(tuple[0]) ? tuple[0] : null;
  const qualityCode = present && Number.isInteger(tuple[1]) ? tuple[1] : null;
  const quality = qualityCode == null
    ? {status: 'not_observed', usable: false}
    : (QUALITY[qualityCode] || {status: 'unknown', usable: false});
  return {
    value: quality.usable ? rawValue : null,
    raw_value: rawValue,
    quality_code: qualityCode,
    quality_status: quality.status,
    usable: quality.usable && rawValue != null
  };
}

function normalizeRecord(station, epochMs, raw) {
  const measurements = Object.fromEntries(Object.entries(FIELDS).map(([name, field]) => [
    name, {...reading(raw?.[field.source]), unit: field.unit}
  ]));
  const direction = measurements.wind_direction_16.value;
  return {
    station_code: station.station_code,
    station_role: station.role,
    observed_at_local: localIso(epochMs),
    observed_at_utc: new Date(epochMs).toISOString(),
    measurements,
    wind_direction_label: Number.isInteger(direction) ? (WIND_DIRECTIONS[direction] || null) : null
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, run));
  return results;
}

function stationInfo(config, source) {
  if (!source) throw new Error(`JMA station ${config.station_code} is absent from amedastable.json`);
  if (source.kjName !== config.expected_name) {
    throw new Error(`JMA station ${config.station_code} changed: expected ${config.expected_name}, received ${source.kjName}`);
  }
  const latitude = decimalDegrees(source.lat), longitude = decimalDegrees(source.lon);
  const observedElements = Object.entries(FIELDS)
    .filter(([, field]) => source.elems?.[field.element_index] !== '0')
    .map(([name]) => name);
  return {
    station_code: config.station_code,
    role: config.role,
    name_ja: source.kjName,
    name_en: source.enName,
    station_type: source.type,
    latitude,
    longitude,
    elevation_m: source.alt,
    distance_from_kiroro_km: distanceKm(KIRORO, {latitude, longitude}),
    jma_elements_code: source.elems,
    observed_elements: observedElements,
    not_observed_elements: Object.keys(FIELDS).filter(name => !observedElements.includes(name))
  };
}

function summarize(station, records) {
  const stationRecords = records.filter(row => row.station_code === station.station_code);
  const fields = {};
  for (const name of Object.keys(FIELDS)) {
    const values = stationRecords.map(row => row.measurements[name]);
    fields[name] = {
      usable: values.filter(value => value.usable).length,
      missing_or_unusable: values.filter(value => !value.usable).length,
      quality_codes: [...new Set(values.map(value => value.quality_code))].sort((a, b) => (a ?? 99) - (b ?? 99))
    };
  }
  return {station_code: station.station_code, records: stationRecords.length, fields};
}

async function main() {
  const retrievedAt = new Date().toISOString();
  const [table, latestLocal] = await Promise.all([
    fetchResource(STATION_TABLE_URL),
    fetchResource(LATEST_TIME_URL, {json: false})
  ]);
  const latestMs = Date.parse(latestLocal);
  if (!Number.isFinite(latestMs)) throw new Error(`Invalid JMA latest time: ${latestLocal}`);
  const endMs = Math.floor(latestMs / 3600000) * 3600000;
  const hours = Array.from({length: HOURS}, (_, i) => endMs - (HOURS - 1 - i) * 3600000);
  const stations = STATION_ROLES.map(config => stationInfo(config, table[config.station_code]));
  const requests = [];
  for (const station of stations) {
    for (const url of new Set(hours.map(epochMs => pointFileUrl(station.station_code, epochMs)))) {
      requests.push({station_code: station.station_code, url});
    }
  }
  const fetched = await mapLimit(requests, 4, async request => ({
    ...request,
    body: await fetchResource(request.url)
  }));
  const blocks = new Map(fetched.map(item => [`${item.station_code}|${item.url}`, item.body]));
  const deduplicated = new Map();
  for (const station of stations) {
    for (const epochMs of hours) {
      const url = pointFileUrl(station.station_code, epochMs);
      const raw = blocks.get(`${station.station_code}|${url}`)?.[observationKey(epochMs)] || null;
      const record = normalizeRecord(station, epochMs, raw);
      deduplicated.set(`${record.station_code}|${record.observed_at_utc}`, record);
    }
  }
  const records = [...deduplicated.values()].sort((a, b) =>
    a.observed_at_utc.localeCompare(b.observed_at_utc) || a.station_code.localeCompare(b.station_code));
  const output = {
    schema_version: 1,
    region_id: 'kiroro',
    data_kind: 'observation',
    provider: 'JMA',
    product: 'AMeDAS',
    generated_at: retrievedAt,
    latest_jma_time_local: latestLocal,
    window: {
      hours: HOURS,
      start_local: localIso(hours[0]),
      end_local: localIso(hours.at(-1)),
      start_utc: new Date(hours[0]).toISOString(),
      end_utc: new Date(hours.at(-1)).toISOString()
    },
    region_reference: KIRORO,
    stations,
    quality_policy: {
      raw_tuple: '[value, JMA quality code]',
      usable_quality_codes: [0, 1],
      statuses: Object.fromEntries(Object.entries(QUALITY).map(([code, value]) => [code, value.status])),
      non_usable_values: 'value is null; raw_value and quality_code are retained',
      absent_elements: 'value is null with quality_status not_observed'
    },
    records,
    summary: stations.map(station => summarize(station, records)),
    provenance: {
      station_table_url: STATION_TABLE_URL,
      latest_time_url: LATEST_TIME_URL,
      point_url_pattern: `${BASE_URL}/data/point/{station_code}/{YYYYMMDD}_{3-hour-block}.json`,
      point_files_fetched: requests.length,
      attribution: 'Source: Japan Meteorological Agency website, processed by Powderline',
      warning: 'The bosai AMeDAS JSON is used by the JMA website but is not documented as a stable public API.'
    }
  };
  await mkdir('work/weather', {recursive: true});
  const temporary = `${OUTPUT_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(output, null, 2));
  await rename(temporary, OUTPUT_FILE);
  console.log(JSON.stringify({
    output: OUTPUT_FILE,
    window: output.window,
    stations: stations.map(station => ({code: station.station_code, name: station.name_ja, role: station.role,
      elevation_m: station.elevation_m, distance_km: station.distance_from_kiroro_km})),
    records: records.length,
    per_station: output.summary.map(item => ({station_code: item.station_code, records: item.records}))
  }));
}

await main();
