// POWDERLINE 30-minute model watch: collection -> originals -> existing multi-model calculation -> validated
// publication (Supabase public bucket + manifest) -> admin staleness alerts. Runs NEXT TO the existing GitHub 2 h
// service (which keeps writing dist/data and GitHub Pages); nothing here writes dist/ or changes the formula.
//   node scripts/weather-model-watch-run.mjs [--regions=kiroro,niseko] [--store=supabase|file] [--dir=work/weather/watch-local]
//        [--no-publish] [--plan-only]
// Supabase: env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role; never shipped to the app).
// Request limits: every Open-Meteo request has a 30 s timeout, at most 3 attempts (transient errors only), and each
// attempt is recorded once in the usage log (request id), whatever happens to the commit.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {modelUrl, parseModelBody, publishRegion} from './weather-multimodel-publish.mjs';
import {loadConfig, profileConfig, profileModels} from './weather-multimodel-engine.mjs';
import {validateWeather} from './weather-pipeline.mjs';
import {primarySkiAreas} from './weather-points.mjs';
import {regionTargets, readMeta, runCheck, runnerId, observeBestMatch, recomputeInputsDetailed, choosePublication, evaluateAlerts,
  buildManifest, MANIFEST_PATH, createFileRawStore, createSupabaseRawStore, createSupabaseStateStore, createMemoryStore,
  createFilePublicStore, createSupabasePublicStore, rawPruneCandidates, sha256Hex, BEST_MATCH, WATCH_MODELS, watchBudget, itemCost} from './weather-model-watch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REQUEST_TIMEOUT_MS = 30000;
export const MAX_REQUEST_ATTEMPTS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bmPath = region => path.join(ROOT, 'dist/data/weather', `${region}.json`);
export const readRepoBmText = region => readFileSync(bmPath(region), 'utf8');

// Point coordinates of one region, exactly as publishRegion builds them (from the Best Match file).
const pointOf = (bm, p) => { const x = bm.points.find(q => q.point_type === p); return x ? {latitude: x.latitude, longitude: x.longitude, elevation: x.elevation} : null; };

// One model × point request with the existing URL and parser. Only a body that parses with parseModelBody counts.
export async function collectModel(item, {readBmText = readRepoBmText, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS, maxAttempts = MAX_REQUEST_ATTEMPTS, wait = sleep, cfgAll = loadConfig(), country}) {
  const bm = JSON.parse(await readBmText(item.region));
  const cfg = profileConfig(cfgAll, country);
  const m = profileModels(cfg)[item.model];
  const point = pointOf(bm, item.point);
  if (!m || !point) return {ok: false, attempts: 0, error: `${item.model}/${item.point}: not configured`};
  let attempts = 0, error = null;
  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await fetchImpl(modelUrl(item.model, m, point), {signal: AbortSignal.timeout(timeoutMs)});
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.error) {
        error = `HTTP ${res.status}: ${body?.reason || 'invalid response'}`;
        if (!(res.status === 429 || res.status >= 500)) break; // not transient
      } else {
        parseModelBody(item.model, body); // same validation as the publisher (UTC, units, hourly axis); throws if bad
        return {ok: true, body, attempts};
      }
    } catch (e) { error = String(e.message || e).slice(0, 200); if (/expected UTC|unit |non-hourly/.test(error)) break; }
    if (attempts < maxAttempts) await wait(800 * 2 ** (attempts - 1));
  }
  return {ok: false, attempts, error};
}

// publishRegion inputs from stored originals: confirmed + fresh only; anything else throws -> the publisher treats that
// model as missing at that point (existing missing-model policy, Best Match fallback).
export function storedFetchFn({state, target, rawStore, bm, now}) {
  const {inputs, excluded} = recomputeInputsDetailed(state, target, {now});
  const typeOf = new Map(bm.points.map(x => [`${x.latitude},${x.longitude},${x.elevation}`, x.point_type]));
  const fn = async (id, m, point) => {
    const p = typeOf.get(`${point.latitude},${point.longitude},${point.elevation}`);
    const ref = inputs[id]?.[p];
    if (!ref) throw new Error(`${id}/${p}: no fresh confirmed original (${excluded.find(e => e.model === id && e.point === p)?.reason || 'not watched'})`);
    const body = await rawStore.get(ref);
    if (!body) throw new Error(`${id}/${p}: original unreadable or hash mismatch`);
    return parseModelBody(id, body);
  };
  return {fn, inputs, excluded};
}
// meta for publishRegion's run claims: the verified runs the stored originals belong to (no network).
export const storedMetaFn = state => async name => {
  for (const m of Object.values(state.models || {})) {
    const c = m.components?.[name];
    if (c) return {ok: true, initialisation_utc: c.initialisation_utc, availability_utc: c.availability_utc, modification_utc: null, update_interval_h: m.update_interval_h};
  }
  return {ok: false, error: 'no verified run stored'};
};

// Recalculate one region from stored originals and publish it only when valid and actually new.
export async function publishFromStore({target, state, rawStore, publicStore, ops, holder, now, readBmText = readRepoBmText}) {
  const region = target.region;
  const bmText = await readBmText(region);
  const bm = JSON.parse(bmText);
  const bmItem = state.targets?.[region]?.[BEST_MATCH]?.summit;
  const {fn, inputs, excluded} = storedFetchFn({state, target, rawStore, bm, now});
  let previous = null;
  try { previous = JSON.parse(await publicStore.getText(`weather-multimodel/${region}.json`) || 'null'); } catch { previous = null; }
  const {mm, issues} = await publishRegion(region, {now, fetchFn: fn, metaFn: storedMetaFn(state), previous, bm, bmBuf: Buffer.from(bmText)});
  // Best Match file is an input as well (same signature rule): a new Best Match collection is a new input.
  const sigInputs = {...inputs, [BEST_MATCH]: {all: bmItem?.raw ? {...bmItem.raw, confirmed: true, run_initialisation_utc: bm.fetched_at} : null}};
  const decision = choosePublication({region, candidate: mm, issues, inputs: sigInputs, previousRecord: await ops.getPublishRecord(region)});
  if (!decision.publish) return {region, published: false, reason: decision.reason, issues: decision.issues || [], excluded};
  const out = {...mm, published_at: mm.fetched_at}; // fetched_at keeps its meaning; published_at = the same instant
  const mmBuf = Buffer.from(JSON.stringify(out));
  const files = {};
  files[`weather-multimodel/${region}.json`] = {...await publicStore.putFile(`weather-multimodel/${region}.json`, mmBuf), published_at: out.published_at};
  files[`weather/${region}.json`] = {...await publicStore.putFile(`weather/${region}.json`, Buffer.from(bmText)), published_at: bm.fetched_at};
  await ops.savePublish(holder, decision.record);
  return {region, published: true, files, excluded, published_at: out.published_at};
}

// ---- operations store (incidents, alerts, publication records, cleanup) ----
export function createSupabaseOps({url, serviceKey, fetchImpl = fetch}) {
  const call = (p, init = {}) => fetchImpl(`${url}/rest/v1/${p}`, {...init,
    headers: {apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json', ...init.headers}})
    .then(async r => { if (!r.ok) throw new Error(`${p}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); return r.status === 204 ? null : r.json(); });
  const rpc = (fn, args) => call(`rpc/${fn}`, {method: 'POST', body: JSON.stringify(args)});
  return {
    getIncident: async () => (await call('weather_admin_incidents?select=*&closed_at=is.null&limit=1'))?.[0] || null,
    applyAlerts: (holder, incident, alerts) => rpc('weather_admin_alerts_apply', {p_holder: holder, p_incident: incident, p_alerts: alerts}),
    getPublishRecord: async region => (await call(`weather_region_publish?select=*&region_id=eq.${encodeURIComponent(region)}`))?.[0] || null,
    savePublish: (holder, r) => rpc('weather_region_publish_record', {p_holder: holder, p_region_id: r.region_id, p_published_at: r.published_at, p_input_signature: r.input_signature, p_inputs: r.inputs}),
    cleanup: () => rpc('weather_watch_cleanup', {p_keep_days: 3})
  };
}
export function createMemoryOps(store) {
  const db = store.db;
  db.incidents ||= {}; db.alerts ||= {};
  return {
    getIncident: async () => Object.values(db.incidents).find(i => !i.closed_at) || null,
    async applyAlerts(holder, incident, alerts) {
      if (db.lease.holder !== holder) throw new Error('lease not held');
      if (incident) { const prev = db.incidents[incident.incident_key]; db.incidents[incident.incident_key] = {...incident, alerted_24h_at: prev?.alerted_24h_at ?? incident.alerted_24h_at, alerted_48h_at: prev?.alerted_48h_at ?? incident.alerted_48h_at}; }
      let n = 0; for (const a of alerts) if (!db.alerts[a.alert_key]) { db.alerts[a.alert_key] = {...a, status: 'pending'}; n++; }
      return n;
    },
    getPublishRecord: async region => db.publish[region] || null,
    savePublish: (holder, r) => store.savePublish(holder, r),
    cleanup: async () => 0
  };
}

// One full 30-minute check.
export async function runWatch({targets, store, ops, rawStore, publicStore, readMetaFn, collect, readBmText = readRepoBmText,
  holder = runnerId(), clock = Date.now, publish = true, budgetFor = null, renewEveryMs, ttlSeconds}) {
  const report = {published: [], publish_skipped: [], alerts: 0, best_match_changed: 0, pruned: 0};
  const afterCollect = async (state, {results, renew}) => {
    const now = clock();
    const bm = await observeBestMatch(state, targets, {readBmText, rawStore, now,
      validate: (json, region) => validateWeather(json, {region, notBeforeMs: 0, nowMs: now})});
    let next = bm.state;
    report.best_match_changed = bm.changed.length;
    if (publish) {
      const touched = new Set([...results.filter(r => r.ok).map(r => r.region), ...bm.changed.map(c => c.region)]);
      for (const t of targets.filter(x => touched.has(x.region))) {
        if (!(await renew())) throw new Error('lease lost before publication');
        try {
          const r = await publishFromStore({target: t, state: next, rawStore, publicStore, ops, holder, now: clock(), readBmText});
          (r.published ? report.published : report.publish_skipped).push(r);
        } catch (e) { report.publish_skipped.push({region: t.region, published: false, reason: `error: ${String(e.message).slice(0, 200)}`}); }
      }
      const fresh = report.published.flatMap(r => Object.entries(r.files));
      if (fresh.length) {
        if (!(await renew())) throw new Error('lease lost before manifest');
        let prev = null; try { prev = JSON.parse(await publicStore.getText(MANIFEST_PATH) || 'null'); } catch { prev = null; }
        const manifest = buildManifest(prev, Object.fromEntries(fresh), clock());
        await publicStore.putFile(MANIFEST_PATH, Buffer.from(JSON.stringify(manifest))); // manifest last
        report.manifest_files = Object.keys(manifest.files).length;
      }
    }
    const {incident, alerts} = evaluateAlerts({state: next, targets, incident: await ops.getIncident(), now: clock()});
    if (incident || alerts.length) { if (!(await renew())) throw new Error('lease lost before alerts'); report.alerts = await ops.applyAlerts(holder, incident, alerts); }
    report.stale_items = incident?.items?.length || 0;
    try { await ops.cleanup(); } catch { /* housekeeping only */ }
    if (rawStore.list && rawStore.delete) {
      const doomed = rawPruneCandidates(await rawStore.list(), next, clock());
      for (const r of doomed) { await rawStore.delete(r.path); report.pruned++; }
    }
    return next;
  };
  // Always budgeted: weighted cost per request (weather-api-usage rule) and the daily watch budget (2 h pipeline
  // reserved). Without it the usage log would count requests but not their weight.
  if (!budgetFor) {
    const cfg = loadConfig(), limit = watchBudget(targets).limit_weighted;
    budgetFor = () => ({limit_weighted: limit, cost: m => itemCost(m, cfg)});
  }
  const out = await runCheck({store, rawStore, targets, readMetaFn, collect, holder, clock, budgetFor, renewEveryMs, ttlSeconds, afterCollect});
  return {...out, report};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
  const flag = k => process.argv.includes(`--${k}`);
  const ids = arg('regions', '') ? arg('regions').split(',') : Object.keys(primarySkiAreas);
  const targets = regionTargets(ids);
  const kind = arg('store', 'file');
  let store, rawStore, publicStore, ops;
  if (kind === 'supabase') {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(2); }
    store = createSupabaseStateStore({url, serviceKey: key});
    rawStore = createSupabaseRawStore({url, serviceKey: key});
    publicStore = createSupabasePublicStore({url, serviceKey: key});
    ops = createSupabaseOps({url, serviceKey: key});
  } else {
    const dir = path.resolve(ROOT, arg('dir', 'work/weather/watch-local'));
    store = createMemoryStore(); rawStore = createFileRawStore(path.join(dir, 'raw')); publicStore = createFilePublicStore(path.join(dir, 'public')); ops = createMemoryOps(store);
  }
  const countryOf = Object.fromEntries(targets.map(t => [t.region, t.country]));
  const holder = runnerId();
  if (flag('plan-only')) {
    const {meta, usage} = await readMeta({holder});
    const {planCollection} = await import('./weather-model-watch.mjs');
    const plan = planCollection({state: await store.load(), meta, targets, metaUsage: usage});
    console.log(JSON.stringify({holder, meta_requests: usage.requests, collect: plan.collect.length, skip: plan.skip.length,
      models: Object.fromEntries(WATCH_MODELS.map(m => [m, {status: plan.models[m].status, run_key: plan.models[m].run_key, settled: plan.models[m].settled}]))}, null, 1));
  } else {
    const out = await runWatch({targets, store, ops, rawStore, publicStore, holder, publish: !flag('no-publish'),
      readMetaFn: h => readMeta({holder: h}), collect: item => collectModel(item, {country: countryOf[item.region]})});
    console.log(JSON.stringify({status: out.status, holder, collected: out.results?.length ?? 0, ok: out.results?.filter(r => r.ok).length ?? 0,
      failed: (out.results || []).filter(r => !r.ok).map(r => `${r.region}/${r.model}/${r.point}: ${r.error}`), report: {...out.report,
        published: out.report.published.map(p => ({region: p.region, published_at: p.published_at, excluded: p.excluded.length})),
        publish_skipped: out.report.publish_skipped.map(p => ({region: p.region, reason: p.reason, issues: p.issues?.slice(0, 3)}))}}, null, 1));
    if (out.status !== 'committed') process.exitCode = 1;
  }
}
