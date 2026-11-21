// Local Chrome PoC smoke test: download, reload with network disabled, inspect 3D state.
// Run from the repository root with Node 24+ and desktop Chrome installed.
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist');
const mountPath = '/powderline-hokkaido';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.pmtiles': 'application/octet-stream', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname !== mountPath && !pathname.startsWith(mountPath + '/')) {
      response.writeHead(404).end(); return;
    }
    const relative = pathname.slice(mountPath.length);
    const file = resolve(root, `.${relative === '/' || !relative ? '/index.html' : relative}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Content-Length': data.length });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const testDir = await mkdtemp(join(tmpdir(), 'powderline-kiroro-poc-'));
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--remote-debugging-port=0', `--user-data-dir=${testDir}`,
  `http://127.0.0.1:${port}${mountPath}/pwa-kiroro-offline.html`,
], { windowsHide: true, stdio: 'ignore' });

let ws;
try {
  let debuggingPort;
  for (let i = 0; i < 100; i++) {
    try {
      debuggingPort = Number((await readFile(join(testDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      if (debuggingPort) break;
    } catch { /* Chrome is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!debuggingPort) throw new Error('Chrome DevTools did not start');
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json`)).json();
  const page = targets.find(target => target.type === 'page');
  if (!page) throw new Error('Chrome page target not found');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const pending = new Map();
  let nextId = 0;
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  });
  function cdp(method, params = {}, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, timeout);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(new Error(`${method}: ${error.message}`)); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression, awaitPromise = true) {
    const reply = await cdp('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text);
    return reply.result.value;
  }
  async function until(expression, expected = true, attempts = 100) {
    for (let i = 0; i < attempts; i++) {
      try { if (await evaluate(expression) === expected) return; } catch { /* Page may be reloading. */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${expression}`);
  }
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await until('Boolean(window.__kiroroOfflinePoc)');
  await until("!document.getElementById('status').textContent.includes('확인 중')");
  const before = await evaluate('window.__kiroroOfflinePoc.getStatus()');
  console.error('Chrome PoC: downloading');
  await evaluate('window.__kiroroOfflinePoc.download()');
  const downloaded = await evaluate('window.__kiroroOfflinePoc.verify()');
  if (!downloaded) throw new Error(`Download failed: ${await evaluate('window.__kiroroOfflinePoc.getStatus()')}`);
  try {
    await until("document.getElementById('mapStatus').textContent.includes('3D 지형 준비됨')", true, 120);
  } catch (error) {
    console.error('Map diagnostics:', await evaluate(`({status:document.getElementById('status').textContent,
      mapStatus:document.getElementById('mapStatus').textContent,
      styleLoaded:window.__kiroroOfflinePoc.getMap()?.isStyleLoaded(),
      terrain:window.__kiroroOfflinePoc.getMap()?.getTerrain(),
      demLoaded:window.__kiroroOfflinePoc.getMap()?.isSourceLoaded('dem'),
      loaded:window.__kiroroOfflinePoc.getMap()?.loaded()})`));
    throw error;
  }
  console.error('Chrome PoC: online map loaded');
  const onlineMap = await evaluate(`({terrain: !!window.__kiroroOfflinePoc.getMap()?.getTerrain(),
    loaded: window.__kiroroOfflinePoc.getMap()?.loaded(),
    skiFeatures: window.__kiroroOfflinePoc.getMap()?.getStyle()?.sources?.ski?.data?.features?.length,
    status: document.getElementById('mapStatus').textContent})`);

  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0,
    downloadThroughput: 0, uploadThroughput: 0 });
  console.error('Chrome PoC: reloading offline');
  await cdp('Page.reload', { ignoreCache: true });
  await until('Boolean(window.__kiroroOfflinePoc)', true, 120);
  await until("document.getElementById('status').textContent.includes('저장 완료')", true, 120);
  await evaluate('window.__kiroroOfflinePoc.showMap()');
  await until("document.getElementById('mapStatus').textContent.includes('3D 지형 준비됨')", true, 120);
  await evaluate("window.__kiroroOfflinePoc.getMap().zoomTo(13, {duration:0}); window.__kiroroOfflinePoc.getMap().rotateTo(40, {duration:0}); undefined;");
  await until('window.__kiroroOfflinePoc.getMap()?.loaded() === true', true, 120);
  const offlineMap = await evaluate(`({terrain: !!window.__kiroroOfflinePoc.getMap()?.getTerrain(),
    loaded: window.__kiroroOfflinePoc.getMap()?.loaded(),
    skiFeatures: window.__kiroroOfflinePoc.getMap()?.getStyle()?.sources?.ski?.data?.features?.length,
    zoom: window.__kiroroOfflinePoc.getMap()?.getZoom(),
    bearing: window.__kiroroOfflinePoc.getMap()?.getBearing(),
    status: document.getElementById('mapStatus').textContent})`);
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const screenshotPath = join(testDir, 'offline-3d.png');
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify({ before, downloaded, onlineMap, offlineMap, screenshotPath }));
} finally {
  ws?.close();
  chrome.kill();
  server.close();
}
