// POWDERLINE hourly weather watch, Supabase Edge runtime: ONE region per invocation with the existing pipeline
// (scripts/weather-model-watch-run.mjs runWatch: meta check -> only new model runs -> Best Match when due -> existing
// multi-model formula -> validated publication + manifest). Nothing in the formula / validation / storage layout changes;
// this file only chooses the region, the limits of one Edge invocation and the daily / monthly request budget.
import {collectModel, collectBestMatch, runWatch, createSupabaseOps, failureSummary} from '../../../scripts/weather-model-watch-run.mjs';
import {regionTargets, readMeta, runnerId, itemCost, evaluateAlerts, rawPruneCandidates, TRANSIENT_ERROR,
  createSupabaseStateStore, createSupabaseRawStore, createSupabasePublicStore} from '../../../scripts/weather-model-watch.mjs';
import {collectRegion, REGION_BUDGET_MS} from '../../../scripts/weather-collect.mjs';
import {weatherRegionById} from '../../../scripts/weather-regions.mjs';
import {primarySkiAreas} from '../../../scripts/weather-points.mjs';
import {LIMITS} from '../../../scripts/weather-api-usage.mjs';
import {setConfig} from '../../../scripts/weather-multimodel-engine.mjs';
import multimodelConfig from '../../../scripts/weather-multimodel-config.json' with {type: 'json'};

// The multi-model config travels in the module bundle (no file read at run time); same file, same values.
setConfig(multimodelConfig);

// 15 regions, the same ids and order as the GitHub watch (primarySkiAreas).
export const REGION_ORDER = Object.keys(primarySkiAreas);
// Open-Meteo weighted calls. Internal daily target below the official 10,000/day; monthly stop at 90 % of 300,000.
export const DAILY_TARGET_WEIGHTED = 7000;
export const MONTHLY_CAP_WEIGHTED = Math.floor(LIMITS.per_month * 0.9);
// One invocation must end inside the Edge wall clock (150 s on the free plan): new model requests start only within
// MODEL_WINDOW_MS, Best Match gets at most BM_WINDOW_MS, the lease expires quickly if the isolate is killed.
export const MODEL_WINDOW_MS = 40000;
export const BM_WINDOW_MS = 45000;
export const LEASE_TTL_S = 180;
export const LEASE_RENEW_MS = 60000;

// Targets and model request coordinates from the configured points (the same points the collector requests and the
// Best Match file carries), not from GitHub-written files.
const readBm = id => ({points: weatherRegionById[id]?.points || []});
const readBmText = async id => JSON.stringify(readBm(id));
export const targetsFor = ids => regionTargets(ids, {readBm});

export function supabaseStores(url, serviceKey) {
  return {
    store: createSupabaseStateStore({url, serviceKey}),
    rawStore: createSupabaseRawStore({url, serviceKey}),
    publicStore: createSupabasePublicStore({url, serviceKey}),
    ops: createSupabaseOps({url, serviceKey})
  };
}

// Daily limit for the planner (it subtracts today's recorded usage itself) capped by what is left of the month.
export function budget({monthUsedBeforeToday = 0} = {}) {
  const limit = Math.max(0, Math.min(DAILY_TARGET_WEIGHTED, MONTHLY_CAP_WEIGHTED - monthUsedBeforeToday));
  return () => ({limit_weighted: limit, cost: model => itemCost(model)});
}

// Best Match collector with a shorter region time budget (same collector; only its clock-based deadline moves).
const collectBmWithin = windowMs => region => collectBestMatch(region, {
  collect: id => collectRegion(id, {now: () => Date.now() + (REGION_BUDGET_MS - windowMs), saveOutput: false})
});

// Region API failure that should count toward the cross-region outage stop: nothing succeeded and every error was
// transient (timeout / network / 429 / 5xx), or the single-region outage guard tripped (all meta requests failed).
export function transientFailure(out) {
  if (out?.outage) return true;
  const results = out?.results || [];
  const bm = out?.report?.best_match || {};
  const errors = [...results.filter(r => !r.ok).map(r => r.error), ...(bm.failed || []).map(f => f.error)];
  const anyOk = results.some(r => r.ok) || (bm.collected || []).length > 0;
  return !anyOk && errors.length > 0 && errors.every(e => TRANSIENT_ERROR.test(String(e || '')));
}

// One region. Alerts are evaluated once per hourly run over all regions (finalizeAlerts), so the per-region run gets
// an ops object without incident handling (a healthy region must not close another region's incident).
export async function runRegion(region, {stores, holder = runnerId(), monthUsedBeforeToday = 0, publish = true}) {
  const targets = targetsFor([region]);
  if (!targets.length) return {region, status: 'no_target', transient: false};
  const country = targets[0].country;
  // Housekeeping (usage-log cleanup, raw-original pruning: a full bucket walk) runs once per hourly run in
  // finalizeAlerts, not in every region invocation.
  const ops = {...stores.ops, getIncident: async () => null, applyAlerts: async () => 0, cleanup: async () => 0};
  const {list: _list, delete: _delete, ...rawStore} = stores.rawStore;
  const out = await runWatch({targets, store: stores.store, rawStore, publicStore: stores.publicStore, ops, holder, publish,
    budgetFor: budget({monthUsedBeforeToday}),
    collectBm: collectBmWithin(BM_WINDOW_MS),
    readMetaFn: h => readMeta({holder: h}),
    collect: item => collectModel(item, {country, readBmText}),
    checkBudgetMs: MODEL_WINDOW_MS, ttlSeconds: LEASE_TTL_S, renewEveryMs: LEASE_RENEW_MS});
  const bm = out.report?.best_match || {};
  return {
    region, status: out.status, holder,
    items: out.results?.length ?? 0, ok: out.results?.filter(r => r.ok).length ?? 0, not_tried: out.not_tried?.length ?? 0,
    budget: out.plan?.budget || null,
    best_match: {due: bm.due?.length ?? 0, collected: bm.collected?.length ?? 0, failed: bm.failed?.length ?? 0, skipped: bm.skipped?.map(s => s.reason) ?? [],
      requests: bm.requests ?? 0, weighted: bm.weighted ?? 0},
    published: (out.report?.published || []).map(p => p.published_at),
    publish_skipped: (out.report?.publish_skipped || []).map(p => p.reason),
    failures: out.status === 'committed' ? failureSummary(out) : [],
    outage: out.outage || null,
    transient: transientFailure(out)
  };
}

// Admin staleness alerts once per hourly run, over all regions, with the existing rules and RPCs (lease held).
export async function finalizeAlerts({stores, holder = runnerId(), now = Date.now()}) {
  const {store, ops} = stores;
  if (!(await store.acquire(holder, LEASE_TTL_S))) return {status: 'lease_busy'};
  try {
    const state = await store.load();
    const {incident, alerts, stale} = evaluateAlerts({state, targets: targetsFor(REGION_ORDER), incident: await ops.getIncident(), now});
    let applied = 0;
    if (incident || alerts.length) applied = await ops.applyAlerts(holder, incident, alerts);
    // Same housekeeping the per-check pipeline did: usage log older than 3 days, raw originals no longer referenced.
    let cleaned = 0, pruned = 0;
    try { cleaned = await ops.cleanup(); } catch { /* housekeeping only */ }
    if (stores.rawStore.list && stores.rawStore.delete && (await store.acquire(holder, LEASE_TTL_S))) {
      const doomed = rawPruneCandidates(await stores.rawStore.list(), state, now);
      for (const r of doomed) { await stores.rawStore.delete(r.path); pruned++; }
    }
    return {status: 'ok', stale_items: stale.length, alerts: applied, incident_open: Boolean(incident && !incident.closed_at), cleaned, pruned};
  } finally { await store.release(holder); }
}
