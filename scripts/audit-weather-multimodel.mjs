// Pre-deployment audit of the multi-model service files (read-only).
// Uses the REAL display functions extracted from dist/weather.js (same code the app runs) on
// dist/data/weather-multimodel/<region>.json and compares with dist/data/weather/<region>.json.
// Usage: node scripts/audit-weather-multimodel.mjs [regionId ... | all]   -> work/weather/weather-multimodel-audit.json
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {primarySkiAreas} from './weather-points.mjs';
import {writeJsonAtomic} from './snow-surface-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const POINTS = ['summit', 'mid', 'base'];
const PRECIP_KINDS = ['rain', 'snow', 'mixed', 'thunder'];

// Extract the shared classification code from dist/weather.js and run it in a sandbox with the given data.
export function loadDisplayFunctions() {
  const src = readFileSync(path.join(ROOT, 'dist/weather.js'), 'utf8');
  const grab = (start, end) => { const a = src.indexOf(start), b = src.indexOf(end, a); if (a < 0 || b < 0) throw new Error(`weather.js section not found: ${start}`); return src.slice(a, b); };
  const code = [
    grab('  // ---- Shared weather classification', '  // Home card uses ONE hourly'),
    grab('  function homeSlot(', '  function renderCard()'),
    grab('  function snowLabel(', '  const dir8Ko'),
    grab('  function snowText(', '  const pointName'),
    grab('  // The 24 hourly slots of a local date', '  function dailyHtml()')
  ].join('\n');
  return (data, detailPoint) => {
    const logs = [];
    const ctx = {data, detailPoint, logs, Math, JSON, Number, Object, Array, Map, Set, Date, String,
      num: v => (typeof v === 'number' && Number.isFinite(v) ? v : null),
      fmt: (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '--'),
      escapeHtml: s => String(s ?? ''),
      series: (b, p, n) => data?.[b]?.[p]?.[n] || [],
      currentOf: p => data?.current?.[p] || null,
      console: {debug: (_, e) => logs.push(e)}};
    vm.createContext(ctx);
    vm.runInContext(`${code}\n;this.api = {classifyWeather, classifyDay, dayHours, isDayFrom, homeSlot, snowLabel, wmoInfo};`, ctx);
    return {...ctx.api, logs, setPoint: p => { ctx.detailPoint = p; }};
  };
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function auditRegion(region, makeFns = loadDisplayFunctions()) {
  const mm = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather-multimodel', `${region}.json`), 'utf8'));
  const bm = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather', `${region}.json`), 'utf8'));
  const fns = makeFns(mm, 'summit');
  const out = {region, structure: {}, conflicts: {}, cold_rain: {}, consistency: {}, timestamps: {}, boundaries: {}, grid: {}};
  const m = mm.multimodel;
  // 1. structure
  out.structure = {validation_ok: m?.validation?.ok === true, issues: m?.validation?.issues ?? null,
    points: POINTS.filter(p => mm.hourly[p]), hours: mm.hourly.time.length, axis_equals_best_match: JSON.stringify(mm.hourly.time) === JSON.stringify(bm.hourly.time),
    duplicates: mm.hourly.time.length - new Set(mm.hourly.time).size,
    gaps: mm.hourly.time.filter((t, i) => i > 0 && Date.parse(t) - Date.parse(mm.hourly.time[i - 1]) !== HOUR).length};
  const anchor = Date.parse(m.anchor_utc);
  for (const p of POINTS) {
    fns.setPoint(p);
    const h = mm.hourly[p], src = m.hourly_source[p];
    // 2. code vs amounts, judged by the real display function
    // Categories (raw data conflicts -> how the display resolved them):
    //   dry_code_real_amount  : dry code (0-3, 45, 48) but snow >= 0.1 cm or rain >= 0.1 mm -> shown by amounts
    //   dry_code_trace_amount : dry code with traces only (< 0.1) -> shown by code
    //   phase_conflict_uncertain: snow code but only rain is real (or reverse) -> shown "눈·비 혼합 가능" (precipBasis code_amount_phase), not decided
    //   precip_code_without_amount: precipitation code, snowfall 0 and rain 0 -> shown by code, no amount
    //   unresolved            : shown kind contradicts the real amounts of the same hour (must be 0)
    const cases = {dry_code_real_amount: [], dry_code_trace_amount: [], phase_conflict_uncertain: [], precip_code_without_amount: [], unresolved: [], mixed_shown: 0};
    mm.hourly.time.forEach((t, i) => {
      const code = num(h.weather_code[i]), s = num(h.snowfall[i]), r = num(h.rain[i]);
      if (code == null) return;
      const w = fns.classifyWeather({code, snow: s, rain: r, isDay: fns.isDayFrom(h.shortwave_radiation[i])}, `audit|${p}|${t}`);
      const base = fns.wmoInfo(code).kind;
      const precipCode = ['rain', 'snow', 'thunder'].includes(base);
      const row = {t, code, snow_cm: s, rain_mm: r, temp_c: h.temperature_2m[i], source: src[i], shown: `${w.kind}/${w.icon}/${w.label}`, precip_basis: w.precipBasis};
      const realS = s >= 0.1, realR = r >= 0.1;
      const want = realS && realR ? 'mixed' : realS ? 'snow' : realR ? 'rain' : null;
      if (w.kind === 'mixed' && w.precipBasis !== 'code_amount_phase') cases.mixed_shown++;
      if (!precipCode && want) cases.dry_code_real_amount.push(row);
      else if (!precipCode && ((s ?? 0) > 0 || (r ?? 0) > 0)) cases.dry_code_trace_amount.push(row);
      else if (w.precipBasis === 'code_amount_phase') cases.phase_conflict_uncertain.push(row);
      else if (precipCode && s === 0 && r === 0) cases.precip_code_without_amount.push(row);
      if (want && w.kind !== want && w.kind !== 'thunder' && w.precipBasis !== 'code_amount_phase') cases.unresolved.push(row);
      if (!want && ['rain', 'snow', 'mixed'].includes(w.kind) && !precipCode) cases.unresolved.push(row);
    });
    out.conflicts[p] = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, Array.isArray(v) ? {count: v.length, by_source: v.reduce((a, x) => ({...a, [x.source]: (a[x.source] || 0) + 1}), {}), examples: v.slice(0, 3)} : v]));
    // 3. rain at <= -2 °C (reported only; never re-labelled by temperature)
    const cold = [];
    mm.hourly.time.forEach((t, i) => { if ((h.rain[i] ?? 0) > 0.05 && h.temperature_2m[i] != null && h.temperature_2m[i] <= -2) cold.push({t, rain_mm: h.rain[i], temp_c: h.temperature_2m[i], code: h.weather_code[i], source: src[i], best_match_file_rain_mm: bm.hourly[p].rain[i]}); });
    out.cold_rain[p] = {count: cold.length, by_source: cold.reduce((a, x) => ({...a, [x.source]: (a[x.source] || 0) + 1}), {}),
      best_match_file_same_condition: bm.hourly[p].rain.filter((r, i) => r > 0.05 && bm.hourly[p].temperature_2m[i] <= -2).length, examples: cold.slice(0, 3)};
    // 4. home slot == hourly row of the same time (same function, same values)
    const slot = fns.homeSlot(p);
    let homeEq = null;
    if (slot) {
      const i = mm.hourly.time.indexOf(slot.time);
      const a = fns.classifyWeather({code: slot.code, snow: slot.snow, rain: slot.rain, isDay: fns.isDayFrom(slot.sw)});
      const b = fns.classifyWeather({code: h.weather_code[i], snow: h.snowfall[i], rain: h.rain[i], isDay: fns.isDayFrom(h.shortwave_radiation[i])});
      homeEq = a.kind === b.kind && a.icon === b.icon && a.label === b.label;
    }
    // daily icon from totals == daily totals from hourly (same local day)
    let dailyMismatch = 0;
    mm.daily.time.forEach((date, di) => {
      const hrs = fns.dayHours(date);
      const amounts = {snow: num(mm.daily[p].snowfall_sum[di]) ?? hrs.snow, rain: num(mm.daily[p].rain_sum[di]) ?? hrs.rain};
      if (hrs.snow != null && amounts.snow != null && Math.abs(hrs.snow - amounts.snow) > 0.011) dailyMismatch++;
      if (hrs.rain != null && amounts.rain != null && Math.abs(hrs.rain - amounts.rain) > 0.011) dailyMismatch++;
    });
    out.consistency[p] = {home_slot_equals_hourly: homeEq, home_slot_time: slot?.time ?? null, daily_vs_hourly_mismatches: dailyMismatch};
    // 8. band boundaries: continuity + jump vs the point's normal hour-to-hour change
    const leadOf = i => Math.round((Date.parse(mm.hourly.time[i]) - anchor) / HOUR);
    const jumps = {};
    const dT = mm.hourly.time.map((_, i) => (i ? Math.abs(h.temperature_2m[i] - h.temperature_2m[i - 1]) : null)).filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    const p99 = dT[Math.floor(dT.length * 0.99)] ?? null;
    const hz = i => (m.hourly_reason[p][i] || '').includes('horizon');
    for (let i = 1; i < mm.hourly.time.length; i++) {
      if (src[i] === src[i - 1] && hz(i) === hz(i - 1)) continue; // same source, same model set
      const key = `${src[i - 1]}${hz(i - 1) ? '(ecmwf-only)' : ''} -> ${src[i]}${hz(i) ? '(ecmwf-only)' : ''}`;
      const d = v => (h[v][i] != null && h[v][i - 1] != null ? Math.round((h[v][i] - h[v][i - 1]) * 100) / 100 : null);
      jumps[key] = {time: mm.hourly.time[i], lead_h: leadOf(i), step_h: (Date.parse(mm.hourly.time[i]) - Date.parse(mm.hourly.time[i - 1])) / HOUR,
        d_temperature_c: d('temperature_2m'), d_wind_ms: d('wind_speed_10m'), d_precip_mm: d('precipitation'), d_snow_cm: d('snowfall'),
        abnormal: Math.abs(d('temperature_2m') ?? 0) > Math.max(3, p99 ?? 0) || Math.abs(d('wind_speed_10m') ?? 0) > 6};
    }
    out.boundaries[p] = {temperature_hourly_change_p99_c: p99, transitions: jumps};
  }
  // 6. shared grid (per model response coordinate)
  for (const id of Object.keys(m.model_sources.summit || {})) {
    const c = POINTS.map(p => m.model_sources[p]?.[id]?.response_coordinate);
    const groups = [];
    POINTS.forEach((p, i) => { if (!c[i]) return; const g = groups.find(x => x.lat === c[i].latitude && x.lng === c[i].longitude); g ? g.points.push(p) : groups.push({lat: c[i].latitude, lng: c[i].longitude, points: [p]}); });
    out.grid[id] = groups.filter(g => g.points.length > 1).map(g => g.points);
  }
  out.grid_recorded_in_metadata = Boolean(m.shared_model_grid);
  // 7. timestamps
  const mmF = Date.parse(mm.fetched_at), bmF = Date.parse(bm.fetched_at), now = Date.now();
  out.timestamps = {multimodel_fetched_at: mm.fetched_at, best_match_fetched_at: bm.fetched_at, anchor_utc: m.anchor_utc,
    built_from_current_best_match: m.best_match_source?.fetched_at === bm.fetched_at,
    multimodel_not_older_than_bm_minus_1h: mmF >= bmF - HOUR, anchor_le_fetched: anchor <= mmF, age_hours_now: Math.round((now - mmF) / HOUR * 10) / 10,
    ui_stale_after_h: 6, loader_rejects_if_older_than_bm_by_h: 1,
    current_slots: Object.fromEntries(POINTS.map(p => [p, mm.current[p]?.basis ?? null]))};
  out.diagnostic_log_count = fns.logs.length;
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const all = Object.keys(primarySkiAreas);
  const regions = !args.length || args.includes('all') ? all : args;
  const makeFns = loadDisplayFunctions();
  const res = regions.filter(r => existsSync(path.join(ROOT, 'dist/data/weather-multimodel', `${r}.json`))).map(r => auditRegion(r, makeFns));
  const file = writeJsonAtomic(path.join(ROOT, 'work/weather', 'weather-multimodel-audit.json'), {ran_at: new Date().toISOString(), regions: res});
  for (const r of res) {
    const c = POINTS.map(p => { const k = r.conflicts[p]; return `${p}: dry+real ${k.dry_code_real_amount.count} / dry+trace ${k.dry_code_trace_amount.count} / uncertain ${k.phase_conflict_uncertain.count} / code-no-amt ${k.precip_code_without_amount.count} / mixed ${k.mixed_shown} / UNRESOLVED ${k.unresolved.count} / cold-rain ${r.cold_rain[p].count}`; }).join(' | ');
    const abn = POINTS.flatMap(p => Object.entries(r.boundaries[p].transitions).filter(([, j]) => j.abnormal || j.step_h !== 1).map(([k, j]) => `${p} ${k} dT${j.d_temperature_c}`));
    console.log(r.region, `valid ${r.structure.validation_ok} gaps ${r.structure.gaps} dup ${r.structure.duplicates}`, '\n  ', c, '\n   home==hourly', POINTS.map(p => r.consistency[p].home_slot_equals_hourly).join(','), 'daily mismatch', POINTS.map(p => r.consistency[p].daily_vs_hourly_mismatches).join(','),
      '| abnormal boundaries', abn.length ? abn.join('; ') : 'none', '| shared grid', JSON.stringify(r.grid), 'recorded', r.grid_recorded_in_metadata,
      '| ts built_from_bm', r.timestamps.built_from_current_best_match, 'age_h', r.timestamps.age_hours_now);
  }
  console.log('->', path.relative(ROOT, file));
}
