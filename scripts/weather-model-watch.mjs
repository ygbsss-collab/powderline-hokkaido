// POWDERLINE model-run watch (decision logic + storage interfaces; NOT wired into the collector / CI yet).
// A 30-minute check decides, per region × model × point, whether a multi-model source must be (re)collected:
//   new run       : current run (Open-Meteo meta.json) differs from the item's last successful run, its availability
//                   time is VERIFIED (availabilityCheck) and >= SETTLE_MS (10 min) old -> collect
//   retry failed  : the item failed for the current run -> collect again; the first MAX_ATTEMPTS_PER_RUN attempts run on
//                   every check, later ones wait an exponential backoff (never stopped for good)
//   up to date    : the item already holds the current run -> skip (no duplicate collection)
//   meta failure  : NO new run is ever started. Only items not yet completed for the LAST VERIFIED run are recovered,
//                   and only while that run is still the expected latest one (recoveryAllowed). Such a recovered
//                   original is kept as `pending` (unconfirmed): never used for calculation / publication until a
//                   later check verifies that run again (confirmPending); otherwise it is discarded.
//   regressed     : the server reports a run OLDER than the one known -> skip (same rule as regressedModels())
//   daily budget  : planned items are cut when their weighted cost would exceed the remaining daily budget
// A success counts only with a stored, hash-verified original (raw); the original's own run is kept as raw.run_key.
// Best Match is a composite without a single run (META_MODELS.best_match = []): never planned here, it keeps the
// existing 2 h policy (.github/workflows/weather-update.yml); its usage is reserved out of the budget (watchBudget).
// Meta is read with the existing modelRunInfo() / fetchRunMeta(); every HTTP attempt gets a request id and is recorded
// once (usage log, idempotent), separately from the lease-guarded state commit (runCheck).
// Times, never mixed:
//   run_initialisation_utc / run_available_utc : model run time (Open-Meteo meta.json)
//   collected_at_utc                           : when this watch fetched one model / point original
//   fetched_at (service JSON, unchanged)       : final calculation / publication time of the region file. The app uses
//     it for 6 h staleness, newest-file-wins (remote / saved / bundled) and the multi-model vs Best Match age check;
//     weather-ci-stage for kept-file age. Its meaning is NOT changed here.
//   published_at (prepared, optional field)    : same instant as fetched_at when added; publishedAtOf() reads
//     published_at ?? fetched_at. Follow-up rule for the app: the home banner and the detail page must both show
//     publishedAtOf(final JSON) — never a model collection time — so they always agree.
// Nothing here changes weights, formulas, the service JSON, the publish path or the 72 h history policy.
import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {META_MODELS, FETCH_VARS, modelRunInfo, fetchRunMeta} from './weather-multimodel-publish.mjs';
import {loadConfig, countryOf, profileConfig, profileModels} from './weather-multimodel-engine.mjs';
import {LIMITS, weight, perRegion} from './weather-api-usage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 60e3, HOUR = 3600e3;
export const WATCH_MODELS = ['jma_msm', 'ecmwf_ifs025', 'gfs_seamless'];
export const POINTS = ['summit', 'mid', 'base'];
export const SETTLE_MS = 10 * MIN;
export const MAX_ATTEMPTS_PER_RUN = 3; // attempts on consecutive checks; afterwards backoff (not a stop)
export const BACKOFF = {base_ms: 60 * MIN, max_ms: 6 * HOUR}; // attempt 4 waits 1 h, 5: 2 h, 6: 4 h, then 6 h
export const RAW_KEEP_MS = 72 * HOUR; // same 72 h history window; current confirmed / pending originals always kept
export const LEASE_TTL_S = 25 * 60; // one check at a time; shorter than the 30 min cadence
export const LEASE_RENEW_MS = 5 * MIN; // renewed at least this often while collecting, and right before the commit
// Freshness: an original is usable while its run is at most FRESH_RUNS update intervals (+ grace) past availability,
// i.e. one missed run is tolerated, two are not. Interval from meta (update_interval_h), else these defaults.
export const DEFAULT_INTERVAL_H = {jma_msm: 3, ecmwf_ifs025: 6, gfs_seamless: 6};
export const FRESH_RUNS = 2;
export const FRESH_GRACE_MS = HOUR;
export const STATE_KIND = 'powderline_model_watch_state';
export const STATE_PATH = path.join(ROOT, 'work/weather/model-watch-state.json');
const iso = ms => new Date(ms).toISOString();
const dayOf = ms => iso(ms).slice(0, 10); // UTC day (Open-Meteo daily limit is counted per day)
const r2 = v => Math.round(v * 100) / 100;
const sha256 = buf => createHash('sha256').update(buf).digest('hex');

// Unique per process / run (GitHub: run id + attempt), so a lease is never "renewed" by another runner.
export const runnerId = (env = process.env) =>
  [env.GITHUB_RUN_ID ? `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT || 1}` : 'local', randomUUID()].join(':');

// ---- State (plain JSON; rows of supabase/deferred/20261120000000_weather_model_watch.sql map 1:1) ----
// {
//   data_kind, schema_version, updated_at_utc,
//   models:  { <model>: { run_key, components, run_initialisation_utc, run_available_utc, availability_verified,
//                         update_interval_h, checked_at_utc, meta_status } },   // last VERIFIED run only
//   targets: { <region>: { <model>: { <point>: {
//       status: 'ok' | 'failed' | 'unconfirmed',
//       run_key,                 // run of the last attempt
//       last_success_run_key,    // confirmed run; always === raw.run_key when raw exists
//       run_initialisation_utc,  // model run time of last_success_run_key
//       attempts, failures_total, next_attempt_utc, last_attempt_utc, last_success_utc, error,
//       raw:     {path, sha256, bytes, collected_at_utc, run_key, run_available_utc} | null   // confirmed, usable
//       pending: {path, sha256, bytes, collected_at_utc, run_key, run_available_utc} | null   // NOT usable
//   } } } },
//   usage: { <YYYY-MM-DD>: { checks, meta_requests, meta_failed, forecast_requests, forecast_weighted } }  // DB daily
// }
export const emptyState = () => ({data_kind: STATE_KIND, schema_version: 1, updated_at_utc: null, models: {}, targets: {}, usage: {}});

export function loadState(file = STATE_PATH) {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8'));
    return s?.data_kind === STATE_KIND && s.schema_version === 1 ? {...emptyState(), ...s} : emptyState();
  } catch { return emptyState(); }
}

// Content-addressed original path: a different body of the same run never overwrites an existing object.
export const rawRef = (region, model, point, runKey, hash) =>
  `model-raw/${region}/${model}/${point}/${String(runKey).replace(/[^0-9A-Za-z_-]+/g, '_')}/${hash}.json`;
// Model run time of a run key (latest component initialisation).
export const runInitialisation = runKey => {
  const t = String(runKey || '').split('|').map(x => Date.parse(x.slice(x.indexOf('@') + 1))).filter(Number.isFinite);
  return t.length ? iso(Math.max(...t)) : null;
};
export const publishedAtOf = json => json?.published_at ?? json?.fetched_at ?? null;

// ---- Run identification ----
// Availability is verified only when the meta file states it explicitly (not modification time), it parses, it is not
// before the run's initialisation and not in the future (5 min clock tolerance).
export function availabilityCheck(m, now) {
  const init = Date.parse(m?.initialisation_utc || ''), avail = Date.parse(m?.availability_utc || '');
  if (!Number.isFinite(avail)) return {verified: false, reason: 'availability time missing'};
  if (!Number.isFinite(init) || avail < init) return {verified: false, reason: 'availability before initialisation'};
  if (avail > now + 5 * MIN) return {verified: false, reason: 'availability in the future'};
  return {verified: true, ms: avail};
}

// Current run of one model from modelRunInfo() output. Every component must be readable; the key joins all components'
// initialisation times (GFS = two components), so any component update is a new run.
export function currentRun(info, now = Date.now()) {
  if (!info?.identifiable) return {status: 'not_identifiable', run_key: null};
  const entries = Object.entries(info.components || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return {status: 'meta_unavailable', run_key: null, reason: 'no meta component'};
  const bad = entries.filter(([, m]) => !m?.ok || !m.initialisation_utc);
  if (bad.length) return {status: 'meta_unavailable', run_key: null, reason: bad.map(([n, m]) => `${n}: ${m?.error || 'no initialisation time'}`).join('; ')};
  const checks = entries.map(([, m]) => availabilityCheck(m, now));
  const verified = checks.every(c => c.verified);
  const intervals = entries.map(([, m]) => m.update_interval_h).filter(Number.isFinite);
  const runKey = entries.map(([n, m]) => `${n}@${m.initialisation_utc}`).join('|');
  return {
    status: 'identified',
    run_key: runKey,
    components: Object.fromEntries(entries.map(([n, m]) => [n, {initialisation_utc: m.initialisation_utc, availability_utc: m.availability_utc || null}])),
    run_initialisation_utc: runInitialisation(runKey),
    run_available_utc: verified ? iso(Math.max(...checks.map(c => c.ms))) : null,
    availability_verified: verified,
    availability_reason: verified ? null : checks.find(c => !c.verified).reason,
    update_interval_h: intervals.length ? Math.min(...intervals) : null
  };
}

// Component-wise: true when any component of `next` is older than the same component of `prev`.
export function isRegressed(nextKey, prevKey) {
  if (!nextKey || !prevKey) return false;
  const parse = k => Object.fromEntries(k.split('|').map(x => { const i = x.indexOf('@'); return [x.slice(0, i), Date.parse(x.slice(i + 1))]; }));
  const n = parse(nextKey), p = parse(prevKey);
  return Object.keys(n).some(c => Number.isFinite(p[c]) && n[c] < p[c]);
}

// Meta outage: recovering the last verified run is safe only while no newer run is expected yet (the server is then
// still serving that run). Needs a verified availability time and a known update interval.
export function recoveryAllowed(known, now) {
  if (!known?.run_key || !known.availability_verified) return {ok: false, reason: 'no verified run'};
  const avail = Date.parse(known.run_available_utc || '');
  if (!Number.isFinite(avail) || !Number.isFinite(known.update_interval_h)) return {ok: false, reason: 'update interval unknown'};
  const until = avail + known.update_interval_h * HOUR;
  return now < until ? {ok: true, until_utc: iso(until)} : {ok: false, reason: 'a newer run is expected (verified run may be superseded)'};
}

// A pending (unconfirmed) original is confirmed when the run is verified again AND it was collected after that run
// became available: the server then served exactly that run (not older: available; not newer: still current).
export function pendingConfirmable(pending, m) {
  if (!pending || m?.status !== 'identified' || !m.availability_verified || m.regressed) return false;
  return pending.run_key === m.run_key && Date.parse(pending.collected_at_utc) >= Date.parse(m.run_available_utc);
}

export const backoffMs = attempts => (attempts < MAX_ATTEMPTS_PER_RUN ? 0 : Math.min(BACKOFF.max_ms, BACKOFF.base_ms * 2 ** (attempts - MAX_ATTEMPTS_PER_RUN)));

// Freshness of one confirmed original at `now` (model run interval + real availability time of ITS run).
export function freshness(ref, model, now, intervalH = DEFAULT_INTERVAL_H[model]) {
  const avail = Date.parse(ref?.run_available_utc || '');
  if (!Number.isFinite(avail)) return {fresh: false, reason: 'run availability unknown'};
  if (!Number.isFinite(intervalH) || intervalH <= 0) return {fresh: false, reason: 'update interval unknown'};
  const maxMs = FRESH_RUNS * intervalH * HOUR + FRESH_GRACE_MS;
  const age = now - avail;
  return age <= maxMs ? {fresh: true, age_h: r2(age / HOUR), max_h: r2(maxMs / HOUR)} : {fresh: false, reason: 'stale run', age_h: r2(age / HOUR), max_h: r2(maxMs / HOUR)};
}

// ---- Cost / budget ----
// Weighted cost of one model request at one point, with the same rule and request shape as weather-api-usage.mjs.
export const itemCost = (model, cfg = loadConfig()) => weight(FETCH_VARS.length, cfg.models[model]?.forecast_days ?? 16);

// Daily budget of this watch without double counting. The 2 h pipeline's own usage is reserved, split into its two
// parts (weather-api-usage.mjs perRegion): the Best Match collector, always run by the pipeline, and its multi-model
// requests. mode 'parallel' = the pipeline still fetches the models itself (both are real requests, each counted
// once: pipeline in the reservation, watch in its own usage); 'replace' = the pipeline reuses the watch's originals,
// so only its collector part is reserved and the model requests are counted once, by the watch.
export function pipelineDaily(targets, {intervalH = 2, mode = 'parallel'} = {}) {
  const runs = 24 / intervalH;
  const per = {JP: perRegion('JP'), KR: perRegion('KR')};
  let collector = 0, models = 0;
  for (const t of targets) { const p = per[t.country]; if (!p) continue; collector += p.collector.weighted; models += p.multimodel.weighted; }
  return {collector: r2(collector * runs), multimodel: r2(models * runs), reserved: r2((collector + (mode === 'replace' ? 0 : models)) * runs), mode};
}
// Expected watch usage when every run of every model is collected once at every point (no retries).
export function watchExpectedDaily(targets, cfg = loadConfig(), intervalsH = DEFAULT_INTERVAL_H) {
  let w = 0;
  for (const t of targets) for (const m of t.models) w += t.points.length * itemCost(m, cfg) * (24 / intervalsH[m]);
  return r2(w);
}
export function watchBudget(targets, {mode = 'parallel', limit = LIMITS.per_day, share = 0.8, intervalH = 2} = {}) {
  const pipe = pipelineDaily(targets, {intervalH, mode});
  return {limit_weighted: Math.max(0, Math.floor(limit * share - pipe.reserved)), pipeline: pipe, expected_watch: watchExpectedDaily(targets),
    total_expected: r2(pipe.reserved + watchExpectedDaily(targets)), daily_limit: limit};
}

// ---- Targets ----
// Regions to watch: [{region, country, models: [watched model ids of its country profile], points}].
export function regionTargets(regionIds, {readBm = id => JSON.parse(readFileSync(path.join(ROOT, 'dist/data/weather', `${id}.json`), 'utf8')), cfg = loadConfig()} = {}) {
  const out = [];
  for (const region of regionIds) {
    let bm;
    try { bm = readBm(region); } catch { continue; }
    const ref = bm?.points?.find(p => p.point_type === 'summit') || bm?.points?.[0];
    const country = countryOf(cfg, region, Number(ref?.latitude), Number(ref?.longitude));
    if (!country) continue; // no multi-model policy -> nothing to watch (same rule as publishRegion)
    const models = Object.keys(profileModels(profileConfig(cfg, country))).filter(id => WATCH_MODELS.includes(id));
    const points = POINTS.filter(p => bm.points?.some(x => x.point_type === p));
    out.push({region, country, models, points});
  }
  return out;
}

// ---- Decision (pure) ----
// meta = modelRunInfo() output; metaUsage = readMeta().usage; budget = {limit_weighted, cost(model)}.
const PRIORITY = {retry_failed: 0, recover_unverified_meta: 1, new_run: 2, first_collection: 3};
export function planCollection({state = emptyState(), meta = {}, targets = [], now = Date.now(), settleMs = SETTLE_MS,
  budget = null, metaUsage = null}) {
  const models = {};
  for (const id of WATCH_MODELS) {
    const cur = currentRun(meta[id], now);
    const known = state.models?.[id] || null;
    const availMs = Date.parse(cur.run_available_utc || '');
    const regressed = cur.status === 'identified' && isRegressed(cur.run_key, known?.run_key);
    models[id] = {...cur, previous_run_key: known?.run_key || null,
      new_run: cur.status === 'identified' && cur.run_key !== known?.run_key && !regressed, regressed,
      settled: cur.status === 'identified' && cur.availability_verified && Number.isFinite(availMs) && now - availMs >= settleMs,
      ready_at_utc: Number.isFinite(availMs) ? iso(availMs + settleMs) : null,
      recovery: cur.status === 'meta_unavailable' ? {...recoveryAllowed(known, now), run_key: known?.run_key || null, run_available_utc: known?.run_available_utc || null} : null};
  }
  const wanted = [], skip = [];
  for (const t of targets) for (const model of t.models) for (const point of t.points) {
    const m = models[model];
    const item = state.targets?.[t.region]?.[model]?.[point] || null;
    const why = (reason, runKey = m?.run_key ?? null, extra = {}) => skip.push({region: t.region, model, point, run_key: runKey, reason, ...extra});
    const want = (reason, runKey, extra = {}) => wanted.push({region: t.region, model, point, run_key: runKey, reason, ...extra});
    const waiting = () => {
      if (item?.status !== 'failed') return false;
      const next = Date.parse(item.next_attempt_utc || '');
      if (Number.isFinite(next) && now < next) { why('backoff', item.run_key, {next_attempt_utc: item.next_attempt_utc}); return true; }
      return false;
    };
    if (!m || m.status === 'not_identifiable') { why('not_identifiable'); continue; }
    if (m.status === 'meta_unavailable') {
      // Never a new run. Only the last verified run, only items not completed for it, only while it is still current.
      const rk = m.recovery?.run_key;
      if (!m.recovery?.ok) { why('meta_unavailable', null, {recovery: m.recovery?.reason}); continue; }
      if (item?.last_success_run_key === rk) { why('up_to_date', rk); continue; }
      if (item?.pending?.run_key === rk) { why('pending_confirmation', rk); continue; } // already recovered once
      if (isRegressed(rk, item?.last_success_run_key)) { why('regressed_run', rk); continue; }
      if (waiting()) continue;
      want('recover_unverified_meta', rk, {run_available_utc: m.recovery.run_available_utc,
        attempt: item?.run_key === rk && item?.status === 'failed' ? (item.attempts || 0) + 1 : 1});
      continue;
    }
    if (m.regressed || isRegressed(m.run_key, item?.last_success_run_key)) { why('regressed_run'); continue; }
    if (item?.last_success_run_key === m.run_key) { why('up_to_date'); continue; }
    if (pendingConfirmable(item?.pending, m)) { why('pending_confirmable'); continue; } // promoted by applyResults, no fetch
    if (!m.availability_verified) { why('availability_unverified', m.run_key, {detail: m.availability_reason}); continue; }
    if (!m.settled) { why('waiting_settle', m.run_key, {ready_at_utc: m.ready_at_utc}); continue; }
    if (item?.status === 'failed' && item.run_key === m.run_key) {
      if (waiting()) continue;
      want('retry_failed', m.run_key, {run_available_utc: m.run_available_utc, attempt: (item.attempts || 0) + 1});
      continue;
    }
    want(item ? 'new_run' : 'first_collection', m.run_key, {run_available_utc: m.run_available_utc, attempt: 1});
  }
  // Daily budget: highest priority first (recover what is incomplete before starting new runs), then cut.
  const collect = [];
  const used = state.usage?.[dayOf(now)]?.forecast_weighted || 0;
  let remaining = budget ? budget.limit_weighted - used : Infinity;
  wanted.sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason]);
  for (const w of wanted) {
    const cost = budget ? budget.cost(w.model) : 0;
    if (cost > remaining) { skip.push({...w, reason: 'budget_exceeded', cost}); continue; }
    remaining -= cost;
    collect.push(budget ? {...w, cost} : w);
  }
  return {checked_at_utc: iso(now), models, collect, skip, meta_usage: metaUsage,
    budget: budget ? {limit_weighted: budget.limit_weighted, used_before: used, planned: r2(budget.limit_weighted - used - remaining)} : null};
}

// Usage of one check as a DELTA (local mirror only; the DB counts the request log, see usageRequests()).
export function usageDelta(plan, results, now = Date.now()) {
  const planned = new Map(plan.collect.map(c => [`${c.region}|${c.model}|${c.point}`, c]));
  let requests = 0, weighted = 0;
  for (const r of results) {
    const p = planned.get(`${r.region}|${r.model}|${r.point}`);
    if (!p) continue;
    requests += r.requests ?? 1;
    weighted += (p.cost ?? 0) * (r.requests ?? 1);
  }
  return {day: dayOf(now), checks: 1, meta_requests: plan.meta_usage?.requests || 0, meta_failed: plan.meta_usage?.failed || 0,
    forecast_requests: requests, forecast_weighted: r2(weighted)};
}
// Request log rows (DB weather_usage_add): one row per real HTTP attempt, keyed by a stable request id, so a repeated
// add (retry of the DB call, a second runner re-sending) is counted once.
export const forecastRequests = (holder, item, attempts, now) => Array.from({length: attempts}, (_, k) => ({
  request_id: `${holder}:fc:${item.region}:${item.model}:${item.point}:${k + 1}`, day: dayOf(now), kind: 'forecast',
  weighted: item.cost ?? 0, failed: false, holder}));

// Applies one check to a copy of the state. results: [{region, model, point, ok, run_key?, error?, raw?, requests?}].
// raw = rawStore.put() ref (hash verified). A success without raw is recorded as a failure (no original, no success).
export function applyResults(state, plan, results, now = Date.now()) {
  const next = structuredClone(state || emptyState());
  const at = iso(now);
  next.models ||= {};
  next.targets ||= {};
  next.usage ||= {};
  for (const [id, m] of Object.entries(plan.models || {})) {
    // Only identified, VERIFIED, non-regressed runs replace the known run; other checks keep the last verified one.
    if (m.status === 'identified' && m.availability_verified && !m.regressed) {
      next.models[id] = {run_key: m.run_key, components: m.components, run_initialisation_utc: m.run_initialisation_utc,
        run_available_utc: m.run_available_utc, availability_verified: true, update_interval_h: m.update_interval_h, checked_at_utc: at, meta_status: m.status};
    } else if (next.models[id]) next.models[id] = {...next.models[id], checked_at_utc: at, meta_status: m.status === 'identified' ? (m.regressed ? 'regressed' : 'availability_unverified') : m.status};
  }
  // Pending originals: confirm (becomes the usable raw) or discard once the model's run is verified again.
  for (const reg of Object.values(next.targets)) for (const [model, mod] of Object.entries(reg)) for (const it of Object.values(mod)) {
    const m = plan.models?.[model];
    if (!it?.pending || m?.status !== 'identified' || !m.availability_verified || m.regressed) continue;
    if (pendingConfirmable(it.pending, m)) {
      const p = it.pending;
      Object.assign(it, {status: 'ok', run_key: p.run_key, last_success_run_key: p.run_key, run_initialisation_utc: runInitialisation(p.run_key),
        last_success_utc: p.collected_at_utc, attempts: 0, next_attempt_utc: null, error: null,
        raw: {...p, run_available_utc: m.run_available_utc}, pending: null});
    } else Object.assign(it, {pending: null, status: it.status === 'unconfirmed' ? (it.last_success_run_key ? 'ok' : 'failed') : it.status,
      error: it.status === 'unconfirmed' ? 'pending original discarded: run not confirmed' : it.error});
  }
  const d = usageDelta(plan, results, now);
  const day = (next.usage[d.day] ||= {checks: 0, meta_requests: 0, meta_failed: 0, forecast_requests: 0, forecast_weighted: 0});
  for (const k of ['checks', 'meta_requests', 'meta_failed', 'forecast_requests']) day[k] += d[k];
  day.forecast_weighted = r2(day.forecast_weighted + d.forecast_weighted);
  for (const k of Object.keys(next.usage).sort().slice(0, -3)) delete next.usage[k]; // keep 3 days locally
  const planned = new Map(plan.collect.map(c => [`${c.region}|${c.model}|${c.point}`, c]));
  for (const r of results) {
    const p = planned.get(`${r.region}|${r.model}|${r.point}`);
    if (!p) continue; // not planned in this check: ignored
    const runKey = r.run_key || p.run_key;
    const mod = ((next.targets[r.region] ||= {})[r.model] ||= {});
    const prev = mod[r.point] || {};
    const keep = {first_seen_utc: prev.first_seen_utc ?? at, last_success_run_key: prev.last_success_run_key ?? null, run_initialisation_utc: prev.run_initialisation_utc ?? null,
      last_success_utc: prev.last_success_utc ?? null, raw: prev.raw ?? null, failures_total: prev.failures_total || 0};
    const okRaw = r.ok && r.raw?.path && /^[0-9a-f]{64}$/.test(r.raw.sha256 || '');
    const file = okRaw ? {path: r.raw.path, sha256: r.raw.sha256, bytes: r.raw.bytes ?? null, collected_at_utc: r.raw.collected_at_utc || at,
      run_key: runKey, run_available_utc: p.run_available_utc ?? null} : null;
    if (okRaw && p.reason === 'recover_unverified_meta') {
      // Unconfirmed: the confirmed raw stays the one used for calculation; this original waits as `pending`.
      mod[r.point] = {...keep, status: 'unconfirmed', run_key: runKey, attempts: 0, next_attempt_utc: null, last_attempt_utc: at, error: null, pending: file};
    } else if (okRaw) {
      mod[r.point] = {...keep, status: 'ok', run_key: runKey, last_success_run_key: runKey, run_initialisation_utc: runInitialisation(runKey),
        attempts: 0, next_attempt_utc: null, last_attempt_utc: at, last_success_utc: file.collected_at_utc, error: null, raw: file, pending: null};
    } else {
      const attempts = (prev.run_key === runKey && prev.status === 'failed' ? prev.attempts || 0 : 0) + 1;
      const wait = backoffMs(attempts);
      mod[r.point] = {...keep, status: 'failed', run_key: runKey, attempts, failures_total: keep.failures_total + 1,
        next_attempt_utc: wait ? iso(now + wait) : null, last_attempt_utc: at,
        error: String(r.ok ? 'success without a verified original' : r.error || 'failed').slice(0, 300),
        pending: prev.pending ?? null}; // the last good original stays the one used for recalculation
    }
  }
  next.updated_at_utc = at;
  return next;
}

// ---- Meta reading with request counting (network; tests pass a fake fetch) ----
export async function readMeta({fetchImpl = fetch, metaFn = fetchRunMeta, holder = 'local', now = Date.now} = {}) {
  const usage = {requests: 0, failed: 0, by_name: {}, log: []};
  const counted = async (url, opts) => {
    const name = String(url).match(/\/data\/([^/]+)\//)?.[1] || 'unknown';
    usage.requests++;
    usage.by_name[name] = (usage.by_name[name] || 0) + 1;
    const row = {request_id: `${holder}:meta:${usage.requests}`, day: dayOf(now()), kind: 'meta', weighted: 0, failed: false, holder};
    usage.log.push(row);
    try { const res = await fetchImpl(url, opts); if (!res.ok) { usage.failed++; row.failed = true; } return res; }
    catch (e) { usage.failed++; row.failed = true; throw e; }
  };
  const meta = await modelRunInfo(name => metaFn(name, counted), WATCH_MODELS);
  return {meta, usage};
}

// ---- Original (raw) storage ----
// Interface: put({region, model, point, run_key, body, collected_at_utc}) -> {path, sha256, bytes, collected_at_utc, run_key}
//              (content-addressed; never overwrites; read back and hash-verified before it returns)
//            get(ref) -> body | null (sha256 checked)      list() -> [{path, created_at_utc}]
export function createFileRawStore(dir = path.join(ROOT, 'work/weather')) {
  const verify = (file, hash) => existsSync(file) && sha256(readFileSync(file)) === hash;
  return {
    put({region, model, point, run_key, body, collected_at_utc}) {
      const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const hash = sha256(buf);
      const rel = rawRef(region, model, point, run_key, hash);
      const file = path.join(dir, rel);
      mkdirSync(path.dirname(file), {recursive: true});
      if (!existsSync(file)) writeFileSync(file, buf, {flag: 'wx'}); // same hash already stored = same content
      if (!verify(file, hash)) throw new Error(`raw verification failed: ${rel}`);
      return {path: rel, sha256: hash, bytes: buf.length, collected_at_utc, run_key};
    },
    get(ref) { const file = path.join(dir, ref.path); return verify(file, ref.sha256) ? JSON.parse(readFileSync(file)) : null; },
    delete(rel) { if (!/^model-raw\//.test(rel)) throw new Error(`refusing to delete ${rel}`); rmSync(path.join(dir, rel), {force: true}); },
    list() {
      const out = [];
      const walk = rel => { const abs = path.join(dir, rel); if (!existsSync(abs)) return;
        for (const e of readdirSync(abs, {withFileTypes: true})) { const r = `${rel}/${e.name}`; if (e.isDirectory()) walk(r); else out.push({path: r, created_at_utc: iso(statSync(path.join(dir, r)).mtimeMs)}); } };
      walk('model-raw');
      return out;
    }
  };
}
// Supabase Storage (private bucket). Upload never overwrites (x-upsert: false; an existing object with the same
// content-addressed path is accepted only after its hash is verified).
export function createSupabaseRawStore({url, serviceKey, bucket = 'weather-raw', fetchImpl = fetch}) {
  const h = extra => ({apikey: serviceKey, authorization: `Bearer ${serviceKey}`, ...extra});
  const download = async p => { const r = await fetchImpl(`${url}/storage/v1/object/${bucket}/${p}`, {headers: h()}); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };
  return {
    async put({region, model, point, run_key, body, collected_at_utc}) {
      const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const hash = sha256(buf);
      const rel = rawRef(region, model, point, run_key, hash);
      const res = await fetchImpl(`${url}/storage/v1/object/${bucket}/${rel}`, {method: 'POST', body: buf, headers: h({'content-type': 'application/json', 'x-upsert': 'false'})});
      // Supabase Storage answers an existing object with HTTP 400 {"statusCode":"409","error":"Duplicate"} (some
      // versions: 409). Either way the object is accepted only if its downloaded bytes hash to the same sha256 below.
      if (!res.ok) {
        const text = res.status === 409 ? '' : await res.text().catch(() => '');
        if (!(res.status === 409 || (res.status === 400 && /"statusCode"\s*:\s*"409"|Duplicate|already exists/i.test(text)))) throw new Error(`raw upload ${rel}: HTTP ${res.status}`);
      }
      const back = await download(rel);
      if (!back || sha256(back) !== hash) throw new Error(`raw verification failed: ${rel}`);
      return {path: rel, sha256: hash, bytes: buf.length, collected_at_utc, run_key};
    },
    async get(ref) { const b = await download(ref.path); return b && sha256(b) === ref.sha256 ? JSON.parse(b) : null; },
    async delete(rel) { // originals bucket only, model-raw/ prefix only
      if (!/^model-raw\//.test(rel)) throw new Error(`refusing to delete ${rel}`);
      const r = await fetchImpl(`${url}/storage/v1/object/${bucket}`, {method: 'DELETE', headers: h({'content-type': 'application/json'}), body: JSON.stringify({prefixes: [rel]})});
      if (!r.ok) throw new Error(`raw delete ${rel}: HTTP ${r.status}`);
    },
    async list(prefix = 'model-raw') {
      const out = [];
      const walk = async p => {
        for (let offset = 0; ; offset += 1000) {
          const r = await fetchImpl(`${url}/storage/v1/object/list/${bucket}`, {method: 'POST', headers: h({'content-type': 'application/json'}), body: JSON.stringify({prefix: p, limit: 1000, offset})});
          if (!r.ok) throw new Error(`raw list ${p}: HTTP ${r.status}`);
          const rows = await r.json();
          for (const e of rows) { if (e.id == null) await walk(`${p}/${e.name}`); else out.push({path: `${p}/${e.name}`, created_at_utc: e.created_at}); }
          if (rows.length < 1000) break;
        }
      };
      await walk(prefix);
      return out;
    }
  };
}

// Inputs for a recalculation of one region: per model × point the last CONFIRMED good original whose own run matches
// last_success_run_key and is still FRESH at `now`. Pending, mismatched and stale originals are excluded (null), so
// the publisher applies its existing missing-model rules (min weight / Best Match fallback). Detailed variant lists why.
export function recomputeInputsDetailed(state, target, {now = Date.now()} = {}) {
  const inputs = {}, excluded = [];
  for (const model of target.models) {
    inputs[model] = {};
    const intervalH = state.models?.[model]?.update_interval_h ?? DEFAULT_INTERVAL_H[model];
    for (const point of target.points) {
      const it = state.targets?.[target.region]?.[model]?.[point];
      let ref = null, reason = null;
      if (!it?.raw) reason = it?.pending ? 'only an unconfirmed original' : 'no original';
      else if (!it.last_success_run_key || it.raw.run_key !== it.last_success_run_key) reason = 'original run != last successful run';
      else {
        const f = freshness(it.raw, model, now, intervalH);
        if (f.fresh) ref = {...it.raw, run_initialisation_utc: it.run_initialisation_utc ?? runInitialisation(it.raw.run_key), confirmed: true};
        else reason = `${f.reason}${f.age_h != null ? ` (${f.age_h} h > ${f.max_h} h)` : ''}`;
      }
      inputs[model][point] = ref;
      if (!ref) excluded.push({model, point, reason});
    }
  }
  return {inputs, excluded};
}
export const recomputeInputs = (state, target, opts) => recomputeInputsDetailed(state, target, opts).inputs;

// Objects that may be deleted: unreferenced (not the confirmed raw nor the pending original of any item) AND older
// than 72 h (collection time, else storage creation time). Unknown age -> kept.
export function rawPruneCandidates(refs, state, now = Date.now(), keepMs = RAW_KEEP_MS) {
  const keep = new Set();
  for (const reg of Object.values(state.targets || {})) for (const mod of Object.values(reg)) for (const it of Object.values(mod)) {
    if (it?.raw?.path) keep.add(it.raw.path);
    if (it?.pending?.path) keep.add(it.pending.path);
  }
  return refs.filter(r => { const t = Date.parse(r.collected_at_utc || r.created_at_utc || ''); return !keep.has(r.path) && Number.isFinite(t) && now - t > keepMs; });
}

// ---- Final publication ----
// Signature of the inputs actually used (run + content); unchanged signature = nothing new to publish.
export const inputSignature = inputs => sha256(JSON.stringify(Object.entries(inputs || {}).sort().map(([m, pts]) =>
  [m, Object.entries(pts).sort().map(([p, ref]) => [p, ref ? `${ref.run_key}#${ref.sha256}` : null])])));
// published_at = the service JSON's fetched_at (final calculation / publication). Inputs keep their own model run
// time and collection time. Unconfirmed inputs and inputs collected after publication are rejected.
export function publishRecord(region, mm, inputs) {
  const published = Date.parse(mm?.fetched_at || '');
  if (!Number.isFinite(published)) throw new Error(`${region}: fetched_at missing`);
  const models = {};
  for (const [model, pts] of Object.entries(inputs || {})) {
    models[model] = {};
    for (const [point, ref] of Object.entries(pts)) {
      if (ref && ref.confirmed !== true) throw new Error(`${region} ${model}/${point}: unconfirmed original`);
      if (ref && !(Date.parse(ref.collected_at_utc) <= published)) throw new Error(`${region} ${model}/${point}: collected after publication`);
      models[model][point] = ref ? {run_key: ref.run_key, run_initialisation_utc: ref.run_initialisation_utc, run_available_utc: ref.run_available_utc ?? null,
        collected_at_utc: ref.collected_at_utc, raw_path: ref.path} : null;
    }
  }
  return {region_id: region, published_at: mm.fetched_at, input_signature: inputSignature(inputs), inputs: models};
}
// Whether a recalculated region file may replace the published one. Keeps the existing good file when the candidate
// is invalid (validateService issues), when no fresh confirmed input exists, or when the inputs did not change since
// the last publication (re-running on old originals must not bump fetched_at and look like a newer forecast).
export function choosePublication({region, candidate, issues = [], inputs, previousRecord = null}) {
  if (!candidate || issues.length) return {publish: false, reason: 'invalid_candidate', issues};
  const used = Object.values(inputs || {}).flatMap(pts => Object.values(pts)).filter(Boolean);
  if (!used.length) return {publish: false, reason: 'no_fresh_input'};
  const sig = inputSignature(inputs);
  if (previousRecord?.input_signature === sig) return {publish: false, reason: 'no_new_input'};
  return {publish: true, record: publishRecord(region, candidate, inputs)};
}

// ---- DB access layer (Supabase PostgREST; rows match supabase/deferred/20261120000000_weather_model_watch.sql) ----
// Pure mapping (tested) + thin clients. Service role key only; never shipped to the app.
export function stateToRows(state) {
  const models = Object.entries(state.models || {}).map(([model, m]) => ({model, run_key: m.run_key, components: m.components ?? {},
    run_initialisation_at: m.run_initialisation_utc ?? null, run_available_at: m.run_available_utc ?? null, availability_verified: Boolean(m.availability_verified),
    update_interval_h: m.update_interval_h ?? null, checked_at: m.checked_at_utc, meta_status: m.meta_status}));
  const items = [];
  for (const [region_id, reg] of Object.entries(state.targets || {})) for (const [model, mod] of Object.entries(reg)) for (const [point, it] of Object.entries(mod)) {
    items.push({region_id, model, point, status: it.status, run_key: it.run_key, last_success_run_key: it.last_success_run_key ?? null,
      run_initialisation_at: it.run_initialisation_utc ?? null, last_success_at: it.last_success_utc ?? null,
      first_seen_at: it.first_seen_utc ?? null, raw_run_key: it.raw?.run_key ?? null, raw_run_available_at: it.raw?.run_available_utc ?? null,
      raw_path: it.raw?.path ?? null, raw_sha256: it.raw?.sha256 ?? null, raw_bytes: it.raw?.bytes ?? null, raw_collected_at: it.raw?.collected_at_utc ?? null,
      pending_run_key: it.pending?.run_key ?? null, pending_run_available_at: it.pending?.run_available_utc ?? null, pending_raw_path: it.pending?.path ?? null,
      pending_raw_sha256: it.pending?.sha256 ?? null, pending_raw_bytes: it.pending?.bytes ?? null, pending_collected_at: it.pending?.collected_at_utc ?? null,
      attempts: it.attempts || 0, failures_total: it.failures_total || 0, next_attempt_at: it.next_attempt_utc ?? null,
      last_attempt_at: it.last_attempt_utc ?? null, last_error: it.error ?? null});
  }
  return {models, items};
}
export function rowsToState({models = [], items = [], usage = []}) {
  const s = emptyState();
  for (const m of models) s.models[m.model] = {run_key: m.run_key, components: m.components, run_initialisation_utc: m.run_initialisation_at,
    run_available_utc: m.run_available_at, availability_verified: m.availability_verified, update_interval_h: m.update_interval_h, checked_at_utc: m.checked_at, meta_status: m.meta_status};
  for (const r of items) ((s.targets[r.region_id] ||= {})[r.model] ||= {})[r.point] = {status: r.status, run_key: r.run_key,
    first_seen_utc: r.first_seen_at ?? null, last_success_run_key: r.last_success_run_key, run_initialisation_utc: r.run_initialisation_at, attempts: r.attempts, failures_total: r.failures_total,
    next_attempt_utc: r.next_attempt_at, last_attempt_utc: r.last_attempt_at, last_success_utc: r.last_success_at, error: r.last_error,
    // the original's OWN run (raw_run_key), never last_success_run_key: an old original is never relabelled as a newer run
    raw: r.raw_path && r.raw_run_key ? {path: r.raw_path, sha256: r.raw_sha256, bytes: r.raw_bytes, collected_at_utc: r.raw_collected_at, run_key: r.raw_run_key, run_available_utc: r.raw_run_available_at} : null,
    pending: r.pending_raw_path && r.pending_run_key ? {path: r.pending_raw_path, sha256: r.pending_raw_sha256, bytes: r.pending_raw_bytes, collected_at_utc: r.pending_collected_at, run_key: r.pending_run_key, run_available_utc: r.pending_run_available_at} : null};
  for (const u of usage) { const {day, ...rest} = u; s.usage[day] = rest; }
  return s;
}
// Concurrency: (1) a lease (weather_watch_lease_acquire) lets one check run at a time; a second runner gets false
// and exits without fetching; the holder renews it while collecting (runCheck). (2) state writes (weather_watch_commit)
// are refused unless the token still holds the lease. (3) usage is NOT behind the lease: weather_usage_add inserts
// request-log rows (unique request_id) and increments the daily counters only for rows that were new.
export function createSupabaseStateStore({url, serviceKey, fetchImpl = fetch}) {
  const call = (p, init = {}) => fetchImpl(`${url}/rest/v1/${p}`, {...init,
    headers: {apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json', ...init.headers}})
    .then(async r => { if (!r.ok) throw new Error(`${p}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); return r.status === 204 ? null : r.json(); });
  const rpc = (fn, args) => call(`rpc/${fn}`, {method: 'POST', body: JSON.stringify(args)});
  return {
    acquire: (holder, ttlSeconds = LEASE_TTL_S) => rpc('weather_watch_lease_acquire', {p_holder: holder, p_ttl_seconds: ttlSeconds}), // true | false; also renews
    release: holder => rpc('weather_watch_lease_release', {p_holder: holder}),
    async load() {
      const [models, items, usage] = await Promise.all([call('weather_model_runs_latest?select=*'), call('weather_collect_items?select=*'),
        call('weather_api_usage_daily?select=*&order=day.desc&limit=3')]);
      return rowsToState({models, items, usage});
    },
    save: (holder, state) => { const {models, items} = stateToRows(state); return rpc('weather_watch_commit', {p_holder: holder, p_models: models, p_items: items}); },
    usageAdd: requests => (requests.length ? rpc('weather_usage_add', {p_requests: requests}) : Promise.resolve(0)), // -> rows newly counted
    savePublish: (holder, record) => rpc('weather_region_publish_record', {p_holder: holder, p_region_id: record.region_id, p_published_at: record.published_at,
      p_input_signature: record.input_signature, p_inputs: record.inputs})
  };
}
// In-memory store with the SAME semantics as the SQL functions (lease, guarded commit, idempotent usage). Used by the
// tests and as the executable specification of the DB behaviour.
export function createMemoryStore({clock = Date.now} = {}) {
  const db = {lease: {holder: null, expires: -Infinity}, state: emptyState(), requests: new Map(), usage: {}, publish: {}};
  const held = h => db.lease.holder === h && db.lease.expires > clock();
  return {
    db,
    async acquire(holder, ttlSeconds = LEASE_TTL_S) {
      if (db.lease.expires < clock() || db.lease.holder === holder) { db.lease = {holder, expires: clock() + Math.min(Math.max(ttlSeconds, 60), 3600) * 1000}; return true; }
      return false;
    },
    async release(holder) { if (db.lease.holder === holder) db.lease = {holder: null, expires: -Infinity}; },
    async load() { return rowsToState({...stateToRows(db.state), usage: Object.entries(db.usage).map(([day, u]) => ({day, ...u}))}); },
    async save(holder, state) { if (!held(holder)) throw new Error(`weather watch lease not held by ${holder}`); db.state = rowsToState(stateToRows(state)); },
    async usageAdd(requests) {
      let added = 0;
      for (const r of requests) {
        if (db.requests.has(r.request_id)) continue;
        db.requests.set(r.request_id, r);
        added++;
        const u = (db.usage[r.day] ||= {checks: 0, meta_requests: 0, meta_failed: 0, forecast_requests: 0, forecast_weighted: 0});
        if (r.kind === 'check') u.checks++;
        if (r.kind === 'meta') { u.meta_requests++; if (r.failed) u.meta_failed++; }
        if (r.kind === 'forecast') { u.forecast_requests++; u.forecast_weighted = r2(u.forecast_weighted + (r.weighted || 0)); }
      }
      return added;
    },
    async savePublish(holder, record) {
      if (!held(holder)) throw new Error(`weather watch lease not held by ${holder}`);
      const prev = db.publish[record.region_id];
      if (!prev || Date.parse(record.published_at) >= Date.parse(prev.published_at)) db.publish[record.region_id] = record;
    }
  };
}

// ---- One 30-minute check (orchestration; network only through the injected functions) ----
// collect(item) -> {ok, body?, error?, attempts?}  (attempts = real HTTP attempts made for that item, default 1)
// Order per item: lease renewal if due (failure -> stop issuing new requests) -> request -> usage recorded at once
// (idempotent ids; not lease-gated) -> original uploaded + hash-verified -> result. Commit only after a final renewal.
export async function runCheck({store, rawStore, targets, readMetaFn, collect, holder = runnerId(), clock = Date.now,
  budgetFor = null, renewEveryMs = LEASE_RENEW_MS, ttlSeconds = LEASE_TTL_S, afterCollect = null}) {
  // afterCollect(state, {renew, plan, results}) -> state: optional extra work under the same lease before the commit
  // (Best Match observation, publication, alerts). It must call renew() before each external write.
  if (!(await store.acquire(holder, ttlSeconds))) return {status: 'lease_busy', holder};
  try {
    const state = await store.load();
    await store.usageAdd([{request_id: `${holder}:check`, day: dayOf(clock()), kind: 'check', weighted: 0, failed: false, holder}]);
    const {meta, usage: metaUsage} = await readMetaFn(holder);
    await store.usageAdd(metaUsage.log || []);
    const plan = planCollection({state, meta, targets, now: clock(), metaUsage, budget: budgetFor ? budgetFor(state) : null});
    const results = [];
    let lastRenew = clock(), stopped = null;
    for (const item of plan.collect) {
      if (clock() - lastRenew >= renewEveryMs) {
        if (!(await store.acquire(holder, ttlSeconds))) { stopped = 'lease_lost'; break; } // no new API request
        lastRenew = clock();
      }
      let res;
      try { res = await collect(item); } catch (e) { res = {ok: false, error: String(e.message || e)}; }
      const attempts = Math.max(1, res.attempts ?? 1);
      await store.usageAdd(forecastRequests(holder, item, attempts, clock())); // recorded even if the commit fails later
      let raw = null, error = res.ok ? null : res.error;
      if (res.ok && res.body != null) {
        try { raw = await rawStore.put({...item, body: res.body, collected_at_utc: iso(clock())}); } catch (e) { error = `storage: ${e.message}`; }
      }
      results.push({region: item.region, model: item.model, point: item.point, ok: Boolean(raw), raw, error: raw ? null : error || 'success without a verified original', requests: attempts});
    }
    let next = applyResults(state, plan, results, clock());
    if (afterCollect && !stopped) next = await afterCollect(next, {plan, results, renew: () => store.acquire(holder, ttlSeconds)});
    if (!(await store.acquire(holder, ttlSeconds))) return {status: 'lease_lost_before_commit', holder, plan, results};
    await store.save(holder, next);
    return {status: stopped || 'committed', holder, plan, results, state: next};
  } finally { await store.release(holder); }
}


// ---- Best Match (45 items, observed; collected by the existing 2 h pipeline) ----
// The 2 h pipeline (and its backup slot) keeps collecting / recovering Best Match. The watch only records, per point,
// the newest VALID published Best Match file as that item's original (run_key best_match@<fetched_at>,
// collected_at = fetched_at), so staleness alerts and the Supabase copies cover all 162 items.
export const BEST_MATCH = 'best_match';
export const watchItems = targets => targets.flatMap(t => [...t.models, BEST_MATCH].flatMap(m => t.points.map(p => ({region: t.region, model: m, point: p}))));
export async function observeBestMatch(state, targets, {readBmText, validate, rawStore, now = Date.now()}) {
  const next = structuredClone(state);
  const at = iso(now);
  const changed = [];
  for (const t of targets) {
    let text = null, bm = null, issues = [];
    try { text = await readBmText(t.region); bm = JSON.parse(text); } catch (e) { issues = [`unreadable: ${String(e.message).slice(0, 120)}`]; }
    if (bm) issues = validate(bm, t.region);
    const runKey = bm?.fetched_at ? `${BEST_MATCH}@${bm.fetched_at}` : null;
    const mod = ((next.targets[t.region] ||= {})[BEST_MATCH] ||= {});
    let ref = null;
    for (const p of t.points) {
      const prev = mod[p] || {};
      const pointOk = !issues.length && bm.points?.some(x => x.point_type === p) && bm.hourly?.[p] && bm.current?.[p];
      if (pointOk && prev.raw?.run_key === runKey) continue; // unchanged: nothing uploaded
      if (pointOk && !isRegressed(runKey, prev.last_success_run_key)) {
        ref ||= await rawStore.put({region: t.region, model: BEST_MATCH, point: 'all', run_key: runKey, body: text, collected_at_utc: bm.fetched_at});
        mod[p] = {first_seen_utc: prev.first_seen_utc ?? at, status: 'ok', run_key: runKey, last_success_run_key: runKey, run_initialisation_utc: bm.fetched_at,
          attempts: 0, failures_total: prev.failures_total || 0, next_attempt_utc: null, last_attempt_utc: at, last_success_utc: bm.fetched_at, error: null,
          raw: {...ref, run_key: runKey, run_available_utc: bm.fetched_at}, pending: null};
        changed.push({region: t.region, point: p, run_key: runKey});
      } else if (!pointOk) {
        mod[p] = {...prev, first_seen_utc: prev.first_seen_utc ?? at, status: prev.last_success_run_key ? prev.status || 'ok' : 'failed',
          run_key: prev.run_key || runKey || `${BEST_MATCH}@unknown`, last_attempt_utc: at,
          error: (issues.length ? issues.join('; ') : `point ${p} missing`).slice(0, 300), raw: prev.raw ?? null, pending: null,
          last_success_run_key: prev.last_success_run_key ?? null, attempts: prev.attempts || 0, failures_total: prev.failures_total || 0};
      }
    }
  }
  return {state: next, changed};
}

// ---- Admin staleness alerts (162 items) ----
// stale = no success for >= 24 h (age from last success, else from first_seen). Incident: opened at the first stale
// item -> one 'stale_24h' alert; any item >= 48 h -> one 'stale_48h' alert; all recovered -> one 'recovered' alert and
// the incident closes. alert_key = <incident_key>:<kind>: inserted once (DB on conflict do nothing).
export const STALE_ALERT_MS = 24 * HOUR, STALE_REALERT_MS = 48 * HOUR;
const MODEL_LABEL = {jma_msm: 'JMA MSM', ecmwf_ifs025: 'ECMWF', gfs_seamless: 'GFS', best_match: 'Best Match'};
const POINT_LABEL = {summit: '정상', mid: '중간', base: '하단'};
export function staleItems(state, targets, now) {
  const out = [];
  for (const k of watchItems(targets)) {
    const it = state.targets?.[k.region]?.[k.model]?.[k.point];
    const since = Date.parse(it?.last_success_utc || it?.first_seen_utc || '');
    if (!Number.isFinite(since)) continue; // never seen yet: no age (first check)
    const age = now - since;
    if (age >= STALE_ALERT_MS) out.push({...k, age_h: Math.floor(age / HOUR), last_success_utc: it?.last_success_utc ?? null, error: it?.error ?? null});
  }
  return out.sort((a, b) => b.age_h - a.age_h || a.region.localeCompare(b.region));
}
const itemText = list => list.slice(0, 8).map(i => `${i.region}·${MODEL_LABEL[i.model] || i.model}·${POINT_LABEL[i.point] || i.point}(${i.age_h}h)`).join(', ') + (list.length > 8 ? ` 외 ${list.length - 8}건` : '');
export function evaluateAlerts({state, targets, incident = null, now = Date.now()}) {
  const stale = staleItems(state, targets, now);
  const alerts = [];
  const mk = (inc, kind, title, body, items) => ({alert_key: `${inc.incident_key}:${kind}`, incident_key: inc.incident_key, kind, title, body, items});
  let inc = incident && !incident.closed_at ? {...incident} : null;
  if (!inc && stale.length) {
    inc = {incident_key: iso(now), opened_at: iso(now), closed_at: null, alerted_24h_at: iso(now), alerted_48h_at: null, items: stale};
    alerts.push(mk(inc, 'stale_24h', `날씨 데이터 24시간 미갱신 ${stale.length}건`, itemText(stale), stale));
    return {incident: inc, alerts, stale};
  }
  if (!inc) return {incident: null, alerts, stale};
  if (!stale.length) {
    alerts.push(mk(inc, 'recovered', '날씨 데이터 갱신 정상화', `장애 항목 ${inc.items?.length || 0}건 모두 복구`, inc.items || []));
    return {incident: {...inc, closed_at: iso(now), items: []}, alerts, stale};
  }
  const over48 = stale.filter(i => i.age_h * HOUR >= STALE_REALERT_MS);
  if (over48.length && !inc.alerted_48h_at) {
    inc.alerted_48h_at = iso(now);
    alerts.push(mk(inc, 'stale_48h', `날씨 데이터 48시간 미갱신 ${over48.length}건`, itemText(over48), over48));
  }
  return {incident: {...inc, items: stale}, alerts, stale};
}

// ---- App-facing final files (public bucket) + manifest ----
// Manifest: {data_kind, schema_version, generated_at, files: {<path>: {sha256, bytes, published_at}}}. The app downloads
// only files whose sha256 differs from its saved copy. Final files are replaced in place (same path), manifest last.
export const MANIFEST_PATH = 'manifest.json';
export function buildManifest(prev, files, now = Date.now()) {
  const out = {data_kind: 'powderline_weather_manifest', schema_version: 1, generated_at: iso(now), files: {...(prev?.files || {})}};
  for (const [p, f] of Object.entries(files)) out.files[p] = {sha256: f.sha256, bytes: f.bytes, published_at: f.published_at ?? null};
  return out;
}
export function createFilePublicStore(dir) {
  return {
    async putFile(rel, buf) { const f = path.join(dir, rel); mkdirSync(path.dirname(f), {recursive: true}); writeFileSync(f, buf); return {sha256: sha256(buf), bytes: buf.length}; },
    async getText(rel) { const f = path.join(dir, rel); return existsSync(f) ? readFileSync(f, 'utf8') : null; }
  };
}
export function createSupabasePublicStore({url, serviceKey, bucket = 'weather-public', fetchImpl = fetch}) {
  const h = extra => ({apikey: serviceKey, authorization: `Bearer ${serviceKey}`, ...extra});
  return {
    async putFile(rel, buf) {
      const res = await fetchImpl(`${url}/storage/v1/object/${bucket}/${rel}`, {method: 'POST', body: buf,
        headers: h({'content-type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=60'})});
      if (!res.ok) throw new Error(`public upload ${rel}: HTTP ${res.status}`);
      const back = await fetchImpl(`${url}/storage/v1/object/${bucket}/${rel}`, {headers: h()});
      const b = back.ok ? Buffer.from(await back.arrayBuffer()) : null;
      if (!b || sha256(b) !== sha256(buf)) throw new Error(`public verification failed: ${rel}`);
      return {sha256: sha256(buf), bytes: buf.length};
    },
    async getText(rel) { const r = await fetchImpl(`${url}/storage/v1/object/${bucket}/${rel}`, {headers: h()}); return r.ok ? r.text() : null; }
  };
}
export const sha256Hex = sha256;
