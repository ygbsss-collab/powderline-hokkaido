// POWDERLINE multi-model forecast engine — INTERNAL VALIDATION ONLY (never replaces the published Best Match forecast).
//   F       = Σ(w_i × F_i) / Σ w_i   over models that really have a value at that hour (missing ≠ 0), per lead band
//   F_final = F − Bias               only where a collocated observation (same location, elevation, unit) gives
//                                     enough pairs; ski points have none, so F_final = F there (bias_applied: false)
// Reuses: weather-model-compare-kiroro.mjs (fetch / URL / normalize), weather-dynamic-blend-kiroro.mjs (SLR),
//         snow-surface-publish.mjs (atomic JSON write), published dist/data/weather/<region>.json (points, past 72 h).
// Usage: node scripts/weather-multimodel-engine.mjs [regionId ... | all]
// Output: work/weather/<region>-multimodel.json
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchForecast, forecastUrl, normalize} from './weather-model-compare-kiroro.mjs';
import {calculateDynamicSlr} from './weather-dynamic-blend-kiroro.mjs';
import {writeJsonAtomic} from './snow-surface-publish.mjs';
import {primarySkiAreas} from './weather-points.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const POINTS = ['summit', 'mid', 'base'];
const CFG_PATH = path.join(ROOT, 'scripts/weather-multimodel-config.json');
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v, d = 3) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const iso = ms => new Date(ms).toISOString();

export const loadConfig = () => JSON.parse(readFileSync(CFG_PATH, 'utf8'));

export function bandFor(cfg, leadH) {
  return cfg.bands.find(b => leadH >= b.lead_h[0] && leadH <= b.lead_h[1]) || null;
}

// Country of a region: explicit override, else the coordinate boxes (same as the app). null = undetermined.
export function countryOf(cfg, region, lat, lng) {
  const det = cfg.country_detection || {};
  if (det.region_country?.[region]) return det.region_country[region];
  for (const [c, b] of Object.entries(det.boxes || {})) {
    if (lat >= b.lat[0] && lat <= b.lat[1] && lng >= b.lng[0] && lng <= b.lng[1]) return c;
  }
  return null;
}
// Config view for one country: its bands / transitions ("default" = the top-level JP settings, unchanged).
export function profileConfig(cfg, country) {
  const p = cfg.country_profiles?.[country];
  if (!p) throw new Error(`no model profile for country ${country}`);
  return {...cfg, country, bands: p.bands === 'default' ? cfg.bands : p.bands, transitions: p.transitions === 'default' ? (cfg.transitions || []) : (p.transitions || [])};
}
// Models a profile needs: every model with a weight in a band, plus best_match (past hours and fallback).
export function profileModels(cfg) {
  const ids = new Set(['best_match']);
  for (const b of cfg.bands) for (const id of Object.keys(b.weights)) ids.add(id);
  return Object.fromEntries(Object.entries(cfg.models).filter(([id]) => ids.has(id)));
}

// Effective weights at a lead hour: the band's weights, or inside a configured transition window a linear mix
// (1-a)·from + a·to with a strictly between 0 and 1 (start hour already mixes a little, end hour is almost "to").
export function weightsFor(cfg, leadH) {
  const band = bandFor(cfg, leadH);
  if (!band) return null;
  const tr = (cfg.transitions || []).find(t => leadH >= t.start_lead_h && leadH <= t.end_lead_h);
  if (!tr) return {band: band.id, weights: band.weights, transition: null};
  const from = cfg.bands.find(b => b.id === tr.from_band), to = cfg.bands.find(b => b.id === tr.to_band);
  if (!from || !to || tr.shape !== 'linear') throw new Error(`invalid transition ${tr.id}`);
  const a = (leadH - tr.start_lead_h + 1) / (tr.end_lead_h - tr.start_lead_h + 2);
  const weights = {};
  for (const [id, w] of Object.entries(from.weights)) weights[id] = (weights[id] || 0) + (1 - a) * w;
  for (const [id, w] of Object.entries(to.weights)) weights[id] = (weights[id] || 0) + a * w;
  return {band: band.id, weights, transition: {id: tr.id, a: Math.round(a * 1000) / 1000}};
}

// Weighted mean over models with a real value; null when the available nominal weight is below the minimum.
export function blendValue(weights, valueOf, minWeight) {
  const avail = Object.entries(weights).filter(([id]) => num(valueOf(id)) != null);
  const wsum = avail.reduce((s, [, w]) => s + w, 0);
  if (!avail.length || wsum < minWeight - 1e-9) return {value: null, used: Object.fromEntries(avail.map(([id, w]) => [id, w])), reason: 'insufficient_model_weight'};
  const value = avail.reduce((s, [id, w]) => s + w * valueOf(id), 0) / wsum;
  const renorm = Math.abs(wsum - Object.values(weights).reduce((s, w) => s + w, 0)) > 1e-9;
  return {value, used: Object.fromEntries(avail.map(([id, w]) => [id, round(w / wsum, 4)])), renormalized: renorm, reason: null};
}

const clampNonNeg = (cfg, variable, v) => (v != null && cfg.non_negative_variables.includes(variable) ? Math.max(0, v) : v);

// ---- model collection (forecast API; issue time is not returned by these responses) ----
async function fetchModelRuns(cfg, point) {
  const runs = {};
  for (const [id, m] of Object.entries(cfg.models)) {
    const conf = {id, endpoint: m.endpoint, forecast_days: m.forecast_days, provider: m.provider};
    try {
      const body = await fetchForecast(forecastUrl(conf, point));
      const run = normalize(conf, point, body, new Date().toISOString());
      runs[id] = {ok: true, run, index: new Map(run.time_utc.map((t, i) => [t, i]))};
    } catch (error) {
      runs[id] = {ok: false, error: String(error.message).slice(0, 300)};
    }
  }
  return runs;
}
const runValue = (runs, id, variable, t) => {
  const r = runs[id];
  if (!r?.ok) return null;
  const i = r.index.get(t);
  return i == null ? null : num(r.run.values[variable]?.[i]);
};

// ---- past runs (Previous Runs API): value at valid time t from the run ≈ k days earlier (k = 0 … max_lead_day) ----
async function fetchPreviousRuns(cfg, station) {
  const vars = cfg.bias.variables.flatMap(v => [v, ...Array.from({length: cfg.bias.max_lead_day}, (_, k) => `${v}_previous_day${k + 1}`)]);
  const out = {};
  for (const id of Object.keys(cfg.models)) {
    const url = new URL('https://previous-runs-api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({latitude: String(station.latitude), longitude: String(station.longitude), elevation: String(station.elevation_m),
      hourly: vars.join(','), models: id, past_days: '5', forecast_days: '1', timezone: 'UTC', wind_speed_unit: 'ms'}).toString();
    try {
      const body = await fetchForecast(url);
      if (body.utc_offset_seconds !== 0) throw new Error('expected UTC');
      const units = body.hourly_units || {};
      for (const v of cfg.bias.variables) if (units[v] !== {temperature_2m: '°C', precipitation: 'mm'}[v]) throw new Error(`unit ${v}=${units[v]}`);
      const index = new Map(body.hourly.time.map((t, i) => [`${t}:00.000Z`, i]));
      out[id] = {ok: true, index, hourly: body.hourly, response_coordinate: {latitude: body.latitude, longitude: body.longitude, elevation_m: body.elevation}};
    } catch (error) {
      out[id] = {ok: false, error: String(error.message).slice(0, 300)};
    }
  }
  return out;
}
const prevValue = (prev, id, variable, k, t) => {
  const r = prev[id];
  if (!r?.ok) return null;
  const i = r.index.get(t);
  return i == null ? null : num(r.hourly[k === 0 ? variable : `${variable}_previous_day${k}`]?.[i]);
};

// Observation error of the blended (and Best Match) past runs, per variable and lead day, at one station.
export function learnBias(cfg, prev, obsByTime) {
  const OBS_FIELD = {temperature_2m: 'temperature_c', precipitation: 'precipitation_1h_mm'};
  const result = {};
  for (const variable of cfg.bias.variables) {
    result[variable] = {};
    for (let k = 0; k <= cfg.bias.max_lead_day; k++) {
      const band = weightsFor(cfg, k * 24 + 12);
      const errs = [], bmErrs = [];
      let wet = 0;
      for (const [t, rec] of obsByTime) {
        const m = rec.measurements?.[OBS_FIELD[variable]];
        if (!m?.usable || num(m.value) == null) continue;
        const b = band ? blendValue(band.weights, id => prevValue(prev, id, variable, k, t), cfg.missing_model_policy.min_available_weight) : {value: null};
        const bm = prevValue(prev, 'best_match', variable, k, t);
        if (b.value != null) { errs.push(b.value - m.value); if (variable === 'precipitation' && (m.value > 0 || b.value > 0)) wet++; }
        if (bm != null) bmErrs.push(bm - m.value);
      }
      const stats = e => ({pairs: e.length, bias: round(mean(e)), mae: round(mean(e.map(Math.abs))), rmse: round(e.length ? Math.sqrt(mean(e.map(x => x * x))) : null)});
      const s = stats(errs);
      const sufficient = s.pairs >= cfg.bias.min_pairs && (variable !== 'precipitation' || wet >= cfg.bias.min_wet_hours_precipitation);
      result[variable][`day${k}`] = {lead_day: k, run_offset: k === 0 ? 'latest run' : `run ≈${k} day(s) earlier`, band: band?.band ?? null,
        blend: s, best_match: stats(bmErrs), wet_hours: variable === 'precipitation' ? wet : undefined,
        sufficient, reason: sufficient ? null : s.pairs < cfg.bias.min_pairs ? `pairs ${s.pairs} < ${cfg.bias.min_pairs}` : `wet hours ${wet} < ${cfg.bias.min_wet_hours_precipitation}`};
    }
  }
  return result;
}

// Forecast rows for one location: blend per band, optional bias, Best Match side by side, SLR experiment kept apart.
export function buildForecast(cfg, runs, anchorMs, bias = null) {
  const rows = [];
  for (let lead = 1; lead <= cfg.bands.at(-1).lead_h[1]; lead++) {
    const t = iso(anchorMs + lead * HOUR);
    const band = weightsFor(cfg, lead);
    const row = {valid_time_utc: t, lead_h: lead, band: band.band, transition: band.transition, F: {}, final: {}, best_match: {}, bias_applied: {}};
    let weightsUsed = null;
    for (const v of cfg.variables) {
      const b = blendValue(band.weights, id => runValue(runs, id, v, t), cfg.missing_model_policy.min_available_weight);
      const F = clampNonNeg(cfg, v, b.value);
      row.F[v] = round(F, 3);
      if (v === 'temperature_2m') weightsUsed = b.used;
      if (b.renormalized || b.reason) (row.weight_notes ||= {})[v] = b.reason || b.used;
      const k = Math.floor((lead - 1) / 24);
      const bv = bias?.[v]?.[`day${k}`];
      if (F != null && bv?.sufficient && bv.blend.bias != null) {
        row.final[v] = round(clampNonNeg(cfg, v, F - bv.blend.bias), 3);
        row.bias_applied[v] = {lead_day: k, bias: bv.blend.bias};
      } else {
        row.final[v] = row.F[v];
        row.bias_applied[v] = false;
      }
      row.best_match[v] = round(runValue(runs, 'best_match', v, t), 3);
    }
    row.weights_used = weightsUsed;
    // SLR experiment (unvalidated): separate from the model's own snowfall; never part of F / final.
    const P = row.F.precipitation, R = row.F.rain, T = row.F.temperature_2m;
    const slr = calculateDynamicSlr(T);
    row.slr_experiment = P == null || R == null || slr == null ? null : {swe_proxy_mm: round(Math.max(P - R, 0), 3), slr_ratio: round(slr, 2), snowfall_cm: round(Math.max(P - R, 0) * slr / 10, 3)};
    rows.push(row);
  }
  return rows;
}

function summarise(cfg, rows) {
  const out = {};
  for (const band of cfg.bands) {
    const r = rows.filter(x => x.band === band.id);
    const both = v => r.filter(x => x.final[v] != null && x.best_match[v] != null);
    const sum = (list, get) => round(list.reduce((s, x) => s + get(x), 0), 2);
    const p = both('precipitation'), s = both('snowfall'), T = both('temperature_2m'), w = both('wind_speed_10m');
    const slrRows = r.filter(x => x.slr_experiment && x.F.snowfall != null);
    const orig = sum(slrRows, x => x.F.snowfall), slrTot = sum(slrRows, x => x.slr_experiment.snowfall_cm);
    out[band.id] = {
      label: band.label, hours: r.length, nominal_weights: band.weights,
      hours_blended: r.filter(x => x.F.temperature_2m != null).length,
      hours_renormalized: r.filter(x => x.weight_notes && Object.values(x.weight_notes).some(n => typeof n === 'object')).length,
      hours_null: r.filter(x => x.F.temperature_2m == null).length,
      compared_hours: {precipitation: p.length, snowfall: s.length, temperature_2m: T.length, wind_speed_10m: w.length},
      precipitation_mm: {multimodel: sum(p, x => x.final.precipitation), best_match: sum(p, x => x.best_match.precipitation)},
      snowfall_cm: {multimodel: sum(s, x => x.final.snowfall), best_match: sum(s, x => x.best_match.snowfall)},
      temperature_mean_diff_c: round(mean(T.map(x => x.final.temperature_2m - x.best_match.temperature_2m)), 2),
      wind_mean_diff_ms: round(mean(w.map(x => x.final.wind_speed_10m - x.best_match.wind_speed_10m)), 2),
      slr_experiment: {hours: slrRows.length, model_snowfall_cm: orig, slr_snowfall_cm: slrTot, ratio_slr_to_model: orig > 0 ? round(slrTot / orig, 2) : null}
    };
  }
  return out;
}

const availability = runs => Object.fromEntries(Object.entries(runs).map(([id, r]) => [id, r.ok
  ? {ok: true, range_utc: r.run.usable_time_range_utc, usable_hours: r.run.usable_time_steps, issued_at_utc: r.run.issued_at_utc, issued_at_reason: r.run.issued_at_reason,
    response_coordinate: r.run.response_coordinate,
    variables: Object.fromEntries(Object.entries(r.run.availability).map(([v, a]) => [v, a.status === 'available' ? a.available_hours : a.status]))}
  : {ok: false, error: r.error}]));

export async function runMultiModel(region, {now = Date.now()} = {}) {
  const cfg = loadConfig();
  const weatherPath = path.join(ROOT, 'dist/data/weather', `${region}.json`);
  const weatherBuf = readFileSync(weatherPath);
  const weather = JSON.parse(weatherBuf);
  if (weather.region_id !== region) throw new Error('published weather region mismatch');
  const anchorMs = Math.floor(now / HOUR) * HOUR;
  const output = {
    schema_version: 1, region_id: region, data_kind: 'multimodel_forecast_internal_validation', service_use: false,
    disclaimer: 'Internal validation output. Not a user forecast; the published Best Match file remains the service forecast.',
    config: cfg, generated_at_utc: iso(Date.now()), anchor_utc: iso(anchorMs),
    formula: {blend: 'F = Σ(w_i·F_i)/Σw_i over models with a value (missing model ≠ 0); null if Σw_i < min_available_weight',
      bias: 'F_final = F − Bias(variable, lead day) only where learned at the same location/elevation with enough pairs; else F_final = F',
      non_negative: 'precipitation, rain, snowfall, wind clamped at 0 after blending and bias'},
    past_source: {path: path.relative(ROOT, weatherPath).replace(/\\/g, '/'), sha256: sha256(weatherBuf), fetched_at: weather.fetched_at},
    points: {}, stations: {}
  };
  // Past 72 h: Best Match history from the published file (model), observations stay per station below.
  const times = (weather.hourly?.time || []).map(t => Date.parse(t));
  for (const p of POINTS) {
    const meta = (weather.points || []).find(x => x.point_type === p);
    if (!meta) { output.points[p] = {error: 'point missing in published weather'}; continue; }
    const point = {point_id: `${region}:${p}`, point_type: p, latitude: meta.latitude, longitude: meta.longitude, elevation: meta.elevation};
    const runs = await fetchModelRuns(cfg, point);
    const rows = buildForecast(cfg, runs, anchorMs, null);
    const past = [];
    times.forEach((t, i) => {
      if (t > anchorMs - cfg.past_window_h * HOUR && t <= anchorMs) past.push({valid_time_utc: iso(t), best_match: Object.fromEntries(cfg.variables.map(v => [v, num(weather.hourly[p]?.[v]?.[i])]))});
    });
    output.points[p] = {elevation_m: meta.elevation, coordinate: {latitude: meta.latitude, longitude: meta.longitude},
      model_availability: availability(runs),
      bias: {applied: false, reason: 'no observation at this location/elevation; station bias is not transferred across elevation'},
      summary_by_band: summarise(cfg, rows), past_72h: past, hourly: rows};
  }
  // Collocated validation targets: JMA stations (only where an observation file exists for the region).
  const obsPath = path.join(ROOT, 'work/weather', `${region}-jma-amedas-observations.json`);
  if (existsSync(obsPath)) {
    const obsBuf = readFileSync(obsPath);
    const obs = JSON.parse(obsBuf);
    output.observation_source = {path: path.relative(ROOT, obsPath).replace(/\\/g, '/'), sha256: sha256(obsBuf), window: obs.window, generated_at: obs.generated_at};
    for (const st of obs.stations || []) {
      const station = {point_id: `${region}:jma:${st.station_code}`, point_type: `jma_${st.station_code}`, latitude: st.latitude, longitude: st.longitude, elevation: st.elevation_m};
      const obsByTime = new Map((obs.records || []).filter(r => r.station_code === st.station_code).map(r => [r.observed_at_utc, r]));
      const prev = await fetchPreviousRuns(cfg, st);
      const bias = learnBias(cfg, prev, obsByTime);
      const runs = await fetchModelRuns(cfg, station);
      const rows = buildForecast(cfg, runs, anchorMs, bias);
      output.stations[st.station_code] = {name_ja: st.name_ja, role: st.role, elevation_m: st.elevation_m, distance_from_region_km: st.distance_from_kiroro_km ?? null,
        observed_elements: st.observed_elements, observation_hours: obsByTime.size,
        previous_runs_availability: Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, r.ok ? {ok: true, response_coordinate: r.response_coordinate} : {ok: false, error: r.error}])),
        observation_error: bias,
        bias_applied_hours: Object.fromEntries(cfg.variables.map(v => [v, rows.filter(r => r.bias_applied[v]).length])),
        model_availability: availability(runs), summary_by_band: summarise(cfg, rows), hourly: rows};
    }
  } else {
    output.observation_source = null;
    output.observation_note = 'no JMA observation file for this region: no error learning, no bias correction';
  }
  // Snowfall checks: SLR vs model snowfall per point; snowfall observations are not comparable (depth change).
  output.slr_validation = {
    validated: false, service_use: false,
    reason: 'no comparable snowfall observation (JMA new snow = snow-depth change, model snowfall = precipitation-derived amount)',
    ratio_slr_to_model_by_point: Object.fromEntries(POINTS.map(p => [p, Object.fromEntries(Object.entries(output.points[p]?.summary_by_band || {}).map(([b, s]) => [b, s.slr_experiment.ratio_slr_to_model]))]))
  };
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const all = Object.keys(primarySkiAreas);
  const regions = !args.length || args.includes('all') ? all : args;
  for (const region of regions) {
    try {
      const out = await runMultiModel(region);
      const file = writeJsonAtomic(path.join(ROOT, 'work/weather', `${region}-multimodel.json`), out);
      const s = out.points.summit?.summary_by_band || {};
      console.log(JSON.stringify({region, file: path.relative(ROOT, file),
        models: Object.fromEntries(Object.entries(out.points.summit?.model_availability || {}).map(([id, a]) => [id, a.ok ? a.range_utc : `ERR ${a.error}`])),
        summit: Object.fromEntries(Object.entries(s).map(([b, x]) => [b, {blended: x.hours_blended, renorm: x.hours_renormalized, null: x.hours_null,
          P: x.precipitation_mm, S: x.snowfall_cm, dT: x.temperature_mean_diff_c, slr_ratio: x.slr_experiment.ratio_slr_to_model}])),
        stations: Object.keys(out.stations)}));
    } catch (error) {
      console.log(JSON.stringify({region, error: String(error.message).slice(0, 300)}));
      process.exitCode = 1;
    }
  }
}
