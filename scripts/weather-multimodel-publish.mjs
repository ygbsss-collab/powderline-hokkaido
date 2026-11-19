// POWDERLINE multi-model SERVICE forecast: same JSON shape as dist/data/weather/<region>.json (Best Match), written to
// dist/data/weather-multimodel/<region>.json. The Best Match file is read-only here (structure, passthrough fields).
//   blend hours : F = Σ(w_i·F_i)/Σw_i per weather-multimodel-config.json band; missing model ≠ 0
//                 min weight 0.6, except when every missing model is simply past its own forecast horizon
//                 (e.g. JMA MSM ended -> ECMWF alone in 0-72 h)
//   fallback    : whole hour from a fresh Best Match run (same moment, incl. showers) when a core value can't be blended
//   snowfall    : original model snowfall (cm) weighted; no SLR, never re-derived from precipitation - rain
//   rain        : liquid rain per liquidRain(): rain + showers only when showers are not already part of snowfall
//   wind dir    : weighted u/v vector mean; speed = weighted scalar mean
//   bias        : NOT applied (multi-model was not better than Best Match at Otaru; internal validation only)
// Usage: node scripts/weather-multimodel-publish.mjs [regionId ... | all]
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchForecast} from './weather-model-compare-kiroro.mjs';
import {loadConfig, weightsFor, countryOf, profileConfig, profileModels} from './weather-multimodel-engine.mjs';
import {writeJsonAtomic} from './snow-surface-publish.mjs';
import {primarySkiAreas} from './weather-points.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const POINTS = ['summit', 'mid', 'base'];
export const FETCH_VARS = ['temperature_2m', 'precipitation', 'rain', 'showers', 'snowfall', 'wind_speed_10m', 'wind_direction_10m', 'weather_code'];
const UNITS = {temperature_2m: '°C', precipitation: 'mm', rain: 'mm', showers: 'mm', snowfall: 'cm', wind_speed_10m: 'm/s', wind_direction_10m: '°', weather_code: 'wmo code'};
const CORE = ['temperature_2m', 'precipitation', 'rain', 'snowfall', 'wind_speed_10m'];
const NON_NEG = ['precipitation', 'rain', 'snowfall', 'wind_speed_10m'];
export const DATA_KIND = 'powderline_multimodel_service';
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
export const outPath = region => path.join(ROOT, 'dist/data/weather-multimodel', `${region}.json`);

// Liquid rain of one model hour without double counting. Open-Meteo: precipitation = rain + showers + snow water
// (snowfall cm / 0.7). Some models (GFS, Best Match) report showers that are already part of snowfall.
//   separate : P ≈ rain + showers + snow/0.7 only -> rain + showers
//   consistent: both balances hold (small showers) -> rain
//   overlap  : P ≈ rain + snow/0.7            -> rain        (showers inside snowfall)
//   ambiguous: neither balance holds           -> rain        (conservative; nothing re-derived from P)
export const RAIN_TOL_MM = 0.15;
export function liquidRain(p, rain, showers, snow) {
  if (rain == null) return {value: null, rule: 'missing'};
  if (showers == null || p == null || snow == null) return {value: rain, rule: 'rain_only_components_missing'};
  const we = snow / 0.7;
  const sep = Math.abs(p - (rain + showers + we)) <= RAIN_TOL_MM, ovl = Math.abs(p - (rain + we)) <= RAIN_TOL_MM;
  // Both balances hold (showers within tolerance): cannot tell whether showers are inside snowfall -> not added.
  if (sep && ovl) return {value: rain, rule: 'consistent'};
  if (sep) return {value: rain + showers, rule: 'separate'};
  if (ovl) return {value: rain, rule: 'overlap'};
  return {value: rain, rule: 'ambiguous'};
}

// One model at one point: values keyed by UTC ms (liquid rain per liquidRain), plus its last valid hour per variable.
async function fetchModel(id, m, point) {
  const url = new URL(`https://api.open-meteo.com/v1/${m.endpoint}`);
  url.search = new URLSearchParams({latitude: String(point.latitude), longitude: String(point.longitude), elevation: String(point.elevation),
    models: id, hourly: FETCH_VARS.join(','), forecast_days: String(m.forecast_days), past_days: id === 'best_match' ? '4' : '0',
    timezone: 'UTC', wind_speed_unit: 'ms'}).toString();
  const body = await fetchForecast(url);
  if (body.utc_offset_seconds !== 0) throw new Error(`${id}: expected UTC`);
  for (const v of FETCH_VARS) if (body.hourly_units?.[v] !== UNITS[v]) throw new Error(`${id}: unit ${v}=${body.hourly_units?.[v]}`);
  const ms = body.hourly.time.map(t => Date.parse(`${t}:00Z`));
  if (ms.some((t, i) => !Number.isFinite(t) || (i > 0 && t - ms[i - 1] !== HOUR))) throw new Error(`${id}: non-hourly axis`);
  const at = new Map();
  const last = {};
  const rainRules = {};
  ms.forEach((t, i) => {
    const g = v => num(body.hourly[v]?.[i]);
    const liquid = liquidRain(g('precipitation'), g('rain'), g('showers'), g('snowfall'));
    if (g('precipitation') > 0) rainRules[liquid.rule] = (rainRules[liquid.rule] || 0) + 1;
    const row = {temperature_2m: g('temperature_2m'), precipitation: g('precipitation'), snowfall: g('snowfall'),
      rain: liquid.value, wind_speed_10m: g('wind_speed_10m'),
      wind_direction_10m: g('wind_direction_10m'), weather_code: g('weather_code')};
    at.set(t, row);
    for (const [k, v] of Object.entries(row)) if (v != null) last[k] = t;
  });
  return {ok: true, at, last, rain_rules: rainRules, range_utc: [new Date(ms[0]).toISOString(), new Date(ms.at(-1)).toISOString()],
    response_coordinate: {latitude: body.latitude, longitude: body.longitude, elevation_m: body.elevation}};
}

// Reuse the already collected Best Match file instead of issuing the same per-point API request again.
// The collector and this publisher share the exact UTC/local time axis; missing values remain missing.
export function bestMatchRunFromPublished(bm, pointType) {
  const series = bm.hourly?.[pointType];
  const point = bm.points?.find(value => value.point_type === pointType);
  if (!series || !Array.isArray(bm.hourly?.time) || !point) throw new Error(`published Best Match ${pointType} missing`);
  const at = new Map(), last = {};
  const times = bm.hourly.time.map(value => Date.parse(value));
  if (times.some((value, index) => !Number.isFinite(value) || (index && value - times[index - 1] !== HOUR))) {
    throw new Error(`published Best Match ${pointType}: non-hourly axis`);
  }
  times.forEach((time, index) => {
    const row = Object.fromEntries([...CORE, 'wind_direction_10m', 'weather_code'].map(variable =>
      [variable, num(series[variable]?.[index])]));
    at.set(time, row);
    for (const [variable, value] of Object.entries(row)) if (value != null) last[variable] = time;
  });
  return {ok: true, at, last, rain_rules: {published_best_match_file: times.length},
    range_utc: [new Date(times[0]).toISOString(), new Date(times.at(-1)).toISOString()],
    response_coordinate: {latitude: point.grid_latitude, longitude: point.grid_longitude, elevation_m: point.api_elevation},
    reused_published_file: true};
}

// Weighted value of one variable at t. Horizon exception: missing models that are only past their own last valid hour.
export function blendAt(weights, runs, variable, t, minWeight) {
  const avail = [], missing = [];
  for (const [id, w] of Object.entries(weights)) {
    const v = runs[id]?.ok ? num(runs[id].at.get(t)?.[variable]) : null;
    (v != null ? avail : missing).push({id, w, v});
  }
  if (!avail.length) return {value: null, reason: `no model value (${missing.map(m => m.id).join(',')})`};
  const wsum = avail.reduce((s, a) => s + a.w, 0);
  const horizonOnly = missing.length > 0 && missing.every(m => runs[m.id]?.ok && Number.isFinite(runs[m.id].last[variable]) && t > runs[m.id].last[variable]);
  if (missing.length && !horizonOnly && wsum < minWeight - 1e-9) return {value: null, reason: `weight ${r2(wsum)} < ${minWeight} (${missing.map(m => m.id).join(',')} missing)`};
  return {value: avail.reduce((s, a) => s + a.w * a.v, 0) / wsum, used: Object.fromEntries(avail.map(a => [a.id, Math.round(a.w / wsum * 1000) / 1000])),
    horizon_switch: horizonOnly ? missing.map(m => m.id) : null};
}

// Wind direction: weighted vector mean of (speed, direction) pairs; null when no pair or calm.
export function blendDirection(weights, runs, t) {
  let u = 0, v = 0, n = 0;
  for (const [id, w] of Object.entries(weights)) {
    const row = runs[id]?.ok ? runs[id].at.get(t) : null;
    const s = num(row?.wind_speed_10m), d = num(row?.wind_direction_10m);
    if (s == null || d == null) continue;
    const rad = d * Math.PI / 180;
    u += w * -s * Math.sin(rad); v += w * -s * Math.cos(rad); n++;
  }
  if (!n || Math.hypot(u, v) < 1e-6) return null;
  return Math.round(((Math.atan2(-u, -v) * 180 / Math.PI) + 360) % 360);
}

// Weather code of the highest-weight model that has one at t (codes are categories: never averaged).
function codeAt(weights, runs, t) {
  for (const [id] of Object.entries(weights).sort((a, b) => b[1] - a[1])) {
    const c = runs[id]?.ok ? num(runs[id].at.get(t)?.weather_code) : null;
    if (c != null) return {code: c, from: id};
  }
  return {code: null, from: null};
}

export function buildPoint(cfg, runs, bm, p, anchorMs) {
  const times = bm.hourly.time;
  const out = Object.fromEntries(Object.keys(bm.hourly[p]).map(k => [k, []]));
  const meta = {source: [], weights: [], reason: []};
  const bmFile = bm.hourly[p];
  const minW = cfg.missing_model_policy.min_available_weight;
  times.forEach((iso, i) => {
    const t = Date.parse(iso);
    const lead = Math.round((t - anchorMs) / HOUR);
    const band = lead >= 1 ? weightsFor(cfg, lead) : null; // {band, weights, transition}
    let row = null, source, weights = null, reason = null;
    if (band) {
      const vals = {}, fails = [];
      let used = null, switched = null;
      for (const v of CORE) {
        const b = blendAt(band.weights, runs, v, t, minW);
        if (b.value == null) fails.push(`${v}: ${b.reason}`);
        else { vals[v] = NON_NEG.includes(v) ? Math.max(0, b.value) : b.value; if (v === 'temperature_2m') { used = b.used; switched = b.horizon_switch; } }
      }
      if (!fails.length) {
        const c = codeAt(band.weights, runs, t);
        row = {...vals, wind_direction_10m: blendDirection(band.weights, runs, t), weather_code: c.code};
        source = band.band; weights = used;
        if (band.transition) reason = `transition ${band.transition.id} a=${band.transition.a}`;
        if (switched) reason = `horizon switch: ${switched.join(',')} ended`;
      } else reason = `fallback: ${fails.join('; ')}`;
    } else reason = lead < 1 ? 'past hour: Best Match' : 'beyond 384 h: Best Match';
    if (!row) {
      const f = runs.best_match?.ok ? runs.best_match.at.get(t) : null;
      if (f && CORE.every(v => num(f[v]) != null)) { row = {...f}; source = 'best_match'; weights = {best_match: 1}; }
      else {
        // Last resort: the published Best Match file of the same collection (rain there excludes showers).
        row = Object.fromEntries([...CORE, 'wind_direction_10m', 'weather_code'].map(v => [v, num(bmFile[v]?.[i])]));
        source = CORE.every(v => row[v] != null) ? 'best_match_file' : 'missing';
        weights = source === 'missing' ? null : {best_match: 1};
        reason = `${reason ? reason + '; ' : ''}${source === 'missing' ? 'no value in any source' : 'fresh Best Match missing: published Best Match file (rain without showers)'}`;
      }
    }
    for (const k of Object.keys(out)) {
      const v = k in row ? row[k] : num(bmFile[k]?.[i]); // humidity, snow depth, gusts, radiation: Best Match passthrough
      out[k].push(v == null ? null : k === 'weather_code' || k === 'wind_direction_10m' ? v : r2(v));
    }
    meta.source.push(source); meta.weights.push(weights); meta.reason.push(reason);
  });
  return {series: out, meta};
}

// Daily values from the published hourly series over the same local 24 h (00:00 … 23:00); null unless all 24 exist.
export function buildDaily(bm, hourly) {
  const daily = {time: bm.daily.time};
  for (const p of POINTS) {
    const s = hourly[p], d = {};
    const idx = date => hourly.time.map((t, i) => (t.startsWith(date) ? i : -1)).filter(i => i >= 0);
    const agg = (date, k, fn) => { const ii = idx(date); const v = ii.map(i => s[k][i]); return ii.length === 24 && v.every(x => x != null) ? fn(v) : null; };
    const sum = v => r2(v.reduce((a, b) => a + b, 0));
    d.temperature_2m_max = daily.time.map(dt => agg(dt, 'temperature_2m', v => Math.max(...v)));
    d.temperature_2m_min = daily.time.map(dt => agg(dt, 'temperature_2m', v => Math.min(...v)));
    d.precipitation_sum = daily.time.map(dt => agg(dt, 'precipitation', sum));
    d.rain_sum = daily.time.map(dt => agg(dt, 'rain', sum));
    d.snowfall_sum = daily.time.map(dt => agg(dt, 'snowfall', sum));
    d.wind_speed_10m_max = daily.time.map(dt => agg(dt, 'wind_speed_10m', v => Math.max(...v)));
    d.weather_code = daily.time.map(dt => agg(dt, 'weather_code', v => Math.max(...v)));
    for (const k of Object.keys(bm.daily[p] || {})) if (!(k in d)) d[k] = bm.daily[p][k]; // gusts / radiation: Best Match
    daily[p] = d;
  }
  return daily;
}

export function validateService(mm, bm) {
  const issues = [];
  if (mm.data_kind !== DATA_KIND || mm.region_id !== bm.region_id) issues.push('kind/region');
  if (JSON.stringify(mm.hourly.time) !== JSON.stringify(bm.hourly.time)) issues.push('hourly.time differs from Best Match axis');
  if (JSON.stringify(mm.daily.time) !== JSON.stringify(bm.daily.time)) issues.push('daily.time differs');
  for (const k of ['schema_version', 'timezone', 'utc_offset_seconds', 'units', 'points', 'current', 'hourly', 'daily', 'fetched_at']) if (!(k in mm)) issues.push(`missing ${k}`);
  for (const p of POINTS) {
    const h = mm.hourly[p];
    if (!h) { issues.push(`hourly.${p} missing`); continue; }
    for (const k of Object.keys(bm.hourly[p])) if (!Array.isArray(h[k]) || h[k].length !== mm.hourly.time.length) issues.push(`${p}.${k} length`);
    for (const k of NON_NEG) if (h[k].some(v => v != null && v < 0)) issues.push(`${p}.${k} negative`);
    const contra = h.rain.filter((r, i) => r != null && h.precipitation[i] != null && r > h.precipitation[i] + 0.05).length;
    if (contra) issues.push(`${p}: rain > precipitation in ${contra} h`);
    if (mm.multimodel.hourly_source[p].includes('missing')) issues.push(`${p}: hours without any value`);
    // weights actually applied must sum to 1 in every hour (mixed new/previous runs, fallbacks, transitions)
    const badW = mm.multimodel.hourly_weights[p].filter(w => !w || Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) > 0.002).length;
    if (badW) issues.push(`${p}: weights do not sum to 1 in ${badW} h`);
    if (!mm.current[p]) issues.push(`current.${p} missing`);
    // daily = hourly sums over the same local day
    mm.daily.time.forEach((date, di) => {
      const ii = mm.hourly.time.map((t, i) => (t.startsWith(date) ? i : -1)).filter(i => i >= 0);
      const s = mm.daily[p].snowfall_sum[di];
      if (s != null && Math.abs(s - r2(ii.reduce((a, i) => a + h.snowfall[i], 0))) > 0.011) issues.push(`${p} ${date}: daily snow != hourly sum`);
    });
  }
  return issues;
}

// What a transition window changes (recorded, not an accuracy claim): the step a hard switch would produce between
// the last "from" hour and the first "to" hour (raw model values), vs the largest hourly step of the published series
// across the window. Precipitation / snowfall are compared the same way and must stay >= 0.
export function transitionLog(cfg, runs, series, times, anchorMs) {
  const out = [];
  const leadIdx = new Map(times.map((t, i) => [Math.round((Date.parse(t) - anchorMs) / HOUR), i]));
  for (const tr of cfg.transitions || []) {
    const from = cfg.bands.find(b => b.id === tr.from_band), to = cfg.bands.find(b => b.id === tr.to_band);
    const fromId = Object.entries(from.weights).sort((a, b) => b[1] - a[1])[0][0], toId = Object.entries(to.weights).sort((a, b) => b[1] - a[1])[0][0];
    const iLast = leadIdx.get(from.lead_h[1]), iFirst = leadIdx.get(to.lead_h[0]);
    const vars = {};
    for (const v of ['temperature_2m', 'wind_speed_10m', 'precipitation', 'snowfall', 'rain']) {
      const raw = (id, i) => (i == null ? null : num(runs[id]?.ok ? runs[id].at.get(Date.parse(times[i]))?.[v] : null));
      const a = raw(fromId, iLast), b = raw(toId, iFirst);
      let maxStep = null, negatives = 0;
      for (let L = tr.start_lead_h - 1; L <= tr.end_lead_h + 1; L++) {
        const i = leadIdx.get(L), j = leadIdx.get(L + 1);
        if (i == null || j == null) continue;
        if (series[v][j] != null && series[v][j] < 0) negatives++;
        if (series[v][i] == null || series[v][j] == null) continue;
        const step = Math.abs(series[v][j] - series[v][i]);
        maxStep = maxStep == null ? step : Math.max(maxStep, step);
      }
      vars[v] = {hard_switch_step: a == null || b == null ? null : r2(b - a), published_step_at_boundary: iLast != null && iFirst != null && series[v][iLast] != null && series[v][iFirst] != null ? r2(series[v][iFirst] - series[v][iLast]) : null,
        max_abs_hourly_step_in_window: r2(maxStep), negative_values: negatives};
    }
    out.push({id: tr.id, window_lead_h: [tr.start_lead_h, tr.end_lead_h], from_model: fromId, to_model: toId, boundary_lead_h: [from.lead_h[1], to.lead_h[0]], variables: vars,
      note: 'Smoothing of the model switch only; not an accuracy improvement.'});
  }
  return out;
}

// Altitude points that a model serves from the SAME grid cell (identical response coordinate): their precipitation /
// snowfall come from one cell and differ only by the provider's elevation adjustment. Recorded, never inferred.
export function sharedGrid(sources, bm) {
  const out = {};
  const group = coords => {
    const groups = [];
    POINTS.forEach(p => { const c = coords[p]; if (!c) return; const g = groups.find(x => x.lat === c.latitude && x.lng === c.longitude); g ? g.points.push(p) : groups.push({lat: c.latitude, lng: c.longitude, points: [p]}); });
    return groups.filter(g => g.points.length > 1).map(g => ({points: g.points, latitude: g.lat, longitude: g.lng}));
  };
  for (const id of Object.keys(sources.summit || {})) out[id] = group(Object.fromEntries(POINTS.map(p => [p, sources[p]?.[id]?.ok ? sources[p][id].response_coordinate : null])));
  out.best_match_file = group(Object.fromEntries(POINTS.map(p => { const x = bm.points.find(q => q.point_type === p); return [p, x?.grid_latitude != null ? {latitude: x.grid_latitude, longitude: x.grid_longitude} : null]; })));
  return out;
}

// ---- Model run identification (Open-Meteo /data/<model>/static/meta.json) ----
// The forecast API does not say which run it served. The meta endpoint gives the latest run's initialisation /
// availability time. It is read before AND after the data requests: equal -> the data belongs to that run; different
// -> a new run landed during the fetch (run_changed_during_fetch, run id not claimed). best_match is a composite of
// several models: no single run exists, nothing is invented.
export const META_MODELS = {jma_msm: ['jma_msm'], ecmwf_ifs025: ['ecmwf_ifs025'], gfs_seamless: ['ncep_gfs013', 'ncep_gfs025'], best_match: []};
export async function fetchRunMeta(name, fetchImpl = fetch) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchImpl(`https://api.open-meteo.com/data/${name}/static/meta.json`, {signal: AbortSignal.timeout(15000)});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const iso = s => (Number.isFinite(s) ? new Date(s * 1000).toISOString() : null);
      return {ok: true, initialisation_utc: iso(j.last_run_initialisation_time), availability_utc: iso(j.last_run_availability_time),
        modification_utc: iso(j.last_run_modification_time), update_interval_h: Number.isFinite(j.update_interval_seconds) ? j.update_interval_seconds / 3600 : null};
    } catch (e) { if (attempt === 2) return {ok: false, error: String(e.message).slice(0, 120)}; }
  }
}
export async function modelRunInfo(metaFn, ids = Object.keys(META_MODELS)) {
  const out = {};
  for (const [id, names] of Object.entries(META_MODELS).filter(([id]) => ids.includes(id))) {
    if (!names.length) { out[id] = {identifiable: false, reason: 'composite model: no single run (not invented)'}; continue; }
    out[id] = {identifiable: true, components: Object.fromEntries(await Promise.all(names.map(async n => [n, await metaFn(n)])))};
  }
  return out;
}
// Combine before/after meta into what this file may claim for each model.
export function runClaims(before, after) {
  const out = {};
  for (const [id, b] of Object.entries(before)) {
    if (!b.identifiable) { out[id] = {run_initialisation_utc: null, status: 'not_identifiable', reason: b.reason}; continue; }
    const comps = {};
    let status = 'identified';
    for (const [n, m] of Object.entries(b.components)) {
      const a = after?.[id]?.components?.[n];
      if (!m.ok || !a?.ok) { status = 'meta_unavailable'; comps[n] = {initialisation_utc: null, reason: m.error || a?.error || 'meta missing'}; continue; }
      if (m.initialisation_utc !== a.initialisation_utc) { status = status === 'identified' ? 'run_changed_during_fetch' : status; comps[n] = {initialisation_utc: null, before: m.initialisation_utc, after: a.initialisation_utc}; continue; }
      comps[n] = {initialisation_utc: m.initialisation_utc, availability_utc: m.availability_utc, update_interval_h: m.update_interval_h};
    }
    const inits = Object.values(comps).map(c => c.initialisation_utc).filter(Boolean).sort();
    out[id] = {status, run_initialisation_utc: status === 'identified' ? inits.at(-1) : null, components: comps};
  }
  return out;
}
// A run that is OLDER than the one already published for this model (stale server / late arrival) is not used.
export function regressedModels(claims, previous) {
  const bad = {};
  for (const [id, c] of Object.entries(claims)) {
    for (const [n, comp] of Object.entries(c.components || {})) {
      const prev = previous?.[id]?.components?.[n]?.initialisation_utc;
      if (comp.initialisation_utc && prev && Date.parse(comp.initialisation_utc) < Date.parse(prev)) bad[id] = `run ${comp.initialisation_utc} older than published ${prev} (${n})`;
    }
  }
  return bad;
}

// bm / bmBuf: test injection of the Best Match file (default: dist/data/weather/<region>.json).
export async function publishRegion(region, {now = Date.now(), fetchFn = fetchModel, metaFn = fetchRunMeta, previous = undefined, bm: bmIn = null, bmBuf: bmBufIn = null} = {}) {
  const cfgAll = loadConfig();
  const bmPath = path.join(ROOT, 'dist/data/weather', `${region}.json`);
  const bmBuf = bmBufIn || (bmIn ? Buffer.from(JSON.stringify(bmIn)) : readFileSync(bmPath));
  const bm = bmIn || JSON.parse(bmBuf);
  // Country policy (JP: JMA MSM + ECMWF; KR: Best Match first, no KMA). Undetermined -> no multi-model file.
  const ref = bm.points?.find(x => x.point_type === 'summit') || bm.points?.[0];
  const country = countryOf(cfgAll, region, Number(ref?.latitude), Number(ref?.longitude));
  if (!country) throw new Error(`country not determined for ${region} (${ref?.latitude}, ${ref?.longitude}): no multi-model policy`);
  const cfg = profileConfig(cfgAll, country);
  const models = profileModels(cfg);
  if (bm.region_id !== region) throw new Error('Best Match region mismatch');
  // Previously published multi-model file (run ids for the regression guard and for "no new run" detection).
  if (previous === undefined) { try { previous = JSON.parse(readFileSync(outPath(region), 'utf8')); } catch { previous = null; } }
  const prevRuns = previous?.multimodel?.model_runs || null;
  const metaBefore = await modelRunInfo(metaFn, Object.keys(models));
  const anchorMs = Math.floor(now / HOUR) * HOUR;
  const hourly = {time: bm.hourly.time};
  const sources = {}, hourlySource = {}, hourlyWeights = {}, hourlyReason = {}, bandUse = {}, transitions = {};
  const fetched = {};
  for (const p of POINTS) {
    const meta = bm.points.find(x => x.point_type === p);
    if (!meta) throw new Error(`point ${p} missing in Best Match file`);
    const point = {latitude: meta.latitude, longitude: meta.longitude, elevation: meta.elevation};
    const runs = {};
    for (const [id, m] of Object.entries(models)) {
      try {
        runs[id] = id === 'best_match' ? bestMatchRunFromPublished(bm, p) : await fetchFn(id, m, point);
      } catch (e) { runs[id] = {ok: false, error: String(e.message).slice(0, 200)}; }
    }
    fetched[p] = runs;
  }
  const modelRuns = runClaims(metaBefore, await modelRunInfo(metaFn, Object.keys(models)));
  const regressed = regressedModels(modelRuns, prevRuns);
  for (const p of POINTS) {
    const runs = fetched[p];
    for (const [id, why] of Object.entries(regressed)) runs[id] = {ok: false, error: `excluded: ${why}`};
    sources[p] = Object.fromEntries(Object.entries(runs).map(([id, r]) => [id, r.ok ? {ok: true, range_utc: r.range_utc, response_coordinate: r.response_coordinate, rain_rule_hours: r.rain_rules,
      reused_published_file: r.reused_published_file === true} : {ok: false, error: r.error}]));
    const {series, meta: m} = buildPoint(cfg, runs, bm, p, anchorMs);
    hourly[p] = series; hourlySource[p] = m.source; hourlyWeights[p] = m.weights; hourlyReason[p] = m.reason;
    transitions[p] = transitionLog(cfg, runs, series, bm.hourly.time, anchorMs);
    bandUse[p] = m.source.reduce((acc, s) => ({...acc, [s]: (acc[s] || 0) + 1}), {});
  }
  // current: Best Match "now" timestamps, values from the multi-model hour in progress (same slot the home card uses).
  const current = {};
  for (const p of POINTS) {
    const c = bm.current?.[p];
    if (!c) { current[p] = null; continue; }
    const slot = Math.ceil(Date.parse(c.forecast_time) / HOUR) * HOUR;
    const i = hourly.time.findIndex(t => Date.parse(t) === slot);
    current[p] = {...c};
    if (i >= 0) for (const k of ['temperature_2m', 'precipitation', 'rain', 'snowfall', 'wind_speed_10m', 'wind_direction_10m', 'weather_code']) current[p][k] = hourly[p][k][i];
    current[p].basis = i >= 0 ? `multimodel hourly slot ${hourly.time[i]} (${hourlySource[p][i]})` : 'Best Match current (slot not found)';
  }
  const mm = {
    schema_version: bm.schema_version, region_id: region, model: 'powderline_multimodel', source: 'POWDERLINE multi-model (Open-Meteo: JMA MSM, ECMWF IFS, GFS, Best Match)',
    data_kind: DATA_KIND, fetched_at: new Date(now).toISOString(), timezone: bm.timezone, utc_offset_seconds: bm.utc_offset_seconds,
    units: bm.units, points: bm.points, current, hourly, daily: buildDaily(bm, hourly),
    multimodel: {
      country, country_label: cfgAll.country_profiles[country].label, models_used: Object.keys(models),
      config_id: cfg.config_id, anchor_utc: new Date(anchorMs).toISOString(), bands: cfg.bands, min_available_weight: cfg.missing_model_policy.min_available_weight,
      policy: 'Operational choice: multi-model is the primary service forecast. Accuracy vs Best Match is NOT proven (Otaru temperature MAE 1.10 vs 0.78 °C). Bias correction not applied.',
      definitions: {snowfall: 'original model snowfall (cm), weighted; no SLR; not derived from precipitation', rain: 'liquid rain per model hour: rain + showers only when P = rain + showers + snow/0.7 holds and P = rain + snow/0.7 does not; rain only when showers overlap snowfall, both balances hold (indistinguishable) or neither holds (counts in model_sources.*.rain_rule_hours); fallback from the published Best Match file: rain only',
        precipitation: 'total precipitation (mm), weighted', wind_direction: 'weighted u/v vector mean', weather_code: 'code of the highest-weight model with a value (not averaged)',
        passthrough_best_match: ['relative_humidity_2m', 'apparent_temperature', 'snow_depth', 'wind_gusts_10m', 'shortwave_radiation']},
      best_match_source: {path: path.relative(ROOT, bmPath).replace(/\\/g, '/'), sha256: sha256(bmBuf), fetched_at: bm.fetched_at},
      model_runs: modelRuns, models_excluded_as_older_run: regressed,
      run_note: 'Open-Meteo meta.json read before and after the data requests; fetched_at is the collection time, not a model run time.',
      model_sources: sources, shared_model_grid: sharedGrid(sources, bm), transitions: cfg.transitions || [], transition_log: transitions, hourly_source: hourlySource, hourly_weights: hourlyWeights, hourly_reason: hourlyReason, source_hours: bandUse
    }
  };
  const issues = validateService(mm, bm);
  mm.multimodel.validation = {ok: issues.length === 0, issues, validated_at_utc: new Date().toISOString()};
  return {mm, issues, bm};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const all = Object.keys(primarySkiAreas);
  const regions = !args.length || args.includes('all') ? all : args;
  for (const region of regions) {
    try {
      const {mm, issues} = await publishRegion(region);
      if (issues.length) { console.log(JSON.stringify({region, published: false, issues})); process.exitCode = 1; continue; }
      writeJsonAtomic(outPath(region), mm, {compact: true});
      console.log(JSON.stringify({region, published: path.relative(ROOT, outPath(region)), source_hours: mm.multimodel.source_hours.summit}));
    } catch (e) {
      console.log(JSON.stringify({region, published: false, error: String(e.message).slice(0, 300)}));
      process.exitCode = 1;
    }
  }
}
