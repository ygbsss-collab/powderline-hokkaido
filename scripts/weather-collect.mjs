// Powderline Weather Condition, step 1: Open-Meteo Best Match collection + validation + local cache.
// Run: node scripts/weather-collect.mjs [regionId ... | all] [--publish]      (default: kiroro)
//   --publish also writes the app's static copy dist/data/weather/<region>.json (see publishRegion).
//
// Per region it requests the reference grid coordinate (regions below, API's own DEM elevation) and the
// summit / mid / base points from weather-points.mjs with their own latitude / longitude / elevation.
// Points with status 'needs_review' are skipped (never used as confirmed elevations).
// Output: work/weather/<region>-<UTC stamp>.json, rows shaped for future Supabase tables (no DB access here).
// The terminal shows a summary only. Request style follows scripts/test-weather-api.mjs (same params / timeout).
import {mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {deriveRegionPoints, primarySkiAreas} from './weather-points.mjs';
import {weatherRegionById} from './weather-regions.mjs';

const MODEL = 'best_match';
const SCHEMA_VERSION = 1;
export const PAST_DAYS_BY_COUNTRY = Object.freeze({JP: 3, KR: 2});
export const FORECAST_DAYS = 16;

export const CURRENT_VARS = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation', 'rain', 'snowfall', 'snow_depth',
  'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'shortwave_radiation', 'weather_code'];
export const HOURLY_VARS = CURRENT_VARS;
export const DAILY_VARS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'rain_sum', 'snowfall_sum',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'shortwave_radiation_sum', 'weather_code'];

// Physical plausibility ranges (units: °C, %, mm, cm, m, m/s, °, W/m², MJ/m²). Outside = flagged, not dropped.
const RANGES = {
  temperature_2m: [-60, 45], temperature_2m_max: [-60, 45], temperature_2m_min: [-60, 45], apparent_temperature: [-80, 55],
  relative_humidity_2m: [0, 100], precipitation: [0, 300], rain: [0, 300], snowfall: [0, 300], snow_depth: [0, 15],
  precipitation_sum: [0, 1000], rain_sum: [0, 1000], snowfall_sum: [0, 1000],
  wind_speed_10m: [0, 80], wind_gusts_10m: [0, 120], wind_speed_10m_max: [0, 80], wind_gusts_10m_max: [0, 120],
  wind_direction_10m: [0, 360], shortwave_radiation: [0, 1400], shortwave_radiation_sum: [0, 50], weather_code: [0, 99]
};

function requestUrl({latitude, longitude, elevation}, {pastDays, timezone}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  const params = {
    latitude: String(latitude), longitude: String(longitude), models: MODEL,
    current: CURRENT_VARS.join(','), hourly: HOURLY_VARS.join(','), daily: DAILY_VARS.join(','),
    past_days: String(pastDays), forecast_days: String(FORECAST_DAYS),
    timezone, wind_speed_unit: 'ms'
  };
  if (Number.isFinite(elevation)) params.elevation = String(elevation);
  url.search = new URLSearchParams(params).toString();
  return url;
}

// ---- Network policy (CI: GitHub runners -> api.open-meteo.com) ----
// Up to MAX_ATTEMPTS per point, retrying ONLY transient failures: connection-level errors (undici "fetch failed" with
// ECONNRESET / ETIMEDOUT / EAI_AGAIN / UND_ERR_* ...), request timeouts, HTTP 429 / 5xx and a 200 whose body could not
// be read as JSON. Never retried: other HTTP 4xx (bad parameters) and non-network exceptions.
// Time: REQUEST_TIMEOUT_MS per attempt, and a per-region budget REGION_BUDGET_MS (3 points) so one bad region cannot
// stall the run (weather-pipeline.mjs kills a collector after 5 min; 15 regions stay well inside the 45 min job).
export const REQUEST_TIMEOUT_MS = 20000;
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [2000, 6000]; // before attempt 2, 3 (+ up to 25 % jitter); Retry-After honoured up to 15 s
export const REGION_BUDGET_MS = 120000;
const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH',
  'EHOSTUNREACH', 'ENETDOWN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_CLOSED',
  'UND_ERR_ABORTED', 'ERR_SSL_WRONG_VERSION_NUMBER', 'ECONNCLOSED']);

// Error -> {kind, code, message, transient}. Walks error.cause (undici puts the real reason there: "fetch failed" alone
// says nothing). Messages are capped; the request URL holds only public coordinates / parameters.
export function describeFetchError(error) {
  const chain = [];
  for (let e = error, depth = 0; e && depth < 4; e = e.cause, depth++) chain.push(e);
  const code = chain.map(e => e?.code).find(c => typeof c === 'string') || null;
  const name = error?.name || 'Error';
  const timeout = chain.some(e => e?.name === 'TimeoutError' || e?.name === 'AbortError');
  const message = chain.map(e => `${e?.name || 'Error'}: ${e?.message || e}`).join(' <- ').slice(0, 300);
  const network = name === 'TypeError' && /fetch failed|terminated|other side closed|socket/i.test(String(error?.message));
  return {kind: timeout ? 'timeout' : code ? 'network' : network ? 'network' : 'exception', code, message,
    transient: timeout || (code ? TRANSIENT_CODES.has(code) : network)};
}

const sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms));

// One point: {ok, status, body, attempts, elapsed_ms, attempt_log, error?, code?, kind?}. Never throws.
export async function request(location, settings, {fetchImpl = fetch, sleep = sleepMs, now = Date.now, deadline = Infinity, random = Math.random, log = () => {}} = {}) {
  const url = requestUrl(location, settings);
  const started = now();
  const attemptLog = [];
  for (let attempt = 1; ; attempt++) {
    const t0 = now();
    const timeout = Math.max(1000, Math.min(REQUEST_TIMEOUT_MS, deadline - t0));
    let outcome;
    try {
      const response = await fetchImpl(url, {signal: AbortSignal.timeout(timeout)});
      let body = null, bodyError = null;
      try { body = await response.json(); } catch (e) { bodyError = describeFetchError(e); }
      if (response.ok && body && typeof body === 'object' && !body.error) outcome = {ok: true, status: response.status, body};
      else if (response.ok) outcome = {ok: false, status: response.status, body, kind: 'invalid_body', code: bodyError?.code ?? null,
        error: bodyError ? `body unreadable: ${bodyError.message}` : String(body?.reason || 'invalid JSON body').slice(0, 200), transient: true};
      else outcome = {ok: false, status: response.status, body, kind: 'http', code: null, error: String(body?.reason || `HTTP ${response.status}`).slice(0, 200),
        transient: response.status === 429 || response.status >= 500, retryAfter: Number(response.headers?.get?.('retry-after'))};
    } catch (error) {
      const d = describeFetchError(error);
      outcome = {ok: false, status: null, body: null, kind: d.kind, code: d.code, error: d.message, transient: d.transient};
    }
    const elapsed = now() - t0;
    attemptLog.push({attempt, ms: elapsed, http: outcome.status, kind: outcome.ok ? 'ok' : outcome.kind, code: outcome.code ?? null, error: outcome.ok ? null : outcome.error});
    if (outcome.ok) return {ok: true, status: outcome.status, body: outcome.body, attempts: attempt, elapsed_ms: now() - started, attempt_log: attemptLog};
    let delay = RETRY_DELAYS_MS[attempt - 1] ?? 0;
    delay = Math.round(delay * (1 + 0.25 * random()));
    if (Number.isFinite(outcome.retryAfter) && outcome.retryAfter > 0) delay = Math.max(delay, Math.min(outcome.retryAfter * 1000, 15000));
    const outOfTime = now() + delay + 1000 > deadline;
    const retry = outcome.transient && attempt < MAX_ATTEMPTS && !outOfTime;
    log({point_id: location.point_id, attempt, ms: elapsed, http: outcome.status, kind: outcome.kind, code: outcome.code ?? null, error: outcome.error,
      next: retry ? `retry in ${delay} ms` : !outcome.transient ? 'not retryable' : outOfTime ? 'region time budget exhausted' : 'attempts exhausted'});
    if (!retry) {
      return {ok: false, status: outcome.status, body: outcome.body, attempts: attempt, elapsed_ms: now() - started, attempt_log: attemptLog,
        kind: outcome.kind, code: outcome.code ?? null, error: outcome.error, transient: outcome.transient,
        gave_up: !outcome.transient ? 'not_retryable' : outOfTime ? 'region_budget' : 'max_attempts'};
    }
    await sleep(delay);
  }
}

// Local wall time from the API ("2026-11-18T13:00") + its UTC offset -> ISO timestamp with offset.
function withOffset(localTime, offsetSeconds) {
  const sign = offsetSeconds < 0 ? '-' : '+';
  const abs = Math.abs(offsetSeconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0'), mm = String(Math.floor(abs % 3600 / 60)).padStart(2, '0');
  return `${localTime.length === 16 ? localTime + ':00' : localTime}${sign}${hh}:${mm}`;
}

function checkSeries(block, vars) {
  const times = Array.isArray(block?.time) ? block.time : [];
  return Object.fromEntries(vars.map(name => {
    const series = block?.[name];
    if (!Array.isArray(series)) return [name, {present: false, valid: 0, missing: times.length, out_of_range: 0}];
    let valid = 0, outOfRange = 0, firstMissing = null, lastValid = null;
    const [min, max] = RANGES[name] || [-Infinity, Infinity];
    series.forEach((value, index) => {
      if (Number.isFinite(value)) {
        valid++;
        lastValid = times[index];
        if (value < min || value > max) outOfRange++;
      } else if (firstMissing == null) firstMissing = times[index];
    });
    return [name, {present: true, valid, missing: times.length - valid, out_of_range: outOfRange,
      first_missing: firstMissing, last_valid: lastValid}];
  }));
}

function rowsFrom(block, vars, base, timeKey, offset) {
  const times = Array.isArray(block?.time) ? block.time : [];
  return times.map((time, index) => ({
    ...base,
    [timeKey]: timeKey === 'forecast_date' ? time : withOffset(time, offset),
    ...Object.fromEntries(vars.map(name => [name, Number.isFinite(block[name]?.[index]) ? block[name][index] : null]))
  }));
}

async function collectPoint(regionId, location, settings, net = {}) {
  const fetchedAt = new Date().toISOString();
  const result = await request(location, settings, net);
  const failure = extra => ({http: result.status, error: result.error, kind: result.kind, code: result.code, attempts: result.attempts,
    elapsed_ms: result.elapsed_ms, gave_up: result.gave_up, attempt_log: result.attempt_log, fetched_at: fetchedAt, ...extra});
  if (!result.ok) return failure();
  const body = result.body;
  if (!body.hourly || !body.daily || !Number.isFinite(Number(body.utc_offset_seconds))) {
    return failure({kind: 'invalid_body', error: 'response without hourly / daily / utc_offset_seconds'});
  }
  const offset = Number(body.utc_offset_seconds) || 0;
  const key = {region_id: regionId, point_id: location.point_id, model: MODEL, fetched_at: fetchedAt};
  const snapshot = {
    ...key, point_type: location.point_type,
    latitude: location.latitude, longitude: location.longitude, // requested (point) coordinate
    elevation: Number.isFinite(body.elevation) ? body.elevation : null, // elevation Open-Meteo applied
    requested_elevation: Number.isFinite(location.elevation) ? location.elevation : null,
    grid_latitude: body.latitude, grid_longitude: body.longitude,
    timezone: body.timezone, utc_offset_seconds: offset, past_days: settings.pastDays, forecast_days: FORECAST_DAYS,
    generationtime_ms: body.generationtime_ms,
    units: {current: body.current_units, hourly: body.hourly_units, daily: body.daily_units}
  };
  const current = body.current ? {
    ...key, forecast_time: withOffset(body.current.time, offset), interval_seconds: body.current.interval,
    ...Object.fromEntries(CURRENT_VARS.map(name => [name, Number.isFinite(body.current[name]) ? body.current[name] : null]))
  } : null;
  return {
    http: result.status, attempts: result.attempts, elapsed_ms: result.elapsed_ms, snapshot, current,
    hourly: rowsFrom(body.hourly, HOURLY_VARS, key, 'forecast_time', offset),
    daily: rowsFrom(body.daily, DAILY_VARS, key, 'forecast_date', offset),
    quality: {
      current: Object.fromEntries(CURRENT_VARS.map(name => [name, Number.isFinite(body.current?.[name]) ? 'valid' : 'missing'])),
      hourly: checkSeries(body.hourly, HOURLY_VARS), daily: checkSeries(body.daily, DAILY_VARS),
      hours: body.hourly?.time?.length || 0, days: body.daily?.time?.length || 0,
      range: [body.hourly?.time?.[0] || null, body.hourly?.time?.at(-1) || null]
    }
  };
}

// Summit vs base etc. over hours where both have values: mean diff for temperature / wind, totals for rain / snow.
function comparePoints(a, b) {
  const byTime = new Map(b.hourly.map(row => [row.forecast_time, row]));
  const acc = {temperature_2m: [], wind_speed_10m: [], rain: [0, 0], snowfall: [0, 0], hours: 0};
  for (const row of a.hourly) {
    const other = byTime.get(row.forecast_time);
    if (!other) continue;
    acc.hours++;
    for (const name of ['temperature_2m', 'wind_speed_10m']) {
      if (row[name] != null && other[name] != null) acc[name].push(row[name] - other[name]);
    }
    for (const name of ['rain', 'snowfall']) {
      if (row[name] != null && other[name] != null) { acc[name][0] += row[name]; acc[name][1] += other[name]; }
    }
  }
  const mean = list => (list.length ? Number((list.reduce((s, v) => s + v, 0) / list.length).toFixed(2)) : null);
  const maxAbs = list => (list.length ? Number(Math.max(...list.map(Math.abs)).toFixed(2)) : null);
  return {
    hours: acc.hours,
    temperature_mean_diff_c: mean(acc.temperature_2m), temperature_max_abs_diff_c: maxAbs(acc.temperature_2m),
    wind_mean_diff_ms: mean(acc.wind_speed_10m), wind_max_abs_diff_ms: maxAbs(acc.wind_speed_10m),
    rain_total_mm: acc.rain.map(v => Number(v.toFixed(1))), snowfall_total_cm: acc.snowfall.map(v => Number(v.toFixed(2)))
  };
}

function compactQuality(q) {
  const flag = series => Object.entries(series)
    .filter(([, s]) => !s.present || s.missing || s.out_of_range)
    .map(([name, s]) => `${name}:${s.present ? `missing ${s.missing}${s.out_of_range ? ` range ${s.out_of_range}` : ''}${s.first_missing ? ` from ${s.first_missing}` : ''}` : 'absent'}`);
  return {hours: q.hours, days: q.days, range: q.range,
    current_missing: Object.entries(q.current).filter(([, v]) => v !== 'valid').map(([k]) => k),
    hourly_issues: flag(q.hourly), daily_issues: flag(q.daily)};
}

// net: {fetchImpl, sleep, now, random} for tests; the region time budget starts here.
export async function collectRegion(regionId, net = {}) {
  const deadline = (net.now || Date.now)() + REGION_BUDGET_MS;
  // Every failed attempt goes to stderr at once (one JSON line), so the Actions log shows the real cause per point.
  const log = entry => console.error(JSON.stringify({collect_attempt_failed: regionId, ...entry}));
  const region = weatherRegionById[regionId];
  if (!region) throw new Error(`unknown weather region: ${regionId}`);
  const settings = {pastDays: PAST_DAYS_BY_COUNTRY[region.country], timezone: region.timezone};
  const derived = await deriveRegionPoints(regionId);
  const locations = [];
  const skipped = [];
  for (const p of derived.points) {
    if (p.status !== 'confirmed') { skipped.push({point_id: p.point_id, issues: p.issues}); continue; }
    locations.push({point_id: p.point_id, point_type: p.point_type, latitude: p.latitude, longitude: p.longitude, elevation: p.elevation});
  }
  const output = {
    schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), region_id: regionId, model: MODEL,
    request: {endpoint: '/v1/forecast', past_days: settings.pastDays, forecast_days: FORECAST_DAYS, timezone: settings.timezone,
      wind_speed_unit: 'ms', current: CURRENT_VARS, hourly: HOURLY_VARS, daily: DAILY_VARS},
    // Future tables (not created): weather_points, weather_snapshots, weather_current, weather_hourly, weather_daily.
    // Row key: region_id + point_id + model + fetched_at (+ forecast_time / forecast_date).
    points: derived.points, point_issues: derived.issues, skipped_points: skipped,
    snapshots: [], current: [], hourly: [], daily: [], quality: {}, errors: [], comparisons: {}
  };
  output.requested_points = locations.length;
  output.network = {attempts: 0, retried_points: 0, elapsed_ms: 0, budget_ms: REGION_BUDGET_MS};
  const results = {};
  for (const location of locations) {
    const r = await collectPoint(regionId, location, settings, {log, ...net, deadline});
    output.network.attempts += r.attempts || 0;
    output.network.elapsed_ms += r.elapsed_ms || 0;
    if ((r.attempts || 0) > 1) output.network.retried_points++;
    if (r.error) {
      output.errors.push({point_id: location.point_id, http: r.http ?? null, kind: r.kind ?? null, code: r.code ?? null, error: r.error,
        attempts: r.attempts ?? null, elapsed_ms: r.elapsed_ms ?? null, gave_up: r.gave_up ?? null, attempt_log: r.attempt_log ?? []});
      continue;
    }
    results[location.point_type] = r;
    output.snapshots.push(r.snapshot);
    if (r.current) output.current.push(r.current);
    output.hourly.push(...r.hourly);
    output.daily.push(...r.daily);
    output.quality[location.point_id] = r.quality;
  }
  for (const [a, b] of [['summit', 'base'], ['summit', 'mid'], ['mid', 'base']]) {
    if (results[a] && results[b]) output.comparisons[`${a}-${b}`] = comparePoints(results[a], results[b]);
  }
  await mkdir('work/weather', {recursive: true});
  const file = `work/weather/${regionId}-${output.generated_at.replace(/[-:]/g, '').slice(0, 15)}Z.json`;
  await writeFile(file, JSON.stringify(output));
  return {output, file};
}

// Static copy for the app (dist/data/weather/<region>.json): summit / mid / base only, column arrays, real API
// values only (missing = null). Written only when EVERY requested point was received in this run: a partial / failed
// collection never replaces the previous good file (the pipeline then reports the region as a collect failure).
export function publishBlockedReason(output) {
  if (output.errors?.length) return `${output.errors.length} point(s) failed: ${output.errors.map(e => `${e.point_id} ${e.code || e.kind || ''}`.trim()).join(', ')}`;
  if (!output.snapshots?.length) return 'no point received';
  if (Number.isFinite(output.requested_points) && output.snapshots.length < output.requested_points) return 'incomplete point set';
  return null;
}
// Same service JSON without writing it (used by the 30-minute watch, which stores it in Supabase instead of dist/).
export function buildPublishedWeather(output) {
  if (publishBlockedReason(output)) return null;
  const snapshots = output.snapshots.filter(s => ['summit', 'mid', 'base'].includes(s.point_type));
  if (!snapshots.length) return null;
  const columns = (rows, timeKey, vars) => {
    const times = [...new Set(rows.map(row => row[timeKey]))].sort();
    const series = {};
    for (const s of snapshots) {
      const byTime = new Map(rows.filter(row => row.point_id === s.point_id).map(row => [row[timeKey], row]));
      series[s.point_type] = Object.fromEntries(vars.map(name => [name, times.map(time => byTime.get(time)?.[name] ?? null)]));
    }
    return {time: times, ...series};
  };
  const published = {
    schema_version: SCHEMA_VERSION, region_id: output.region_id, model: MODEL, source: 'Open-Meteo',
    fetched_at: snapshots[0].fetched_at, timezone: snapshots[0].timezone, utc_offset_seconds: snapshots[0].utc_offset_seconds,
    units: snapshots[0].units,
    points: snapshots.map(s => {
      const point = output.points.find(p => p.point_id === s.point_id);
      return {point_type: s.point_type, latitude: s.latitude, longitude: s.longitude, elevation: s.requested_elevation,
        api_elevation: s.elevation, grid_latitude: s.grid_latitude, grid_longitude: s.grid_longitude,
        derivation: point?.derivation?.name || null};
    }),
    current: Object.fromEntries(snapshots.map(s => {
      const row = output.current.find(c => c.point_id === s.point_id);
      return [s.point_type, row ? {forecast_time: row.forecast_time, ...Object.fromEntries(CURRENT_VARS.map(name => [name, row[name]]))} : null];
    })),
    hourly: columns(output.hourly, 'forecast_time', HOURLY_VARS),
    daily: columns(output.daily, 'forecast_date', DAILY_VARS)
  };
  return published;
}
export async function publishRegion(output) {
  const published = buildPublishedWeather(output);
  if (!published) return null;
  await mkdir('dist/data/weather', {recursive: true});
  const file = `dist/data/weather/${output.region_id}.json`;
  await writeFile(file, JSON.stringify(published));
  return file;
}

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--publish');
  const publish = process.argv.includes('--publish');
  const regionIds = !args.length ? ['kiroro'] : args.includes('all') ? Object.keys(primarySkiAreas) : args;
  let failed = false;
  for (const regionId of regionIds) {
    const {output, file} = await collectRegion(regionId);
    if (publish) {
      const blocked = publishBlockedReason(output);
      console.log(JSON.stringify({region: regionId, published: blocked ? null : await publishRegion(output), ...(blocked ? {publish_skipped: `${blocked}; previous file kept`} : {})}));
    }
    console.log(JSON.stringify({region: regionId, file, rows: {snapshots: output.snapshots.length, current: output.current.length,
      hourly: output.hourly.length, daily: output.daily.length}, network: output.network, skipped: output.skipped_points, errors: output.errors}));
    for (const s of output.snapshots) {
      const c = output.current.find(row => row.point_id === s.point_id);
      console.log(JSON.stringify({point: s.point_type, requested_ele: s.requested_elevation, api_ele: s.elevation,
        grid: [s.grid_latitude, s.grid_longitude], now: c && {t: c.forecast_time, temp: c.temperature_2m, rh: c.relative_humidity_2m,
          rain: c.rain, snow: c.snowfall, depth: c.snow_depth, wind: c.wind_speed_10m, gust: c.wind_gusts_10m, sw: c.shortwave_radiation},
        quality: compactQuality(output.quality[s.point_id])}));
    }
    for (const [pair, diff] of Object.entries(output.comparisons)) console.log(JSON.stringify({compare: pair, ...diff}));
    if (output.errors.length || output.skipped_points.length || !output.snapshots.length) failed = true;
  }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
