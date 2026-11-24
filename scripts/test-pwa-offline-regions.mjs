// Local Chrome test of the PWA offline regions on the main Mapbox map (dist/pwa-offline-store.js + sw.js + app.js).
// Every active Supabase powderline_regions row (or the ids given as arguments) goes through: listed → bbox → download
// (satellite / OpenFreeMap / DEM / contours / ski data) → offline satellite / terrain / winter on the same map →
// network off + reload → delete. Also: online Mapbox styles once, an older pack without contours upgraded in place.
// Not automated (checked by hand): saved course selection, GPS on a device, Ride On, off-route / return, alarms.
// Run from the repository root with Node 24+ and desktop Chrome: node scripts/test-pwa-offline-regions.mjs [regionId ...]
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';

const SUPABASE = { url: 'https://lxfsvhwibiaspnaduhri.supabase.co', key: 'sb_publishable_1ephBEp88K0I6OK0HoPMXw_QOvHklEY' }; // public client key (dist/config.js)
const onlyIds = process.argv.slice(2);
const root = resolve(import.meta.dirname, '..', 'dist');
const mountPath = '/powderline-hokkaido';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname !== mountPath && !pathname.startsWith(mountPath + '/')) { response.writeHead(404).end(); return; }
    const relative = pathname.slice(mountPath.length);
    const file = resolve(root, `.${relative === '/' || !relative ? '/index.html' : relative}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': data.length });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const appUrl = `http://127.0.0.1:${server.address().port}${mountPath}/`;
const testDir = await mkdtemp(join(tmpdir(), 'powderline-pwa-offline-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--remote-debugging-port=0',
  `--user-data-dir=${testDir}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });

const log = (...a) => console.error('[test]', ...a);
const report = { startedAt: new Date().toISOString(), online: null, listed: [], migration: null, regions: [] };
let ws;
try {
  const active = await (await fetch(`${SUPABASE.url}/rest/v1/powderline_regions?select=id,label,bbox,center_lng,center_lat,ski_data_status&is_active=eq.true&order=sort_order`,
    { headers: { apikey: SUPABASE.key } })).json();
  const targets = active.filter(r => !onlyIds.length || onlyIds.includes(r.id));
  log(`active regions: ${active.length}, testing: ${targets.map(r => r.id).join(', ')}`);

  let debuggingPort;
  for (let i = 0; i < 300 && !debuggingPort; i++) {
    try { debuggingPort = Number((await readFile(join(testDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch {}
    if (!debuggingPort) await new Promise(r => setTimeout(r, 200));
  }
  const page = (await (await fetch(`http://127.0.0.1:${debuggingPort}/json`)).json()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const pending = new Map(); let nextId = 0;
  // Network by source host while a download runs (page fetch() requests of pwa-offline-store.js).
  const net = { mapboxStyle: 0, hosts: {} };
  const hostOf = u => /arcgisonline/.test(u) ? 'satellite' : /openfreemap\.org\/planet\/[^/]+\/\d+\/\d+\/\d+\.pbf/.test(u) ? 'openfreemap' : /elevation-tiles-prod/.test(u) ? 'dem'
    : /storage\/v1\/object\/public\/ski-data|\/data\/ski\//.test(u) ? 'ski' : '';
  const urls = new Map();
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.method === 'Network.requestWillBeSent') {
      urls.set(m.params.requestId, m.params.request.url);
      if (/api\.mapbox\.com\/styles\//.test(m.params.request.url)) net.mapboxStyle++;
    }
    if (m.method === 'Network.responseReceived') {
      const h = hostOf(m.params.response.url);
      if (h) { const c = net.hosts[h] ||= { ok: 0, notFound: 0, failed: 0 }; m.params.response.status === 200 ? c.ok++ : m.params.response.status === 404 ? c.notFound++ : c.failed++; }
    }
    if (m.method === 'Network.loadingFailed') {
      const h = hostOf(urls.get(m.params.requestId) || '');
      if (h) (net.hosts[h] ||= { ok: 0, notFound: 0, failed: 0 }).failed++;
    }
    if (!m.id || !pending.has(m.id)) return;
    const { resolve: ok, reject } = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : ok(m.result);
  });
  const cdp = (method, params = {}, timeout = 120000) => new Promise((ok, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, timeout);
    pending.set(id, { resolve: v => { clearTimeout(timer); ok(v); }, reject: e => { clearTimeout(timer); reject(new Error(`${method}: ${e.message}`)); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression) {
    const reply = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 600000);
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text);
    return reply.result.value;
  }
  async function until(expression, label, seconds = 60) {
    for (let i = 0; i < seconds * 4; i++) {
      try { if (await evaluate(expression)) return; } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`Timed out: ${label}`);
  }
  async function shot(name) { // map canvas (the signed-out test browser keeps the app UI behind the login screen)
    const data = await evaluate(`new Promise(res => { const m = window.__powderlineTest.map;
      m.once('render', () => res(m.getCanvas().toDataURL('image/png'))); m.triggerRepaint(); })`);
    const path = join(testDir, `${name}.png`);
    await writeFile(path, Buffer.from(data.split(',')[1], 'base64'));
    return path;
  }
  const mapIdle = "(() => { const m = window.__powderlineTest?.map; return Boolean(m && m.isStyleLoaded() && m.loaded()); })()";
  // Tile load errors of the offline sources, reported by the map itself (Mapbox fetches tiles in its workers).
  const watchTileErrors = `(() => { const m = window.__powderlineTest.map; window.__tileErrors = [];
    if (!m.__watching) { m.__watching = true; m.on('error', e => { if (String(e.sourceId || '').startsWith('pwa-offline')) window.__tileErrors.push(e.sourceId + ' ' + (e.error?.status || e.error?.message || '')); }); } })()`;
  const mapInfo = `(() => { const t = window.__powderlineTest, m = t.map, st = m.getStyle();
    const q = id => m.getSource(id) ? m.querySourceFeatures(id).length : -1;
    return { name: st?.name || '', terrain: m.getTerrain()?.source || null, mapStyle: t.state.mapStyle, offlineRegion: t.pwaOffline.regionId,
      contourLayers: ['pwa-contour', 'pwa-contour-index', 'pwa-contour-label'].filter(id => m.getLayer(id)).length,
      contourFeatures: q('pwa-offline-contour'), ski: q('ski-facilities'), routeLayers: ['route-line', 'route-points'].filter(id => m.getLayer(id)).length,
      tileErrors: (window.__tileErrors || []).length, tileErrorSample: (window.__tileErrors || []).slice(0, 3) }; })()`;
  const pickStyle = key => `(() => { if (!document.getElementById('mapStylePopover')) { const b = document.getElementById('satelliteBtn'); b?.click(); b?.click(); }
    document.querySelector('#mapStylePopover [data-map-style="${key}"]')?.click(); })()`;
  // Home: pick the country whose list enables this region, then the region, then offline mode.
  const pickHomeRegion = id => `(() => { const c = document.getElementById('homeCountrySelect'), s = document.getElementById('homeRegionSelect');
    const usable = () => [...s.options].some(o => o.value === '${id}' && !o.disabled);
    if (!usable() && c) for (const o of c.options) { c.value = o.value; c.dispatchEvent(new Event('change')); if (usable()) break; }
    if (!usable()) return false;
    s.value = '${id}'; s.dispatchEvent(new Event('change')); document.getElementById('homeOfflineMapModeBtn').click(); return true; })()`;
  const store = expr => `window.PowderlinePwaOffline.${expr}`;
  const stateLabel = `document.querySelector('#homeOfflineRegionList .home-offline-region-state')?.textContent || ''`;

  async function boot() {
    await until("Boolean(window.PowderlinePwaOffline) && Boolean(window.__powderlineTest)", 'app loaded', 90);
    await until(mapIdle, 'map idle', 90);
  }
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: appUrl });
  await until("Boolean(window.PowderlinePwaOffline)", 'store loaded');
  await until("navigator.serviceWorker.ready.then(() => true)", 'service worker ready');
  await cdp('Page.reload', {});
  await until("Boolean(navigator.serviceWorker.controller)", 'page controlled by SW');
  await boot();

  // Online Mapbox styles (unchanged path).
  report.online = {};
  for (const key of ['topo', 'winter', 'satellite']) {
    await evaluate(pickStyle(key));
    await until(`window.__powderlineTest.state.mapStyle === '${key}' && ${mapIdle}`, `online ${key}`, 60);
    const info = await evaluate(mapInfo);
    report.online[key] = `${info.name || 'Mapbox Standard Satellite'} terrain=${info.terrain}`;
  }
  log('online', JSON.stringify(report.online));

  // A. All regions listed in the existing offline download list (all-regions modal).
  await until(`document.querySelectorAll('#homeRegionSelect option').length > 3`, 'catalog', 60);
  await evaluate("document.getElementById('homeOfflineAllBtn').click()");
  await until(`document.querySelectorAll('#offlineAllRegionList [data-offline-region-id]').length >= ${active.length}`, 'modal list', 30).catch(() => {});
  report.listed = await evaluate("[...document.querySelectorAll('#offlineAllRegionList [data-offline-region-id]')].map(e => e.dataset.offlineRegionId)");
  await evaluate("document.getElementById('offlineAllCloseBtn').click()");
  log(`listed ${report.listed.length}/${active.length}`);

  let migrationDone = false;
  for (const region of targets) {
    const id = region.id, r = { id, label: region.label, bbox: region.bbox, skiServerStatus: region.ski_data_status, checks: {}, failures: [] };
    report.regions.push(r);
    const fail = (key, message) => { r.checks[key] = 'FAIL'; r.failures.push(`${key}: ${message}`); };
    const pass = key => { if (r.checks[key] !== 'FAIL') r.checks[key] = 'PASS'; };
    const b = (region.bbox || []).map(Number);
    try {
      report.listed.includes(id) ? pass('A_listed') : fail('A_listed', 'not in the offline list');
      const bboxOk = b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && b[2] - b[0] <= 0.5 && b[3] - b[1] <= 0.5;
      bboxOk ? pass('B_bbox') : fail('B_bbox', JSON.stringify(region.bbox));
      r.estimate = await evaluate(store(`estimate(${JSON.stringify(b)})`));
      if (!(await evaluate(pickHomeRegion(id)))) throw new Error('region not selectable on home');
      await until(`(() => { const x = document.querySelector('#homeOfflineRegionList [data-offline-region-download="${id}"]'); return x && !x.disabled; })()`, 'download button', 30);
      r.labelBefore = await evaluate(stateLabel);
      net.hosts = {};
      const t0 = Date.now();
      await evaluate(`document.querySelector('#homeOfflineRegionList [data-offline-region-download="${id}"]').click()`);
      pass('C_start');
      const phases = new Set();
      for (let i = 0; i < 1440; i++) {
        const label = await evaluate(stateLabel);
        const phase = /^(?:진행 정체 · )?(위성 다운로드|지형 다운로드|고도 데이터 다운로드|등고선 생성|리프트·슬로프 저장)/.exec(label)?.[1]; if (phase) phases.add(phase);
        const meta = await evaluate(store(`getRegionMeta('${id}')`));
        const busy = await evaluate(`(document.querySelector('#homeOfflineRegionList [data-offline-region-download="${id}"]')?.textContent || '') === '취소'`);
        if (meta?.downloadedAt && !busy) break;
        await new Promise(res => setTimeout(res, 250));
      }
      r.seconds = Math.round((Date.now() - t0) / 1000);
      r.phasesSeen = [...phases];
      const meta = await evaluate(store(`getRegionMeta('${id}')`));
      const status = await evaluate(store(`getOfflineStatus({ regionId: '${id}' })`));
      r.network = JSON.parse(JSON.stringify(net.hosts));
      Object.assign(r, { satTiles: meta?.counts?.sat, terrainTiles: meta?.counts?.vec, demTiles: meta?.counts?.dem, storedTiles: meta?.tileCount,
        contourFeatures: meta?.contourFeatureCount, contourMB: +((meta?.contourBytes || 0) / 1e6).toFixed(2), contourZoom: meta?.contourZoom, contourError: meta?.contourError || '',
        skiFeatures: meta?.skiFeatureCount || 0, totalMB: +((meta?.bytes || 0) / 1e6).toFixed(2), status: { complete: status.complete, usable: status.usable, missing: status.missing },
        labelAfter: await evaluate(stateLabel) });
      const sat = r.network.satellite || {}, ofm = r.network.openfreemap || {}, dem = r.network.dem || {};
      meta?.satelliteComplete && sat.ok > 0 && !sat.failed ? pass('D_satellite') : fail('D_satellite', JSON.stringify(sat));
      meta?.terrainComplete && ofm.ok > 0 && !ofm.failed ? pass('E_openfreemap') : fail('E_openfreemap', JSON.stringify(ofm));
      meta?.demComplete && dem.ok > 0 && !dem.failed ? pass('F_dem') : fail('F_dem', JSON.stringify(dem));
      meta?.contourComplete && meta.contourFeatureCount > 0 ? pass('G_contour') : fail('G_contour', meta?.contourError || 'no contour features');
      r.checks.H_skiData = meta?.skiDataComplete && r.skiFeatures > 0 ? 'PASS' : 'NO_SKI_DATA'; // reported apart from the map pack
      if (status.complete) pass('I_complete'); else if (status.usable) r.checks.I_complete = 'MAP_ONLY'; else fail('I_complete', JSON.stringify(status.missing));
      log(id, `${r.seconds}s ${r.totalMB}MB sat ${r.satTiles} vec ${r.terrainTiles} dem ${r.demTiles} contour ${r.contourFeatures} ski ${r.skiFeatures} | ${r.labelAfter}`);

      // Older pack without contours (v8 shape) → 보완 다운로드 adds only the contours: no tile re-download.
      if (!migrationDone && status.usable) {
        migrationDone = true;
        await evaluate(`(async () => { const c = await caches.open('powderline-offline-region-${id}');
          await c.delete(new URL('./offline-tiles/${id}/contour.geojson', document.baseURI).href);
          const db = await new Promise((ok, no) => { const q = indexedDB.open('powderline-pwa-offline-v1', 1); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
          const m = await window.PowderlinePwaOffline.getRegionMeta('${id}');
          for (const k of ['contourComplete', 'contourBytes', 'contourFeatureCount', 'contourInterval', 'contourIndexInterval', 'contourZoom', 'contourError']) delete m[k];
          await new Promise((ok, no) => { const tx = db.transaction('regions', 'readwrite'); tx.objectStore('regions').put(m); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
          db.close(); })()`);
        await evaluate(pickHomeRegion(id));
        await until(`(() => { const x = document.querySelector('#homeOfflineRegionList [data-offline-region-download="${id}"]'); return x && !x.disabled; })()`, 'migration button', 30);
        const before = await evaluate(store(`getOfflineStatus({ regionId: '${id}' })`));
        const labelOld = await evaluate(stateLabel);
        const buttonOld = await evaluate(`document.querySelector('#homeOfflineRegionList [data-offline-region-download="${id}"]')?.textContent || ''`);
        net.hosts = {};
        const m0 = Date.now();
        await evaluate(`document.querySelector('#homeOfflineRegionList [data-offline-region-download="${id}"]').click()`);
        await until(`window.PowderlinePwaOffline.getRegionMeta('${id}').then(m => m?.contourComplete === true)`, 'migration contours', 180);
        await new Promise(res => setTimeout(res, 1500));
        const tileRequests = ['satellite', 'openfreemap', 'dem'].reduce((n, h) => n + (net.hosts[h]?.ok || 0) + (net.hosts[h]?.notFound || 0), 0);
        const after = await evaluate(store(`getRegionMeta('${id}')`));
        report.migration = { regionId: id, before: { complete: before.complete, usable: before.usable, missing: before.missing, label: labelOld, button: buttonOld },
          seconds: Math.round((Date.now() - m0) / 1000), tileRequests, contourFeatures: after.contourFeatureCount,
          result: tileRequests === 0 && after.contourComplete ? 'PASS' : 'FAIL' };
        log('migration', JSON.stringify(report.migration));
      }

      // Network off + full PWA reload on this region (Ride On / courses / GPS are checked by hand, not here), then the
      // same map offline: satellite / terrain / winter, DEM terrain, contours, ski layer, stored tiles only.
      if (status.usable) {
        await evaluate(`localStorage.setItem('powderline.pwaOffline.lastRegion', '${id}')`);
        await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
        net.mapboxStyle = 0;
        await cdp('Page.reload', {});
        await until('navigator.onLine === false', 'offline reload', 60);
        await boot();
        await until(`window.__powderlineTest.pwaOffline.active && window.__powderlineTest.pwaOffline.regionId === '${id}'`, 'cold start region', 30);
        await evaluate(watchTileErrors);
        await evaluate(`window.__powderlineTest.map.jumpTo({ center: [${(b[0] + b[2]) / 2}, ${(b[1] + b[3]) / 2}], zoom: 13.8, pitch: 55 }); undefined`);
        await until(mapIdle, 'cold idle', 60);
        await new Promise(res => setTimeout(res, 1500));
        r.coldStart = { ...(await evaluate(mapInfo)), mapboxStyleRequests: net.mapboxStyle };
        r.coldStart.offlineRegion === id && r.coldStart.mapboxStyleRequests === 0 && r.coldStart.terrain === 'pwa-offline-dem' && /offline/.test(r.coldStart.name)
          ? pass('N_airplaneRestart') : fail('N_airplaneRestart', JSON.stringify(r.coldStart));
        r.styles = {};
        for (const key of ['satellite', 'topo', 'winter']) {
          await evaluate(pickStyle(key));
          await until(`window.__powderlineTest.state.mapStyle === '${key}' && window.__powderlineTest.map.getStyle()?.name?.includes('offline') && ${mapIdle}`, `offline ${key}`, 90);
          await new Promise(res => setTimeout(res, 1200));
          r.styles[key] = await evaluate(mapInfo);
        }
        r.screenshot = await shot(`${id}-winter`);
        const s = r.styles;
        s.satellite.terrain === 'pwa-offline-dem' && s.topo.terrain === 'pwa-offline-dem' && s.winter.terrain === 'pwa-offline-dem' ? pass('M_terrain3D') : fail('M_terrain3D', 'terrain source');
        /offline satellite/.test(s.satellite.name) && /offline terrain/.test(s.topo.name) && /offline winter/.test(s.winter.name) ? pass('M_styles') : fail('M_styles', `${s.satellite.name} | ${s.topo.name} | ${s.winter.name}`);
        s.topo.contourLayers === 3 && s.winter.contourLayers === 3 && s.topo.contourFeatures > 0 && s.winter.contourFeatures > 0 && s.satellite.contourLayers === 0
          ? pass('M_contourLayer') : fail('M_contourLayer', `topo ${s.topo.contourLayers}/${s.topo.contourFeatures} winter ${s.winter.contourLayers}/${s.winter.contourFeatures} sat ${s.satellite.contourLayers}`);
        r.checks.M_skiLayer = s.topo.ski > 0 ? 'PASS' : r.skiFeatures ? 'FAIL' : 'NO_SKI_DATA';
        if (r.checks.M_skiLayer === 'FAIL') r.failures.push('M_skiLayer: ski data stored but no features on the map');
        s.winter.tileErrors === 0 ? pass('M_tiles404') : fail('M_tiles404', `${s.winter.tileErrors} tile errors ${JSON.stringify(s.winter.tileErrorSample)}`);
        await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await until('navigator.onLine === true', 'online again', 20);
        await evaluate("localStorage.removeItem('powderline.pwaOffline.lastRegion')");
        await cdp('Page.reload', {});
        await boot();
      } else {
        fail('M_offlineMap', 'map pack not usable');
      }

      // J. Delete only this region.
      await evaluate("caches.open('powderline-offline-region-zz-other').then(c => c.put('/zz', new Response('x')))");
      await evaluate('window.confirm = () => true');
      await evaluate(pickHomeRegion(id));
      await until(`Boolean(document.querySelector('#homeOfflineRegionList [data-offline-region-delete="${id}"]'))`, 'delete button', 20);
      await evaluate(`document.querySelector('#homeOfflineRegionList [data-offline-region-delete="${id}"]').click()`);
      await until(store(`getOfflineStatus({ regionId: '${id}' }).then(s => !s.downloaded)`), 'deleted', 30);
      const gone = !(await evaluate(`caches.has('powderline-offline-region-${id}')`)), other = await evaluate("caches.has('powderline-offline-region-zz-other')");
      gone && other ? pass('J_delete') : fail('J_delete', `regionCacheGone=${gone} otherKept=${other}`);
    } catch (error) {
      fail('ERROR', error.message);
      try {
        r.debug = await evaluate(`(() => { const t = window.__powderlineTest, m = t?.map; return { offline: t?.pwaOffline?.active, region: t?.pwaOffline?.regionId,
          style: m?.getStyle()?.name || '', styleLoaded: m?.isStyleLoaded(), loaded: m?.loaded(), moving: m?.isMoving(), view: document.body.dataset.mobileView || '',
          homeRegion: document.getElementById('homeRegionSelect')?.value, mapRegion: document.getElementById('region')?.value, rideDisabled: document.getElementById('homeRideOnBtn')?.disabled,
          toast: document.getElementById('toast')?.textContent || '', errors: (window.__tileErrors || []).slice(0, 5) }; })()`);
      } catch {}
      try { await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await cdp('Page.reload', {}); await boot(); } catch {}
    }
    r.result = r.failures.length ? 'FAIL' : 'PASS';
    log(id, r.result, JSON.stringify(r.checks));
    await writeFile(join(testDir, 'report.json'), JSON.stringify(report, null, 1));
  }
  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 1));
} catch (error) {
  console.log(JSON.stringify(report, null, 1));
  console.error('FAILED:', error.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  chrome.kill();
  server.close();
}
