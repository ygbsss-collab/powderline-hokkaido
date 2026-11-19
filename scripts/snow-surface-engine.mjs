// POWDERLINE Snow Surface Engine — experimental v0.1 (model-based estimate, NOT an observed surface or avalanche assessment).
// Reads (read-only): dist/data/weather/<region>.json (Open-Meteo hourly incl. past days)
//                    work/weather/<region>-observation-model-aligned.json (JMA reference + cross-check)
// Writes: work/weather/<region>-snow-surface.json
// Usage: node scripts/snow-surface-engine.mjs [region=kiroro]
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const POINTS = ['summit', 'mid', 'base'];
const FIELDS = ['temperature_2m', 'precipitation', 'rain', 'snowfall', 'snow_depth', 'wind_speed_10m', 'wind_gusts_10m'];

export const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// Hourly series of one point -> [{t (ms UTC, end of preceding hour), iso, v: {field: number|null}}], strictly ascending, deduped.
export function pointSeries(model, point) {
  const h = model.hourly, p = h?.[point];
  if (!p || !Array.isArray(h.time)) return null;
  const seen = new Map();
  h.time.forEach((iso, i) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || seen.has(t)) return;
    seen.set(t, {t, iso: new Date(t).toISOString(), source_time: iso, v: Object.fromEntries(FIELDS.map(f => [f, num(p[f]?.[i])]))});
  });
  return [...seen.values()].sort((a, b) => a.t - b.t);
}

// Last `hours` hourly slots ending at anchorMs (inclusive). Missing timestamps become explicit null rows (never shifted).
export function windowRows(series, anchorMs, hours) {
  const byT = new Map(series.map(r => [r.t, r]));
  return Array.from({length: hours}, (_, k) => {
    const t = anchorMs - (hours - 1 - k) * HOUR;
    return byT.get(t) || {t, iso: new Date(t).toISOString(), v: Object.fromEntries(FIELDS.map(f => [f, null])), missing_row: true};
  });
}

const coverage = (rows, f) => rows.filter(r => r.v[f] != null).length / rows.length;
// Sum only when coverage is sufficient; otherwise null (insufficient != 0).
function sumOrNull(rows, f, minCov) {
  const c = coverage(rows, f);
  return {value: c >= minCov ? round(rows.reduce((a, r) => a + (r.v[f] ?? 0), 0), 2) : null, coverage: round(c, 3)};
}

function windowMetrics(rows, cfg) {
  const m = cfg.min_coverage_ratio;
  const temps = rows.map(r => r.v.temperature_2m).filter(v => v != null);
  const tCov = coverage(rows, 'temperature_2m'), wCov = coverage(rows, 'wind_speed_10m');
  const first = rows.find(r => r.v.temperature_2m != null), last = [...rows].reverse().find(r => r.v.temperature_2m != null);
  let run = 0, maxRun = 0, strong = 0;
  for (const r of rows) {
    const w = r.v.wind_speed_10m;
    if (w != null && w >= cfg.wind_affected.strong_wind_ms) { strong++; run++; maxRun = Math.max(maxRun, run); } else run = 0;
  }
  return {
    hours: rows.length,
    first_hour_utc: rows[0].iso, last_hour_utc: rows.at(-1).iso,
    new_snow_cm: sumOrNull(rows, 'snowfall', m),
    rain_mm: sumOrNull(rows, 'rain', m),
    precipitation_mm: sumOrNull(rows, 'precipitation', m),
    temperature_c: tCov >= m ? {
      min: Math.min(...temps), max: Math.max(...temps),
      start: first.v.temperature_2m, end: last.v.temperature_2m,
      change: round(last.v.temperature_2m - first.v.temperature_2m, 1),
      hours_above_0: rows.filter(r => r.v.temperature_2m != null && r.v.temperature_2m > 0).length,
      coverage: round(tCov, 3)
    } : {min: null, max: null, start: null, end: null, change: null, hours_above_0: null, coverage: round(tCov, 3)},
    strong_wind: wCov >= m ? {threshold_ms: cfg.wind_affected.strong_wind_ms, hours: strong, max_consecutive_hours: maxRun,
      max_wind_ms: Math.max(...rows.map(r => r.v.wind_speed_10m ?? -Infinity)), coverage: round(wCov, 3)}
      : {threshold_ms: cfg.wind_affected.strong_wind_ms, hours: null, max_consecutive_hours: null, max_wind_ms: null, coverage: round(wCov, 3)}
  };
}

// Melt-freeze episodes in strict time order: a run of hours >= melt_temp, then the FIRST later hour <= refreeze_temp.
export function meltFreezeEpisodes(rows, mf, minDepth = 0) {
  const out = [];
  const pack = r => !mf.require_snowpack || (r.v.snow_depth ?? 0) >= minDepth;
  let meltStart = null, meltHours = 0, lastMelt = null;
  for (const r of rows) {
    const T = r.v.temperature_2m;
    if (T == null) continue;
    if (T >= mf.melt_temp_c) { if (meltStart == null) meltStart = r; meltHours++; lastMelt = r; continue; }
    if (meltStart && T <= mf.refreeze_temp_c) {
      out.push({melt_start_utc: meltStart.iso, melt_end_utc: lastMelt.iso, melt_hours: meltHours, refreeze_utc: r.iso,
        refreeze_temp_c: T, snow_depth_at_refreeze_m: r.v.snow_depth, qualifies: meltHours >= mf.min_melt_hours && pack(r),
        ...(pack(r) ? {} : {note: 'no_modelled_snowpack_at_refreeze'})});
      meltStart = null; meltHours = 0; lastMelt = null;
    }
  }
  if (meltStart) out.push({melt_start_utc: meltStart.iso, melt_end_utc: lastMelt.iso, melt_hours: meltHours, refreeze_utc: null, refreeze_temp_c: null, qualifies: false, note: 'no_refreeze_yet'});
  return out;
}

const snowAfter = (rows, iso) => round(rows.filter(r => r.t > Date.parse(iso)).reduce((a, r) => a + (r.v.snowfall ?? 0), 0), 2);

export function classifyPoint(rows72, cfg) {
  const byH = Object.fromEntries(cfg.window_hours.map(h => [h, rows72.slice(rows72.length - h)]));
  const metrics = Object.fromEntries(cfg.window_hours.map(h => [`${h}h`, windowMetrics(byH[h], cfg)]));
  const need = ['temperature_2m', 'rain', 'snowfall', 'wind_speed_10m'];
  const cov = Object.fromEntries(need.map(f => [f, round(coverage(rows72, f), 3)]));
  const sufficient = need.every(f => cov[f] >= cfg.min_coverage_ratio);
  const sufficiency = {sufficient, min_coverage_ratio: cfg.min_coverage_ratio, coverage_72h: cov,
    missing_hours_72h: rows72.filter(r => r.missing_row).length};
  const minDepth = cfg.snowpack.min_depth_m;
  const depthCov = coverage(rows72, 'snow_depth');
  const depthNow = rows72.at(-1).v.snow_depth;
  // Model snow depth is a model estimate, never an observed snow depth.
  sufficiency.model_snow_depth = {basis: 'open_meteo_model_snow_depth_not_observed', coverage_72h: round(depthCov, 3), at_window_end_m: depthNow,
    min_depth_m: minDepth, min_depth_for_state_m: cfg.snowpack.min_depth_for_state_m};
  if (!sufficient) return {primary_state: null, modifiers: [], reason: 'insufficient_input_data', data_sufficiency: sufficiency, metrics, rules: []};
  if (depthCov < cfg.min_coverage_ratio || depthNow == null) return {primary_state: null, modifiers: [], reason: 'insufficient_snow_depth_data', data_sufficiency: sufficiency, metrics, rules: []};

  const rules = [];
  const triggered = {};
  const extra = [];
  // Rain-on-Snow: rain hours while snowpack is present.
  const ros = cfg.rain_on_snow;
  const rainRows = byH[ros.window_h].filter(r => (r.v.rain ?? 0) >= ros.min_rain_hour_mm);
  const rosRows = rainRows.filter(r => !ros.require_snowpack || (r.v.snow_depth ?? 0) >= minDepth);
  const rosMm = round(rosRows.reduce((a, r) => a + r.v.rain, 0), 2);
  const rainMm = round(rainRows.reduce((a, r) => a + r.v.rain, 0), 2);
  const rosHit = rosMm >= ros.min_rain_mm;
  rules.push({state: 'rain_on_snow', met: rosHit, condition: `sum(rain where rain>=${ros.min_rain_hour_mm}mm & snow_depth>=${minDepth}m, ${ros.window_h}h) >= ${ros.min_rain_mm}mm`,
    observed: {rain_on_snowpack_mm: rosMm, rain_total_mm: rainMm, rain_hours_on_snowpack: rosRows.length, last_rain_on_snowpack_utc: rosRows.at(-1)?.iso ?? null}});
  if (rosHit) {
    // Crust forms on the first refreeze AFTER the last rain-on-snowpack hour; burial is counted only after that refreeze.
    const lastRain = rosRows.at(-1);
    const refreeze = rows72.find(r => r.t > lastRain.t && r.v.temperature_2m != null && r.v.temperature_2m <= cfg.melt_freeze.refreeze_temp_c);
    triggered.rain_on_snow = {last_rain_utc: lastRain.iso, refreeze_utc: refreeze?.iso ?? null, refrozen: Boolean(refreeze), event_utc: (refreeze || lastRain).iso};
  }
  else if (rainMm >= ros.min_rain_mm) extra.push('rain_without_snowpack');
  // Melt-Freeze
  const eps = meltFreezeEpisodes(byH[cfg.melt_freeze.window_h], cfg.melt_freeze, minDepth);
  const lastEp = eps.at(-1);
  if (lastEp && lastEp.refreeze_utc == null && lastEp.melt_hours >= cfg.melt_freeze.min_melt_hours) extra.push('melting_unrefrozen_at_window_end');
  const q = eps.filter(e => e.qualifies);
  rules.push({state: 'melt_freeze', met: q.length > 0, condition: `>=${cfg.melt_freeze.min_melt_hours}h at T>=${cfg.melt_freeze.melt_temp_c}C followed later by T<=${cfg.melt_freeze.refreeze_temp_c}C (${cfg.melt_freeze.window_h}h)`,
    observed: {episodes: eps}});
  if (q.length) triggered.melt_freeze = {event_utc: q.at(-1).refreeze_utc};
  // Fresh Powder
  const fp = cfg.fresh_powder, m24 = metrics[`${fp.window_h}h`];
  const fpHit = m24.new_snow_cm.value >= fp.min_new_snow_cm && m24.temperature_c.max <= fp.max_temp_c;
  rules.push({state: 'fresh_powder', met: fpHit, condition: `new_snow(${fp.window_h}h) >= ${fp.min_new_snow_cm}cm & Tmax(${fp.window_h}h) <= ${fp.max_temp_c}C`,
    observed: {new_snow_cm: m24.new_snow_cm.value, tmax_c: m24.temperature_c.max}});
  if (fpHit) triggered.fresh_powder = {};
  // Wind Affected
  const wa = cfg.wind_affected, mw = metrics[`${wa.window_h}h`], s48 = metrics['48h'].new_snow_cm.value;
  const waHit = mw.strong_wind.hours >= wa.min_strong_wind_hours && s48 >= wa.min_transportable_snow_48h_cm;
  rules.push({state: 'wind_affected', met: waHit, condition: `hours(wind>=${wa.strong_wind_ms}m/s, ${wa.window_h}h) >= ${wa.min_strong_wind_hours} & new_snow(48h) >= ${wa.min_transportable_snow_48h_cm}cm`,
    observed: {strong_wind_hours: mw.strong_wind.hours, max_consecutive_hours: mw.strong_wind.max_consecutive_hours, new_snow_48h_cm: s48}});
  if (waHit) triggered.wind_affected = {};

  // Crust events (ROS / MF) covered by enough later snow are demoted to "buried_*" modifiers.
  // A crust can only be buried once it has refrozen (ROS without refreeze stays as wet rain-on-snow).
  const modifiers = [];
  const buried = {};
  for (const k of ['rain_on_snow', 'melt_freeze']) {
    if (!triggered[k]) continue;
    const after = snowAfter(rows72, triggered[k].event_utc);
    triggered[k].new_snow_after_cm = after;
    const canBury = k !== 'rain_on_snow' || triggered[k].refrozen;
    if (canBury && after >= cfg.buried_by_new_snow_cm) { modifiers.push(`buried_${k}`); buried[k] = triggered[k]; delete triggered[k]; }
  }
  // Model snowpack gate: rules and history stay in the result, but no state is confirmed on a missing/very shallow model snowpack.
  const hits = rules.filter(r => r.met).map(r => r.state);
  const events = {...triggered, ...Object.fromEntries(Object.entries(buried).map(([k, v]) => [`buried_${k}`, v]))};
  if (depthNow < minDepth || depthNow < cfg.snowpack.min_depth_for_state_m) {
    const none = depthNow < minDepth;
    rules.push({state: 'snowpack_gate', met: false, condition: `model snow_depth at window end >= ${cfg.snowpack.min_depth_for_state_m}m`, observed: {model_snow_depth_m: depthNow}});
    return {primary_state: null, modifiers: [none ? 'no_modelled_snowpack' : 'shallow_modelled_snowpack', ...modifiers, ...extra],
      reason: none ? 'no_modelled_snowpack_at_window_end' : 'modelled_snowpack_too_shallow_for_state',
      unconfirmed_rule_hits: hits, data_sufficiency: sufficiency, metrics, rules, events};
  }
  const primary = cfg.primary_priority.find(k => triggered[k]) || 'low_change';
  for (const k of cfg.primary_priority) if (triggered[k] && k !== primary) modifiers.push(k);
  modifiers.push(...extra);
  if (depthNow < cfg.snowpack.shallow_depth_m) modifiers.push('shallow_snowpack');
  rules.push({state: 'low_change', met: primary === 'low_change', condition: 'no other state met (incl. buried crust events)', observed: {}});
  return {primary_state: primary, modifiers, reason: null, unconfirmed_rule_hits: [], data_sufficiency: sufficiency, metrics, rules, events};
}

// JMA reference (never merged into model values).
function jmaReference(aligned, startMs, endMs) {
  if (!aligned?.rows) return null;
  const rows = aligned.rows.filter(r => { const t = Date.parse(r.time_utc); return t >= startMs && t <= endMs; });
  const out = {};
  for (const st of aligned.stations || []) {
    const vals = f => rows.map(r => r.observations?.[st.station_code]?.values?.[f]?.value).map(num);
    const sum = f => { const v = vals(f); const c = v.filter(x => x != null).length; return {value: c ? round(v.reduce((a, x) => a + (x ?? 0), 0), 1) : null, available_hours: c, hours: v.length}; };
    const T = vals('temperature_c').filter(x => x != null);
    out[st.station_code] = {name_ja: st.name_ja, role: st.role, elevation_m: st.elevation_m, distance_km: st.distance_from_kiroro_km,
      new_snow_cm: sum('new_snow_1h_cm'), precipitation_mm: sum('precipitation_1h_mm'),
      temperature_c: T.length ? {min: Math.min(...T), max: Math.max(...T), available_hours: T.length} : null};
  }
  return {usage: 'reference_only_not_merged_into_model', covered_hours: rows.length, first_utc: rows[0]?.time_utc ?? null, last_utc: rows.at(-1)?.time_utc ?? null, stations: out};
}

// Model values in the aligned view must equal the raw model file at the same hour (consistency check only).
function crossCheck(aligned, model) {
  if (!aligned?.rows) return null;
  const map = {temperature_c: 'temperature_2m', precipitation_1h_mm: 'precipitation', wind_speed_ms: 'wind_speed_10m', new_snow_1h_cm: 'snowfall'};
  let compared = 0, mismatches = 0;
  for (const p of POINTS) {
    const s = new Map(pointSeries(model, p).map(r => [r.t, r]));
    for (const r of aligned.rows) {
      const raw = s.get(Date.parse(r.time_utc)); if (!raw) continue;
      for (const [a, b] of Object.entries(map)) {
        const av = num(r.model?.[p]?.values?.[a]?.value), bv = raw.v[b];
        if (av == null && bv == null) continue;
        compared++; if (av == null || bv == null || Math.abs(av - bv) > 1e-6) mismatches++;
      }
    }
  }
  return {compared_values: compared, mismatches};
}

// Grid cell the provider actually used for each point (from the response). Absent -> null; never inferred.
export function sourceGrids(model) {
  const grids = {};
  for (const p of POINTS) {
    const m = (model.points || []).find(x => x.point_type === p);
    const lat = num(m?.grid_latitude), lng = num(m?.grid_longitude);
    grids[p] = lat != null && lng != null ? {latitude: lat, longitude: lng, api_elevation_m: num(m.api_elevation), basis: 'open_meteo_response_grid'} : null;
  }
  for (const p of POINTS) {
    if (!grids[p]) continue;
    grids[p].shared_with = POINTS.filter(q => q !== p && grids[q] && grids[q].latitude === grids[p].latitude && grids[q].longitude === grids[p].longitude);
  }
  return grids;
}

const REQUIRED = ['temperature_2m', 'rain', 'snowfall', 'wind_speed_10m', 'snow_depth'];
// Freshness of the newest complete weather hour vs. analysis time. Expired data never yields a "current" state.
export function freshness(lastValidMs, analysisMs, f) {
  if (lastValidMs == null) return {status: 'no_valid_data', age_hours: null, display_as_current: false, thresholds_h: f};
  const age = round((analysisMs - lastValidMs) / HOUR, 2);
  const status = age <= f.fresh_max_age_h ? 'fresh' : age <= f.stale_max_age_h ? 'stale' : 'expired';
  return {status, age_hours: age, display_as_current: status !== 'expired', thresholds_h: f};
}

export function runEngine({model, aligned, cfg, anchorMs, analysisMs, sources}) {
  analysisMs ??= anchorMs;
  const startMs = anchorMs - 71 * HOUR;
  const grids = sourceGrids(model);
  const points = {};
  for (const p of POINTS) {
    const series = pointSeries(model, p);
    const meta = (model.points || []).find(x => x.point_type === p) || {};
    const base = {point_type: p, elevation_m: meta.elevation ?? null, source_grid: grids[p] ?? null};
    if (!series) { points[p] = {...base, primary_state: null, modifiers: [], reason: 'point_missing_in_model'}; continue; }
    const rows = windowRows(series, anchorMs, 72);
    const lastValid = [...rows].reverse().find(r => REQUIRED.every(f => r.v[f] != null));
    const fr = freshness(lastValid?.t ?? null, analysisMs, cfg.freshness);
    const c = classifyPoint(rows, cfg);
    // state_at_last_valid_hour = historical classification; primary_state = what may be shown as current.
    points[p] = {...base, last_valid_weather_hour_utc: lastValid?.iso ?? null, freshness: fr,
      state_at_last_valid_hour: c.primary_state, ...c,
      primary_state: fr.display_as_current ? c.primary_state : null,
      reason: c.reason ?? (fr.display_as_current ? null : `weather_data_${fr.status}`)};
  }
  return {
    schema_version: 2, region_id: model.region_id, data_kind: 'snow_surface_estimate_experimental',
    disclaimer: 'Model-based experimental estimate of likely snow-surface conditions. NOT an observed surface state and NOT an avalanche or safety assessment. Model snow depth is a model estimate, not an observed snow depth.',
    config: cfg,
    timestamps: {
      collected_at_utc: model.fetched_at ?? null,
      analysis_at_utc: new Date(analysisMs).toISOString(),
      last_valid_weather_hour_utc: Object.fromEntries(POINTS.map(p => [p, points[p].last_valid_weather_hour_utc ?? null]))
    },
    analysis_window: {hours: 72, first_hour_utc: new Date(startMs).toISOString(), last_hour_utc: new Date(anchorMs).toISOString(),
      anchor_rule: 'last full model hour at or before min(model fetched_at, analysis time) (forecast hours excluded)', hour_semantics: 'precip/snow/rain = preceding 1h; temperature/wind = hourly value'},
    excluded_inputs: {slr_and_blend_experiments: 'not used (kiroro-snowfall-analysis.json, kiroro-dynamic-blend.json are not read); snowfall = raw Open-Meteo hourly snowfall'},
    sources,
    model_crosscheck_with_aligned_view: crossCheck(aligned, model),
    points,
    jma_reference: jmaReference(aligned, startMs, anchorMs)
  };
}

export function loadInputs(region, analysisAt = Date.now(), {modelPath = path.join(ROOT, 'dist/data/weather', `${region}.json`)} = {}) {
  const alignedPath = path.join(ROOT, 'work/weather', `${region}-observation-model-aligned.json`);
  const cfgPath = path.join(ROOT, 'scripts/snow-surface-config.json');
  const modelBuf = readFileSync(modelPath), cfgBuf = readFileSync(cfgPath);
  // JMA aligned view is an optional reference (exists only where it was built); classification never uses it.
  const alignedBuf = existsSync(alignedPath) ? readFileSync(alignedPath) : null;
  const model = JSON.parse(modelBuf);
  const fetched = Date.parse(model.fetched_at);
  const analysisMs = typeof analysisAt === 'number' ? analysisAt : Date.parse(analysisAt);
  if (!Number.isFinite(fetched) || !Number.isFinite(analysisMs)) throw new Error('invalid fetched_at or analysis time');
  const anchorMs = Math.floor(Math.min(fetched, analysisMs) / HOUR) * HOUR;
  const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
  return {model, aligned: alignedBuf ? JSON.parse(alignedBuf) : null, cfg: JSON.parse(cfgBuf), anchorMs, analysisMs, sources: {
    model: {path: rel(modelPath), sha256: sha256(modelBuf), provider: model.source, model: model.model, fetched_at: model.fetched_at, role: 'primary_model_history'},
    aligned: alignedBuf ? {path: rel(alignedPath), sha256: sha256(alignedBuf), role: 'jma_reference_and_model_crosscheck'} : null,
    config: {path: rel(cfgPath), sha256: sha256(cfgBuf)}
  }};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Usage: node scripts/snow-surface-engine.mjs [region] [--analysis-at=ISO] [--out=suffix]
  const args = process.argv.slice(2);
  const region = args.find(a => !a.startsWith('--')) || 'kiroro';
  const at = args.find(a => a.startsWith('--analysis-at='))?.slice(14);
  const suffix = args.find(a => a.startsWith('--out='))?.slice(6) || 'snow-surface-v2';
  const result = runEngine(loadInputs(region, at ?? Date.now()));
  const out = path.join(ROOT, 'work/weather', `${region}-${suffix}.json`);
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  for (const [p, r] of Object.entries(result.points)) console.log(p.padEnd(6), r.primary_state, '| at last valid hour:', r.state_at_last_valid_hour, JSON.stringify(r.modifiers), r.reason || '', r.freshness?.status);
  console.log('->', path.relative(ROOT, out));
}
