// CI staging for weather-update.yml: decide which data files may be committed after a pipeline run, restore the
// last committed version of everything else, and `git add` only validated files (one commit for all of them).
//   dist/data/weather/<r>.json            only if the Best Match forecast was validated in THIS run
//   dist/data/weather-multimodel/<r>.json only if the multi-model file was validated in THIS run and was built from
//                                         exactly that Best Match file (sha256)
//   dist/data/weather-source.json         only if it is a valid switch file (never generated here)
// Snow-surface and work/ files are never staged.
// Usage: node scripts/weather-ci-stage.mjs [--not-before=ISO] [--dry-run]
// Writes $GITHUB_OUTPUT changed=true|false and a markdown table to $GITHUB_STEP_SUMMARY when those are set.
import {readFileSync, existsSync, appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {primarySkiAreas} from './weather-points.mjs';
import {validateWeather} from './weather-pipeline.mjs';
import {validateService} from './weather-multimodel-publish.mjs';
import {writeJsonAtomic} from './snow-surface-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const weatherRel = r => `dist/data/weather/${r}.json`;
const mmRel = r => `dist/data/weather-multimodel/${r}.json`;
export const SOURCE_REL = 'dist/data/weather-source.json';

// ---- "Did the forecast really change?" (hourly runs often see no new model run) ----
// Collection metadata (fetched_at, the 15-min "current" nowcast, validation timestamps) is ignored; forecast values,
// time axes, sources, weights and model run ids are compared. The time axis still forces an update when the committed
// file's "now" slot is >= MAX_SLOT_DRIFT_H behind, its local date is another day, or it is >= MAX_AGE_H old (stays
// below the UI's 6 h "이전" label).
export const MAX_SLOT_DRIFT_H = 3, MAX_AGE_H = 5;
const HOUR = 3600e3;
export function contentSignature(json, kind) {
  const pick = kind === 'multimodel'
    ? {hourly: json.hourly, daily: json.daily, points: json.points, source: json.multimodel?.hourly_source, weights: json.multimodel?.hourly_weights,
      runs: Object.fromEntries(Object.entries(json.multimodel?.model_runs || {}).map(([id, r]) => [id, Object.fromEntries(Object.entries(r.components || {}).map(([n, c]) => [n, c.initialisation_utc ?? null]))]))}
    : {hourly: json.hourly, daily: json.daily, points: json.points, units: json.units, timezone: json.timezone};
  return sha256(Buffer.from(JSON.stringify(pick)));
}
export function timeAxisMoved(prev, next, nowMs) {
  const slot = j => Math.ceil(Date.parse(j?.current?.summit?.forecast_time || '') / HOUR);
  const a = slot(prev), b = slot(next);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'current slot unknown';
  if (Math.abs(b - a) >= MAX_SLOT_DRIFT_H) return `current slot moved ${b - a} h`;
  if ((prev.current.summit.forecast_time || '').slice(0, 10) !== (next.current.summit.forecast_time || '').slice(0, 10)) return 'local date changed';
  const age = (nowMs - Date.parse(prev.fetched_at)) / HOUR;
  if (!(age < MAX_AGE_H)) return `committed file ${Math.round(age * 10) / 10} h old`;
  return null;
}

// Pure decision: summary of the pipeline run + file reader -> per-region keep/restore plan. No git, no writes.
// readHead(rel) -> committed bytes (or null); used only for the "unchanged forecast" check.
export function decide(summary, {regions, notBeforeMs, read, readHead = () => null, nowMs = Date.now()}) {
  const plan = {stage: [], restore: [], regions: {}, errors: []};
  const started = Date.parse(summary?.started_at_utc || summary?.run_at_utc || '');
  if (!summary || !Array.isArray(summary.regions)) { plan.errors.push('pipeline summary missing'); }
  else if (!Number.isFinite(started) || started < notBeforeMs) { plan.errors.push('pipeline summary is older than this job (pipeline did not run)'); }
  for (const r of regions) {
    const rec = plan.errors.length ? null : summary.regions.find(x => x.region === r);
    const res = {best_match: false, multimodel: false, reasons: [], collected_at: null, published_at: null};
    let bmBuf = null;
    if (rec?.steps?.validate_weather?.ok) {
      bmBuf = read(weatherRel(r));
      if (!bmBuf) res.reasons.push('best match file missing');
      else if (sha256(bmBuf) !== rec.steps.validate_weather.sha256) res.reasons.push('best match file changed after validation');
      else {
        const bm = JSON.parse(bmBuf);
        const issues = validateWeather(bm, {region: r, notBeforeMs: Date.parse(rec.started_at_utc) - 1000, nowMs: Date.now() + 60e3});
        if (issues.length) res.reasons.push(`best match: ${issues.join('; ')}`);
        else { res.best_match = true; res.collected_at = bm.fetched_at; }
      }
    } else res.reasons.push(rec ? `best match not validated (${rec.failed_step || 'unknown'})` : 'region not in this run');
    if (res.best_match && rec.steps?.multimodel_service?.ok) {
      const buf = read(mmRel(r));
      try {
        const mm = JSON.parse(buf);
        const bm = JSON.parse(bmBuf);
        const issues = validateService(mm, bm);
        if (!buf) res.reasons.push('multimodel file missing');
        else if (mm.multimodel?.best_match_source?.sha256 !== sha256(bmBuf)) res.reasons.push('multimodel not built from this best match file');
        else if (issues.length || mm.multimodel?.validation?.ok !== true) res.reasons.push(`multimodel: ${issues.join('; ') || 'validation flag false'}`);
        else { res.multimodel = true; res.published_at = mm.fetched_at; }
      } catch (e) { res.reasons.push(`multimodel unreadable: ${e.message}`); }
    } else if (res.best_match) res.reasons.push(`multimodel not validated (${JSON.stringify(rec.steps?.multimodel_service?.issues ?? rec.steps?.multimodel_service?.error ?? 'missing')})`.slice(0, 300));
    // Never replace committed data with an OLDER result (late arrival): Best Match collection time and model run ids.
    {
      const hb = readHead(weatherRel(r)), hm = readHead(mmRel(r));
      try {
        if (res.best_match && hb && Date.parse(JSON.parse(bmBuf).fetched_at) < Date.parse(JSON.parse(hb).fetched_at)) {
          res.best_match = false; res.multimodel = false; res.reasons.push('older than the committed Best Match file (late result)');
        }
        if (res.multimodel && hm) {
          const runsOf = j => j?.multimodel?.model_runs || {};
          const nr = runsOf(JSON.parse(read(mmRel(r)))), pr = runsOf(JSON.parse(hm));
          const older = Object.entries(nr).flatMap(([id, x]) => Object.entries(x.components || {}).filter(([n, c]) => c.initialisation_utc && pr[id]?.components?.[n]?.initialisation_utc && Date.parse(c.initialisation_utc) < Date.parse(pr[id].components[n].initialisation_utc)).map(([n]) => `${id}/${n}`));
          if (older.length) { res.multimodel = false; res.reasons.push(`multimodel uses older model runs than committed (${older.join(', ')})`); }
        }
      } catch (e) { res.reasons.push(`late-result check failed: ${e.message}`); }
    }
    // Same forecast as the committed pair and the time axis has not moved enough -> keep the committed files.
    if (res.best_match && res.multimodel) {
      const hb = readHead(weatherRel(r)), hm = readHead(mmRel(r));
      if (hb && hm) {
        try {
          const nb = JSON.parse(bmBuf), nm = JSON.parse(read(mmRel(r))), pb = JSON.parse(hb), pm = JSON.parse(hm);
          const same = contentSignature(nb, 'best_match') === contentSignature(pb, 'best_match') && contentSignature(nm, 'multimodel') === contentSignature(pm, 'multimodel');
          const moved = timeAxisMoved(pm, nm, nowMs);
          res.content = same ? (moved ? `same forecast, time axis: ${moved}` : 'same forecast') : 'forecast changed';
          if (same && !moved) { res.best_match = false; res.multimodel = false; res.unchanged = true; }
        } catch (e) { res.content = `compare failed: ${e.message}`; }
      } else res.content = 'not committed before';
    }
    // Regions keeping their previous files: say how old they are and how much forecast is left.
    if (!res.best_match || !res.multimodel) {
      try {
        const kept = JSON.parse(readHead(mmRel(r)) || readHead(weatherRel(r)) || 'null');
        if (kept) {
          res.kept_age_h = Math.round((nowMs - Date.parse(kept.fetched_at)) / HOUR * 10) / 10;
          res.kept_forecast_left_h = Math.round((Date.parse(kept.hourly.time.at(-1)) - nowMs) / HOUR);
          if (!res.unchanged && res.kept_age_h >= 6) res.reasons.push(`kept file is ${res.kept_age_h} h old (UI shows "이전")`);
          if (res.kept_forecast_left_h < 72) res.reasons.push(`kept file has only ${res.kept_forecast_left_h} h of forecast left`);
        }
      } catch { /* no committed file */ }
    }
    (res.best_match ? plan.stage : plan.restore).push(weatherRel(r));
    (res.multimodel ? plan.stage : plan.restore).push(mmRel(r));
    plan.regions[r] = res;
  }
  const src = read(SOURCE_REL);
  try { const s = JSON.parse(src); if (['multimodel', 'best_match'].includes(s.primary)) plan.stage.push(SOURCE_REL); else plan.errors.push('weather-source.json: invalid primary'); }
  catch { plan.errors.push('weather-source.json missing or invalid'); }
  if (plan.errors.length) { plan.restore.push(...plan.stage.filter(f => f !== SOURCE_REL)); plan.stage = plan.stage.filter(f => f === SOURCE_REL); }
  return plan;
}

const git = (...args) => execFileSync('git', args, {cwd: ROOT, encoding: 'utf8'}).trim();
const tracked = rel => { try { git('ls-files', '--error-unmatch', rel); return true; } catch { return false; } };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes('--dry-run');
  const nb = process.argv.find(a => a.startsWith('--not-before='))?.slice(13) || process.env.WEATHER_JOB_STARTED_UTC;
  const notBeforeMs = nb ? Date.parse(nb) - 60e3 : 0;
  const summaryPath = path.join(ROOT, 'work/weather/weather-pipeline-last-run.json');
  const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : null;
  const read = rel => (existsSync(path.join(ROOT, rel)) ? readFileSync(path.join(ROOT, rel)) : null);
  const readHead = rel => { try { return execFileSync('git', ['show', `HEAD:${rel}`], {cwd: ROOT, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore']}); } catch { return null; } };
  const plan = decide(summary, {regions: Object.keys(primarySkiAreas), notBeforeMs, read, readHead});
  const actions = [];
  for (const rel of plan.restore) {
    if (!existsSync(path.join(ROOT, rel)) && !tracked(rel)) continue;
    if (tracked(rel)) { actions.push(`restore ${rel} from HEAD`); if (!dry) git('checkout', 'HEAD', '--', rel); }
    else actions.push(`leave untracked ${rel} (not staged)`);
  }
  for (const rel of plan.stage) { actions.push(`stage ${rel}`); if (!dry) git('add', '--', rel); }
  // Only staged data counts; "changed" = the index differs from HEAD for these paths.
  let changed = false;
  if (!dry) { try { git('diff', '--cached', '--quiet', '--', ...plan.stage); } catch { changed = true; } }
  const out = {ran_at: new Date().toISOString(), dry_run: dry, changed, errors: plan.errors, regions: plan.regions, actions};
  writeJsonAtomic(path.join(ROOT, 'work/weather', 'weather-ci-stage.json'), out);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const st = (x, ok) => (x.unchanged ? 'unchanged' : ok ? 'ok' : 'kept previous');
    const rows = Object.entries(plan.regions).map(([r, x]) => `| ${r} | ${st(x, x.best_match)} | ${st(x, x.multimodel)} | ${x.collected_at ?? '-'} | ${x.published_at ?? '-'} | ${[x.content, ...x.reasons].filter(Boolean).join('; ').replace(/\|/g, '/') || '-'} |`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### Weather data staging', `changed: ${changed}${plan.errors.length ? ` — errors: ${plan.errors.join('; ')}` : ''}`, '',
      '| region | best match | multi-model | collected (UTC) | multi-model published (UTC) | notes |', '|---|---|---|---|---|---|', ...rows, ''].join('\n'));
  }
  console.log(JSON.stringify({changed, errors: plan.errors, regions: Object.fromEntries(Object.entries(plan.regions).map(([r, x]) => [r, `${x.unchanged ? 'unchanged' : `${x.best_match ? 'BM' : '-'}/${x.multimodel ? 'MM' : '-'}`}${x.content ? ` (${x.content})` : ''}`]))}));
  for (const a of actions) console.log(' ', a);
  if (plan.errors.length) process.exitCode = 1; // e.g. pipeline did not run: fail the job visibly, nothing committed
}
