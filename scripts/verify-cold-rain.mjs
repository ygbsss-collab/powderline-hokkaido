// Cold-rain verification (rain > 0.05 mm at <= -2 °C in the published multi-model files): for every such hour, the raw
// model variables (rain, showers, snowfall, precipitation), the showers rule applied (liquidRain) and the weights.
// Re-fetches the same models (a newer run may differ slightly; reconstruction vs. published is reported).
// Nothing is relabelled by temperature. Usage: node scripts/verify-cold-rain.mjs [regionId ... | all]
// Output: work/weather/cold-rain-verification.json
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchForecast} from './weather-model-compare-kiroro.mjs';
import {loadConfig} from './weather-multimodel-engine.mjs';
import {liquidRain} from './weather-multimodel-publish.mjs';
import {writeJsonAtomic} from './snow-surface-publish.mjs';
import {primarySkiAreas} from './weather-points.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POINTS = ['summit', 'mid', 'base'];
const VARS = ['precipitation', 'rain', 'showers', 'snowfall', 'temperature_2m', 'weather_code'];
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function raw(id, m, point) {
  const url = new URL(`https://api.open-meteo.com/v1/${m.endpoint}`);
  url.search = new URLSearchParams({latitude: String(point.latitude), longitude: String(point.longitude), elevation: String(point.elevation),
    models: id, hourly: VARS.join(','), forecast_days: String(m.forecast_days), past_days: id === 'best_match' ? '4' : '0', timezone: 'UTC'}).toString();
  const body = await fetchForecast(url);
  return new Map(body.hourly.time.map((t, i) => [Date.parse(`${t}:00Z`), Object.fromEntries(VARS.map(v => [v, num(body.hourly[v][i])]))]));
}

const cfg = loadConfig();
const args = process.argv.slice(2);
const regions = !args.length || args.includes('all') ? Object.keys(primarySkiAreas) : args;
const report = {ran_at: new Date().toISOString(), note: 'Model-native rain values at <= -2 °C are kept as published; no temperature-based relabelling.', regions: {}};
const total = {hours: 0, by_contribution: {}, showers_added_hours: 0, showers_dropped_overlap_hours: 0, reconstruct_mismatch: 0};
for (const region of regions) {
  const mm = JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather-multimodel', `${region}.json`), 'utf8'));
  const reg = {};
  for (const p of POINTS) {
    const h = mm.hourly[p], W = mm.multimodel.hourly_weights[p];
    const idx = mm.hourly.time.map((t, i) => i).filter(i => (h.rain[i] ?? 0) > 0.05 && h.temperature_2m[i] != null && h.temperature_2m[i] <= -2);
    if (!idx.length) { reg[p] = {count: 0}; continue; }
    const meta = mm.points.find(x => x.point_type === p);
    const point = {latitude: meta.latitude, longitude: meta.longitude, elevation: meta.elevation};
    const runs = {};
    for (const [id, m] of Object.entries(cfg.models)) { try { runs[id] = await raw(id, m, point); } catch (e) { runs[id] = null; } }
    const rows = idx.map(i => {
      const t = Date.parse(mm.hourly.time[i]);
      const weights = W[i] || {};
      let recon = 0, wsum = 0;
      const models = Object.fromEntries(Object.entries(weights).map(([id, w]) => {
        const r = runs[id]?.get(t);
        if (!r) return [id, {weight: w, raw: null}];
        const lq = liquidRain(r.precipitation, r.rain, r.showers, r.snowfall);
        if (lq.value != null) { recon += w * lq.value; wsum += w; }
        return [id, {weight: w, raw: r, liquid_mm: lq.value, showers_rule: lq.rule, showers_added: ['separate', 'consistent'].includes(lq.rule) && (r.showers ?? 0) > 0}];
      }));
      const contrib = Object.values(models).some(m => (m.raw?.rain ?? 0) > 0.05) ? 'model_rain_field' : Object.values(models).some(m => m.showers_added) ? 'showers_only' : 'unexplained_or_changed_run';
      return {time: mm.hourly.time[i], published_rain_mm: h.rain[i], temp_c: h.temperature_2m[i], code: h.weather_code[i], source: mm.multimodel.hourly_source[p][i],
        reconstructed_rain_mm: wsum ? Math.round(recon / wsum * 100) / 100 : null, contribution: contrib, models};
    });
    const by = rows.reduce((a, r) => ({...a, [r.contribution]: (a[r.contribution] || 0) + 1}), {});
    for (const [k, v] of Object.entries(by)) total.by_contribution[k] = (total.by_contribution[k] || 0) + v;
    total.hours += rows.length;
    total.showers_added_hours += rows.filter(r => Object.values(r.models).some(m => m.showers_added)).length;
    total.showers_dropped_overlap_hours += rows.filter(r => Object.values(r.models).some(m => m.showers_rule === 'overlap' && (m.raw?.showers ?? 0) > 0)).length;
    total.reconstruct_mismatch += rows.filter(r => r.reconstructed_rain_mm == null || Math.abs(r.reconstructed_rain_mm - r.published_rain_mm) > 0.06).length;
    reg[p] = {count: rows.length, by_contribution: by, rows};
  }
  report.regions[region] = reg;
  console.log(region, POINTS.map(p => `${p}: ${reg[p].count} ${JSON.stringify(reg[p].by_contribution || {})}`).join(' | '));
}
report.total = total;
const file = writeJsonAtomic(path.join(ROOT, 'work/weather', 'cold-rain-verification.json'), report);
console.log(JSON.stringify(total), '->', path.relative(ROOT, file));
