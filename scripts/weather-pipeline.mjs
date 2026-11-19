// POWDERLINE weather auto-update pipeline (one run):
//   collect (weather-collect.mjs --publish, unchanged) -> validate forecast JSON -> Snow Surface Engine v0.2
//   -> validate result -> publish dist/data/snow-surface/<region>.json (atomic)
// Usage: node scripts/weather-pipeline.mjs [regionId ... | all]      (default: all = primarySkiAreas in weather-points.mjs)
//        add --multimodel to also write the internal multi-model validation JSON (never published to dist/).
// Also (always): multi-model SERVICE forecast dist/data/weather-multimodel/<region>.json after the forecast validates.
//        add --no-snow-surface to skip the snow-surface estimate (CI: weather-update.yml; the app does not show it).
// Each region runs independently (collector in its own child process); a failed step stops only that region and
// leaves its previously published snow-surface file untouched (the app expires it by its own freshness check).
// Run summary: work/weather/weather-pipeline-last-run.json
import {readFileSync, existsSync, appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {primarySkiAreas} from './weather-points.mjs';
import {weatherRegionById} from './weather-regions.mjs';
import {loadInputs, runEngine} from './snow-surface-engine.mjs';
import {buildPublished, writeJsonAtomic, publishedPath} from './snow-surface-publish.mjs';
import {publishRegion as publishMultimodel, outPath as mmOutPath} from './weather-multimodel-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const POINTS = ['summit', 'mid', 'base'];
const REQUIRED = ['temperature_2m', 'precipitation', 'rain', 'snowfall', 'snow_depth', 'wind_speed_10m', 'weather_code'];
const COLLECT_TIMEOUT_MS = 5 * 60e3;
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

// Run the existing collector for one region; parse its JSON summary lines.
function collect(region) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['scripts/weather-collect.mjs', region, '--publish'], {cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), COLLECT_TIMEOUT_MS);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      clearTimeout(timer);
      const lines = out.split(/\r?\n/).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const published = lines.find(l => l.region === region && 'published' in l)?.published ?? null;
      const summary = lines.find(l => l.region === region && 'rows' in l) || null;
      const pointsRequested = summary ? (summary.rows?.snapshots ?? 0) + (summary.errors?.length ?? 0) : null;
      const publishSkipped = lines.find(l => l.region === region && 'publish_skipped' in l)?.publish_skipped ?? null;
      // Collector stderr: one JSON line per failed attempt (code / kind / timing) -> keep them all, plus any other tail.
      const attemptLines = err.split(/\r?\n/).filter(l => l.includes('"collect_attempt_failed"')).slice(-12);
      resolve({exit_code: code, signal: child.signalCode ?? null, published, publish_skipped: publishSkipped, errors: summary?.errors ?? null, skipped: summary?.skipped ?? null,
        work_file: summary?.file ?? null, points_requested: pointsRequested, network: summary?.network ?? null,
        attempt_failures: attemptLines.map(l => { try { return JSON.parse(l); } catch { return l.slice(0, 300); } }),
        stderr: err.split(/\r?\n/).filter(l => !l.includes('"collect_attempt_failed"')).join('\n').trim().slice(-400) || null});
    });
  });
}

// Forecast JSON that the engine will read: must be from THIS run, complete for summit/mid/base, on a clean hourly axis.
export function validateWeather(json, {region, notBeforeMs, nowMs}) {
  const issues = [];
  const requiredPastHours = weatherRegionById[region]?.country === 'KR' ? 48 : 72;
  if (json?.region_id !== region) issues.push('region_id mismatch');
  const fetched = Date.parse(json?.fetched_at || '');
  if (!Number.isFinite(fetched)) issues.push('fetched_at invalid');
  else {
    if (fetched < notBeforeMs) issues.push('fetched_at older than this run (collection did not replace the file)');
    if (fetched > nowMs + 60e3) issues.push('fetched_at in the future');
  }
  const times = json?.hourly?.time;
  if (!Array.isArray(times) || times.length < 72) issues.push('hourly.time missing or < 72 h');
  else {
    const ms = times.map(t => Date.parse(t));
    if (ms.some(t => !Number.isFinite(t))) issues.push('hourly.time unparsable');
    else if (ms.some((t, i) => i > 0 && t - ms[i - 1] !== HOUR)) issues.push('hourly.time not strictly 1 h steps');
    const off = Number(json.utc_offset_seconds);
    const sample = times[0];
    const m = /([+-])(\d{2}):(\d{2})$/.exec(sample || '');
    if (!m || (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60) !== off) issues.push('hourly time offset != utc_offset_seconds');
    if (Number.isFinite(fetched) && !(ms[0] <= fetched - requiredPastHours * HOUR && fetched <= ms.at(-1))) {
      issues.push(`hourly axis does not cover ${requiredPastHours} h before fetched_at`);
    }
  }
  for (const p of POINTS) {
    const s = json?.hourly?.[p];
    if (!s) { issues.push(`hourly.${p} missing`); continue; }
    for (const f of REQUIRED) if (!Array.isArray(s[f]) || s[f].length !== times?.length) issues.push(`hourly.${p}.${f} length mismatch`);
    if (!json?.current?.[p]) issues.push(`current.${p} missing`);
  }
  const ptypes = new Set((json?.points || []).map(p => p.point_type));
  for (const p of POINTS) if (!ptypes.has(p)) issues.push(`points.${p} missing`);
  return issues;
}

// Engine result must describe exactly the forecast file that was validated.
export function validateResult(result, {region, weatherSha, fetchedAt}) {
  const issues = [];
  if (result?.schema_version !== 2 || result.data_kind !== 'snow_surface_estimate_experimental') issues.push('unexpected result schema');
  if (result?.region_id !== region) issues.push('result region mismatch');
  if (result?.timestamps?.collected_at_utc !== fetchedAt) issues.push('collected_at != forecast fetched_at');
  if (result?.sources?.model?.sha256 !== weatherSha) issues.push('analysed model file differs from validated file');
  const last = Date.parse(result?.analysis_window?.last_hour_utc || '');
  if (!Number.isFinite(last) || last > Date.parse(fetchedAt)) issues.push('analysis window ends after collection');
  if (!Number.isFinite(Date.parse(result?.timestamps?.analysis_at_utc || ''))) issues.push('analysis_at invalid');
  for (const p of POINTS) {
    const r = result?.points?.[p];
    if (!r) { issues.push(`points.${p} missing`); continue; }
    const lv = r.last_valid_weather_hour_utc;
    if (lv != null && Date.parse(lv) > last) issues.push(`${p}: last valid hour after window end`);
    if (!r.freshness?.status) issues.push(`${p}: freshness missing`);
  }
  return issues;
}

export async function runRegion(region, {collectFn = collect, multimodelFn = r => publishMultimodel(r), snowSurface = true} = {}) {
  const started = Date.now();
  const rec = {region, started_at_utc: new Date(started).toISOString(), steps: {}, ok: false, published: null};
  const fail = (step, detail) => { rec.steps[step] = {ok: false, ...detail}; rec.failed_step = step; return rec; };
  const prev = publishedPath(region);
  rec.previous_published_kept = existsSync(prev) ? rel(prev) : null;

  // 1. collect
  const c = await collectFn(region);
  rec.steps.collect = {ok: Boolean(c.published), ...c};
  if (!c.published) return fail('collect', c);

  // 2. validate forecast
  const weatherFile = path.join(ROOT, 'dist/data/weather', `${region}.json`);
  let weatherBuf, weather;
  try { weatherBuf = readFileSync(weatherFile); weather = JSON.parse(weatherBuf); } catch (e) { return fail('validate_weather', {issues: [`read/parse: ${e.message}`]}); }
  const wIssues = validateWeather(weather, {region, notBeforeMs: started - 1000, nowMs: Date.now()});
  if (wIssues.length) return fail('validate_weather', {issues: wIssues, fetched_at: weather.fetched_at});
  rec.steps.validate_weather = {ok: true, fetched_at: weather.fetched_at, sha256: sha256(weatherBuf)};

  // 2b. multi-model SERVICE forecast (dist/data/weather-multimodel/<region>.json): computed from the validated Best Match
  // file + fresh model runs, validated, then written atomically. A failure keeps the previous multi-model file and does
  // not stop this region (the app falls back to Best Match when that file is rejected or older than Best Match).
  try {
    const {mm, issues} = await multimodelFn(region);
    if (issues.length) rec.steps.multimodel_service = {ok: false, issues, previous_kept: existsSync(mmOutPath(region))};
    else {
      writeJsonAtomic(mmOutPath(region), mm, {compact: true});
      rec.steps.multimodel_service = {ok: true, file: rel(mmOutPath(region)), source_hours: mm.multimodel.source_hours.summit};
    }
  } catch (e) { rec.steps.multimodel_service = {ok: false, error: String(e?.message || e).slice(0, 300), previous_kept: existsSync(mmOutPath(region))}; }

  // --no-snow-surface (CI): the app no longer shows the snow-surface estimate, so it is not generated. The region is ok
  // only when BOTH service files (Best Match + multi-model) were validated in this run.
  if (!snowSurface) {
    rec.ok = rec.steps.multimodel_service.ok === true;
    if (!rec.ok) rec.failed_step = 'multimodel_service';
    return rec;
  }

  // 3. analyse (engine rules unchanged)
  let result;
  try { result = runEngine(loadInputs(region, Date.now())); } catch (e) { return fail('analyse', {error: String(e.message).slice(0, 300)}); }
  rec.steps.analyse = {ok: true};

  // 4. validate result
  const rIssues = validateResult(result, {region, weatherSha: sha256(weatherBuf), fetchedAt: weather.fetched_at});
  if (rIssues.length) return fail('validate_result', {issues: rIssues});
  rec.steps.validate_result = {ok: true};

  // 5. write analysis + publish (both atomic). Work file first: the published file points at it by sha256.
  try {
    const workFile = path.join(ROOT, 'work/weather', `${region}-snow-surface-pipeline.json`);
    writeJsonAtomic(workFile, result);
    const buf = readFileSync(workFile);
    const out = buildPublished(JSON.parse(buf), buf, workFile, region);
    writeJsonAtomic(prev, out);
    rec.steps.publish = {ok: true, analysis_file: rel(workFile), published_file: rel(prev)};
    rec.published = rel(prev);
    rec.previous_published_kept = null;
    rec.timestamps = result.timestamps;
    rec.points = Object.fromEntries(POINTS.map(p => [p, {primary_state: out.points[p]?.primary_state ?? null, reason: out.points[p]?.reason ?? null,
      freshness: out.points[p]?.freshness?.status ?? null, modifiers: out.points[p]?.modifiers ?? []}]));
  } catch (e) { return fail('publish', {error: String(e.message).slice(0, 300)}); }
  rec.ok = true;
  return rec;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const all = Object.keys(primarySkiAreas);
  const regions = !args.length || args.includes('all') ? all : args;
  const unknown = regions.filter(r => !all.includes(r));
  if (unknown.length) { console.error(`unknown region(s): ${unknown.join(', ')}`); process.exit(2); }
  // --multimodel: after a successful service publish, also build the internal multi-model validation JSON
  // (work/weather/<region>-multimodel.json). Its failure is recorded but never changes the region's ok status.
  // API usage log: every request made in this process (multi-model data + run meta) is counted with its outcome.
  const usage = {requests: 0, by_host: {}, ok: 0, http_429: 0, http_5xx: 0, http_other: 0, network_or_timeout: 0};
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const host = (() => { try { return new URL(String(url)).host; } catch { return '?'; } })();
    usage.requests++; usage.by_host[host] = (usage.by_host[host] || 0) + 1;
    try {
      const res = await realFetch(url, opts);
      if (res.ok) usage.ok++; else if (res.status === 429) usage.http_429++; else if (res.status >= 500) usage.http_5xx++; else usage.http_other++;
      return res;
    } catch (e) { usage.network_or_timeout++; throw e; }
  };
  const withMultimodel = process.argv.includes('--multimodel');
  const snowSurface = !process.argv.includes('--no-snow-surface');
  const runs = [];
  for (const region of regions) {
    let rec;
    try { rec = await runRegion(region, {snowSurface}); } catch (e) { rec = {region, ok: false, failed_step: 'unexpected', error: String(e?.message || e).slice(0, 300)}; }
    if (withMultimodel && rec.ok) {
      try {
        const {runMultiModel} = await import('./weather-multimodel-engine.mjs');
        const file = writeJsonAtomic(path.join(ROOT, 'work/weather', `${region}-multimodel.json`), await runMultiModel(region));
        rec.multimodel = {ok: true, file: rel(file), service_use: false};
      } catch (e) { rec.multimodel = {ok: false, error: String(e?.message || e).slice(0, 300)}; }
    }
    runs.push(rec);
    console.log(JSON.stringify({region, ok: rec.ok, failed_step: rec.failed_step ?? null,
      multimodel_service: rec.steps?.multimodel_service ? {ok: rec.steps.multimodel_service.ok, hours: rec.steps.multimodel_service.source_hours ?? null, issues: rec.steps.multimodel_service.issues ?? rec.steps.multimodel_service.error ?? null} : null,
      points: rec.points ?? null,
      issues: rec.failed_step ? (rec.steps?.[rec.failed_step]?.issues ?? rec.steps?.[rec.failed_step]?.errors ?? rec.error ?? null) : null}));
  }
  // Collector runs in child processes: its Open-Meteo requests are estimated from its own output (points received +
  // points failed; retries inside the collector are not visible). DEM checks are cached in weather-regions.mjs.
  // The collector now reports its real attempt count (retries included) in `network.attempts`.
  const collectorEstimate = runs.reduce((a, r) => a + (r.steps?.collect?.network?.attempts ?? r.steps?.collect?.points_requested ?? 0), 0);
  const api_usage = {in_process: usage, collector_requests_estimated: collectorEstimate, dem_requests_estimated: 0,
    total_estimated: usage.requests + collectorEstimate};
  const summary = {schema_version: 1, started_at_utc: runs[0]?.started_at_utc ?? null, run_at_utc: new Date().toISOString(), snow_surface: snowSurface, api_usage, regions: runs,
    ok: runs.filter(r => r.ok).map(r => r.region), failed: runs.filter(r => !r.ok).map(r => r.region)};
  writeJsonAtomic(path.join(ROOT, 'work/weather', 'weather-pipeline-last-run.json'), summary);
  console.log(JSON.stringify({ok: summary.ok, failed: summary.failed, api_usage}));
  if (process.env.GITHUB_STEP_SUMMARY) {
    // Failed regions with the concrete network cause per point (job summary is visible without downloading logs).
    const failedLines = runs.filter(r => !r.ok).map(r => {
      const c = r.steps?.collect;
      const pts = (c?.errors || []).map(e => `${e.point_id}: ${e.kind || ''}${e.code ? ` ${e.code}` : ''}${e.http ? ` HTTP ${e.http}` : ''} after ${e.attempts ?? '?'} attempt(s) (${e.gave_up || 'failed'}) - ${String(e.error || '').slice(0, 160)}`);
      return `- ${r.region}: failed at ${r.failed_step || 'unknown'}${c?.signal ? ` (collector ${c.signal})` : ''}${pts.length ? `\n  - ${pts.join('\n  - ')}` : ''}`;
    });
    const retried = runs.reduce((a, r) => a + (r.steps?.collect?.network?.retried_points ?? 0), 0);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `api usage: ${JSON.stringify(api_usage)} · collector points retried: ${retried}\n\n${failedLines.length ? `failed regions (previous files kept):\n${failedLines.join('\n')}\n\n` : ''}`);
  }
  if (summary.failed.length) process.exitCode = 1;
}
