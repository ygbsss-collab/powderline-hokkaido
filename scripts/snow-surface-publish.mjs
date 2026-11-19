// Publish a Snow Surface Engine v0.2 result for the app (read-only on the source; copies fields, computes nothing).
// Usage: node scripts/snow-surface-publish.mjs [region=kiroro] [--src=work/weather/<region>-snow-surface-v2.json]
// Writes: dist/data/snow-surface/<region>.json (temp file + rename, so a reader never sees a partial JSON).
import {readFileSync, writeFileSync, mkdirSync, renameSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POINTS = ['summit', 'mid', 'base'];

// Write JSON atomically: full write to a sibling temp file, parse-check it, then rename over the target.
export function writeJsonAtomic(file, value, {compact = false} = {}) {
  mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const text = compact ? JSON.stringify(value) : JSON.stringify(value, null, 2) + '\n';
  try {
    writeFileSync(tmp, text);
    JSON.parse(readFileSync(tmp, 'utf8'));
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, {force: true});
    throw error;
  }
  return file;
}

// Engine output (parsed) + its raw bytes -> app payload. Throws on an unexpected structure.
export function buildPublished(src, buf, srcPath, region) {
  if (src?.schema_version !== 2 || src.data_kind !== 'snow_surface_estimate_experimental') throw new Error('unexpected engine output (need schema_version 2 snow_surface_estimate_experimental)');
  if (src.region_id !== region) throw new Error(`region mismatch: file ${src.region_id} vs ${region}`);
  const points = {};
  for (const p of POINTS) {
    const r = src.points?.[p];
    if (!r) { points[p] = null; continue; }
    points[p] = {
      point_type: p,
      elevation_m: r.elevation_m ?? null,
      primary_state: r.primary_state ?? null,
      state_at_last_valid_hour: r.state_at_last_valid_hour ?? null,
      modifiers: Array.isArray(r.modifiers) ? r.modifiers : [],
      reason: r.reason ?? null,
      // Only copied when the engine produced it; never generated here.
      basis_summary: typeof r.basis_summary === 'string' && r.basis_summary.trim() ? r.basis_summary : null,
      last_valid_weather_hour_utc: r.last_valid_weather_hour_utc ?? null,
      freshness: r.freshness ?? null
    };
  }
  return {
    schema_version: 1,
    region_id: region,
    data_kind: 'snow_surface_estimate_published',
    label: '모델 기반 설질 추정',
    disclaimer: src.disclaimer,
    config_id: src.config?.config_id ?? null,
    freshness_thresholds_h: src.config?.freshness ? {fresh_max_age_h: src.config.freshness.fresh_max_age_h, stale_max_age_h: src.config.freshness.stale_max_age_h} : null,
    timestamps: src.timestamps,
    analysis_window: {first_hour_utc: src.analysis_window?.first_hour_utc ?? null, last_hour_utc: src.analysis_window?.last_hour_utc ?? null},
    // Raw model input of the analysis (path + sha256 + fetched_at) and the analysis file itself.
    model_source: src.sources?.model ? {path: src.sources.model.path, sha256: src.sources.model.sha256, fetched_at: src.sources.model.fetched_at} : null,
    source: {path: path.relative(ROOT, srcPath).replace(/\\/g, '/'), sha256: createHash('sha256').update(buf).digest('hex')},
    published_at_utc: new Date().toISOString(),
    points
  };
}

export const publishedPath = region => path.join(ROOT, 'dist/data/snow-surface', `${region}.json`);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const region = args.find(a => !a.startsWith('--')) || 'kiroro';
  if (!/^[a-z0-9_-]+$/i.test(region)) throw new Error(`invalid region id: ${region}`);
  const srcRel = args.find(a => a.startsWith('--src='))?.slice(6) || `work/weather/${region}-snow-surface-v2.json`;
  const srcPath = path.resolve(ROOT, srcRel);
  const buf = readFileSync(srcPath);
  const out = buildPublished(JSON.parse(buf), buf, srcPath, region);
  const file = writeJsonAtomic(publishedPath(region), out);
  console.log(POINTS.map(p => `${p}: ${out.points[p]?.primary_state ?? 'null'} (${out.points[p]?.freshness?.status ?? '-'})`).join(' | '), '->', path.relative(ROOT, file));
}
