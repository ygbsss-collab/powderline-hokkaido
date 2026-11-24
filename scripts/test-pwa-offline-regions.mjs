// Local Chrome test of the PWA offline regions on the main Mapbox map (dist/pwa-offline-store.js + sw.js + app.js).
// Online Mapbox styles → download one region through the existing offline menu → offline satellite / terrain / winter
// on the same map → cold start with the network off → Ride On → delete only that region.
// Run from the repository root with Node 24+ and desktop Chrome: node scripts/test-pwa-offline-regions.mjs [regionId]
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';

const regionId = process.argv[2] || 'kiroro';
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
const port = server.address().port;
const appUrl = `http://127.0.0.1:${port}${mountPath}/`;
const testDir = await mkdtemp(join(tmpdir(), 'powderline-pwa-offline-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--remote-debugging-port=0',
  `--user-data-dir=${testDir}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });

const log = (...a) => console.error('[test]', ...a);
const result = { regionId, steps: {} };
let ws;
try {
  let debuggingPort;
  for (let i = 0; i < 100 && !debuggingPort; i++) {
    try { debuggingPort = Number((await readFile(join(testDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch {}
    if (!debuggingPort) await new Promise(r => setTimeout(r, 200));
  }
  const page = (await (await fetch(`http://127.0.0.1:${debuggingPort}/json`)).json()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const pending = new Map(); let nextId = 0;
  const net = { mapboxStyle: 0, offlineOk: 0, offline404: 0, failed: 0, track: false };
  const reqUrls = new Map();
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.method === 'Network.requestWillBeSent') {
      reqUrls.set(m.params.requestId, m.params.request.url);
      if (net.track && /api\.mapbox\.com\/styles\//.test(m.params.request.url)) net.mapboxStyle++;
    }
    if (m.method === 'Network.responseReceived' && net.track && m.params.response.url.includes('/offline-tiles/')) {
      if (m.params.response.status === 200) net.offlineOk++; else net.offline404++;
    }
    if (m.method === 'Network.loadingFailed' && net.track && /mapbox\.com\/styles/.test(reqUrls.get(m.params.requestId) || '')) net.failed++;
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
  async function shot(name) {
    // The signed-out test browser keeps the app UI behind the login screen, so read the map canvas itself
    // inside a render frame (the WebGL buffer is valid there).
    const data = await evaluate(`new Promise(res => { const m = window.__powderlineTest.map;
      m.once('render', () => res({ url: m.getCanvas().toDataURL('image/png'), w: m.getCanvas().width, h: m.getCanvas().height }));
      m.triggerRepaint(); })`);
    const path = join(testDir, `${name}.png`);
    await writeFile(path, Buffer.from(data.url.split(',')[1], 'base64'));
    return `${path} (${data.w}x${data.h})`;
  }
  const mapIdle = "(() => { const m = window.__powderlineTest?.map; return Boolean(m && m.isStyleLoaded() && m.loaded()); })()";
  const mapInfo = `(() => { const t = window.__powderlineTest, m = t.map, st = m.getStyle();
    return { name: st?.name || '', sources: Object.keys(st?.sources || {}), terrain: m.getTerrain()?.source || null,
      mapStyle: t.state.mapStyle, offlineActive: t.pwaOffline.active, offlineRegion: t.pwaOffline.regionId,
      ski: m.getSource('ski-facilities') ? m.querySourceFeatures('ski-facilities').length : -1,
      routeLayers: ['route-line', 'route-points'].filter(id => m.getLayer(id)).length,
      zoom: +m.getZoom().toFixed(2), pitch: +m.getPitch().toFixed(1) }; })()`;
  // Same path as a tap: open the existing style popover from a real trigger once, then pick the style in it.
  const pickStyle = key => `(() => { if (!document.getElementById('mapStylePopover')) { const b = document.getElementById('satelliteBtn'); b?.click(); b?.click(); }
    document.querySelector('#mapStylePopover [data-map-style="${key}"]')?.click(); })()`;

  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: appUrl });
  await until("Boolean(window.PowderlinePwaOffline)", 'store loaded');
  await until("navigator.serviceWorker.ready.then(() => true)", 'service worker ready');
  await cdp('Page.reload', {}); // second load: page controlled by the service worker
  await until("Boolean(navigator.serviceWorker.controller)", 'page controlled by SW');
  await until(mapIdle, 'online map idle', 90);

  // 1–3. Online Mapbox styles (unchanged path).
  result.steps.online = { satellite: await evaluate(mapInfo) };
  for (const key of ['topo', 'winter', 'satellite']) {
    await evaluate(pickStyle(key));
    await until(`window.__powderlineTest.state.mapStyle === '${key}' && ${mapIdle}`, `online ${key}`, 60);
    result.steps.online[key] = await evaluate(mapInfo);
  }
  log('online styles', JSON.stringify(Object.fromEntries(Object.entries(result.steps.online).map(([k, v]) => [k, v.name]))));

  // 4–5. The region from Supabase powderline_regions in the existing offline list → download.
  await until(`[...document.querySelectorAll('#homeRegionSelect option')].some(o => o.value === '${regionId}')`, 'region in catalog', 60);
  await evaluate(`(() => { const s = document.getElementById('homeRegionSelect'); s.value = '${regionId}'; s.dispatchEvent(new Event('change')); document.getElementById('homeOfflineMapModeBtn').click(); })()`);
  await until(`(() => { const b = document.querySelector('#homeOfflineRegionList [data-offline-region-download="${regionId}"]'); return b && !b.disabled; })()`, 'download button', 30);
  const t0 = Date.now();
  await evaluate(`document.querySelector('#homeOfflineRegionList [data-offline-region-download="${regionId}"]').click()`);
  for (let i = 0; i < 1200; i++) {
    const s = await evaluate(`window.PowderlinePwaOffline.getOfflineStatus({ regionId: '${regionId}' })`);
    if (s?.complete) break;
    if (i % 20 === 0) log('downloading:', await evaluate(`document.querySelector('#homeOfflineRegionList .home-offline-region-state')?.textContent || ''`));
    await new Promise(r => setTimeout(r, 500));
  }
  const meta = await evaluate(`window.PowderlinePwaOffline.getRegionMeta('${regionId}')`);
  if (!meta?.satelliteComplete || !meta?.terrainComplete || !meta?.demComplete) throw new Error(`download incomplete: ${JSON.stringify(meta)}`);
  result.steps.download = { seconds: Math.round((Date.now() - t0) / 1000), bytes: meta.bytes, mb: +(meta.bytes / 1e6).toFixed(2),
    tileCount: meta.tileCount, counts: meta.counts, skiDataComplete: meta.skiDataComplete, bbox: meta.bbox,
    label: await evaluate(`document.querySelector('#homeOfflineRegionList .home-offline-region-state')?.textContent || ''`) };
  log('download', JSON.stringify(result.steps.download));

  // 6–10. Offline mode on the same map: satellite / terrain / winter, 3D terrain, lifts / runs.
  net.track = true;
  await until("!document.getElementById('homeRideOnBtn').disabled", 'offline RIDE ON enabled', 20);
  await evaluate("document.getElementById('homeRideOnBtn').click()");
  await until(`window.__powderlineTest.pwaOffline.active && window.__powderlineTest.map.getStyle()?.name?.includes('offline') && ${mapIdle}`, 'offline style', 90);
  await evaluate("window.__powderlineTest.map.jumpTo({ zoom: 14.5, pitch: 60 }); undefined");
  result.steps.offline = {};
  for (const key of ['satellite', 'topo', 'winter']) {
    if (key !== 'satellite') await evaluate(pickStyle(key));
    await until(`window.__powderlineTest.state.mapStyle === '${key}' && window.__powderlineTest.map.getStyle()?.name?.includes('offline') && ${mapIdle}`, `offline ${key}`, 90);
    await new Promise(r => setTimeout(r, 1500));
    result.steps.offline[key] = { ...(await evaluate(mapInfo)), screenshot: await shot(`offline-${key}`) };
  }
  result.steps.offline.rideView = await evaluate("document.body.dataset.mobileView || ''");
  result.steps.offline.mapboxStyleRequests = net.mapboxStyle;
  result.steps.offline.tiles = { ok: net.offlineOk, notStored: net.offline404 };
  log('offline styles', JSON.stringify(Object.fromEntries(Object.entries(result.steps.offline).filter(([, v]) => v?.name).map(([k, v]) => [k, `${v.name} terrain=${v.terrain} ski=${v.ski}`]))));

  // 14–15. Network off + full reload: starts directly on the stored region, no mapbox:// style request.
  await evaluate(pickStyle('satellite'));
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  Object.assign(net, { mapboxStyle: 0, offlineOk: 0, offline404: 0, failed: 0 });
  await cdp('Page.reload', { ignoreCache: false });
  await until("navigator.onLine === false && Boolean(window.__powderlineTest)", 'offline reload', 60);
  await until(`window.__powderlineTest.pwaOffline.active && ${mapIdle}`, 'offline cold start map', 90);
  await new Promise(r => setTimeout(r, 2500));
  result.steps.coldStart = { ...(await evaluate(mapInfo)), mapboxStyleRequests: net.mapboxStyle, tiles: { ok: net.offlineOk, notStored: net.offline404 },
    screenshot: await shot('offline-cold-start') };
  // Offline RIDE ON from home (offline mode).
  await evaluate(`(() => { const s = document.getElementById('homeRegionSelect'); if (s.value !== '${regionId}') { s.value = '${regionId}'; s.dispatchEvent(new Event('change')); } document.getElementById('homeOfflineMapModeBtn').click(); })()`);
  await until("!document.getElementById('homeRideOnBtn').disabled", 'offline RIDE ON enabled (cold start)', 30);
  await evaluate("document.getElementById('homeRideOnBtn').click()");
  await until("document.body.dataset.mobileView === 'ride'", 'ride view', 20);
  result.steps.coldStart.rideView = 'ride';
  for (const key of ['topo', 'winter']) {
    await evaluate(pickStyle(key));
    await until(`window.__powderlineTest.state.mapStyle === '${key}' && ${mapIdle}`, `cold-start ${key}`, 60);
  }
  result.steps.coldStart.afterSwitch = await evaluate(mapInfo);
  log('cold start', JSON.stringify({ name: result.steps.coldStart.name, mapbox: result.steps.coldStart.mapboxStyleRequests, ride: result.steps.coldStart.rideView }));

  // 16. Back online → home online mode → existing Mapbox style.
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until('navigator.onLine === true', 'online again', 20);
  await evaluate("document.querySelector('[data-mobile-nav=\"home\"], #rideHomeBtn, [data-view-target=\"home\"]')?.click?.(); document.getElementById('homeOnlineMapModeBtn').click(); document.getElementById('homeRideOnBtn').click()");
  await until(`!window.__powderlineTest.pwaOffline.active && !window.__powderlineTest.map.getStyle()?.name?.includes('offline') && ${mapIdle}`, 'back to online Mapbox', 90);
  result.steps.backOnline = await evaluate(mapInfo);

  // 17. Delete only this region (a dummy second region cache must survive).
  await evaluate("caches.open('powderline-offline-region-zz-other').then(c => c.put('/zz', new Response('x')))");
  await evaluate("window.confirm = () => true");
  await evaluate(`(() => { const s = document.getElementById('homeRegionSelect'); s.value = '${regionId}'; s.dispatchEvent(new Event('change')); document.getElementById('homeOfflineMapModeBtn').click(); })()`);
  await until(`Boolean(document.querySelector('#homeOfflineRegionList [data-offline-region-delete="${regionId}"]'))`, 'delete button', 20);
  await evaluate(`document.querySelector('#homeOfflineRegionList [data-offline-region-delete="${regionId}"]').click()`);
  await until(`window.PowderlinePwaOffline.getOfflineStatus({ regionId: '${regionId}' }).then(s => !s.downloaded)`, 'deleted', 30);
  result.steps.delete = {
    regionCache: await evaluate(`caches.has('powderline-offline-region-${regionId}')`),
    otherCache: await evaluate("caches.has('powderline-offline-region-zz-other')"),
    rideOnDisabled: await evaluate("document.getElementById('homeRideOnBtn').disabled")
  };
  console.log(JSON.stringify(result, null, 1));
} catch (error) {
  console.log(JSON.stringify(result, null, 1));
  console.error('FAILED:', error.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  chrome.kill();
  server.close();
}
