/* POWDERLINE browser PWA offline regions (any powderline_regions row with a bbox; nothing region-specific here).
 * One region = Cache Storage `powderline-offline-region-{regionId}` (satellite / vector / DEM tiles + ski data, stored
 * under the same URLs the main Mapbox map requests; sw.js answers them) + one metadata record in IndexedDB.
 * Same call shape as the Android OfflineMapTest download API (downloadRegion / getOfflineStatus / cancelRegionDownload /
 * listOfflineRegions + 'offlineDownloadProgress' events), so app.js reuses its download list / queue / progress UI.
 * Android app / WebView: allowed() is false and nothing here runs. */
(() => {
  'use strict';

  const STORE_VERSION = 'pwa-offline-v1';
  const DB_NAME = 'powderline-pwa-offline-v1';
  const CACHE_PREFIX = 'powderline-offline-region-';
  const SOURCES = {
    // Satellite: Esri World Imagery (test source). Vector: OpenFreeMap (OpenMapTiles schema, OSM data). DEM: AWS terrarium.
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    vectorTileJson: 'https://tiles.openfreemap.org/planet',
    dem: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
  };
  const ATTRIBUTION = {
    satellite: 'Imagery © Esri, Maxar, Earthstar Geographics',
    vector: '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors',
    dem: 'Terrain: AWS Open Data Terrain Tiles / USGS, NOAA'
  };
  // Detail = region bbox, context = bbox padded like Android (horizon / edges of a tilted 3D view are not empty).
  const PLAN = {
    satContext: [8, 13], satDetail: [14, 17],
    vector: [8, 14], // context bbox (covers the detail bbox); map overzooms past 14
    dem: [8, 14]     // context bbox
  };
  const CONCURRENCY = 6;
  const LEGACY = { db: 'powderline-pwa-kiroro-offline-v1', cache: 'powderline-pwa-kiroro-dem-v1' }; // replaced Kiroro PoC

  function allowed() {
    const cap = window.Capacitor, platform = cap?.getPlatform?.();
    if (cap?.isNativePlatform?.() || platform === 'android' || platform === 'ios') return false;
    if (/Android.*(?:;\s*wv\)|Version\/4\.0.*Chrome\/)/i.test(navigator.userAgent)) return false;
    if (!('serviceWorker' in navigator) || !('caches' in window) || !('indexedDB' in window)) return false;
    const official = location.origin === 'https://ygbsss-collab.github.io' && location.pathname.startsWith('/powderline-hokkaido/');
    const localTest = /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(location.origin) && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return official || localTest;
  }
  if (!allowed()) return;

  const base = new URL('./', document.baseURI).href;
  const cacheName = id => `${CACHE_PREFIX}${id}`;
  const safeId = id => /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''));
  const tileUrl = (id, kind, z, x, y) => `${base}offline-tiles/${id}/${kind}/${z}/${x}/${y}.${kind === 'sat' ? 'jpg' : kind === 'vec' ? 'pbf' : 'png'}`;
  const skiUrl = id => `${base}offline-tiles/${id}/ski.geojson`;

  // ---- metadata (IndexedDB) ----
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('regions', { keyPath: 'regionId' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function dbOp(mode, action) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('regions', mode);
        const request = action(tx.objectStore('regions'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }
  const getMeta = id => dbOp('readonly', store => store.get(id)).then(v => v || null).catch(() => null);
  const putMeta = meta => dbOp('readwrite', store => store.put(meta));
  const deleteMeta = id => dbOp('readwrite', store => store.delete(id));
  const allMeta = () => dbOp('readonly', store => store.getAll()).then(v => v || []).catch(() => []);

  // ---- tile plan ----
  function tileX(lon, z) { return Math.floor((lon + 180) / 360 * 2 ** z); }
  function tileY(lat, z) { return Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z); }
  function contextBbox(b) {
    const padLng = Math.max(0.05, b[2] - b[0]), padLat = Math.max(0.05, b[3] - b[1]);
    return [Math.max(-180, b[0] - padLng), Math.max(-85, b[1] - padLat), Math.min(180, b[2] + padLng), Math.min(85, b[3] + padLat)];
  }
  function tilesIn(b, [minZ, maxZ]) {
    const out = [];
    for (let z = minZ; z <= maxZ; z++) {
      const max = 2 ** z - 1;
      for (let x = Math.max(0, tileX(b[0], z)); x <= Math.min(max, tileX(b[2], z)); x++) {
        for (let y = Math.max(0, tileY(b[3], z)); y <= Math.min(max, tileY(b[1], z)); y++) out.push({ z, x, y });
      }
    }
    return out;
  }
  function plan(bbox) {
    const ctx = contextBbox(bbox);
    return {
      contextBbox: ctx,
      sat: [...tilesIn(ctx, PLAN.satContext), ...tilesIn(bbox, PLAN.satDetail)],
      vec: tilesIn(ctx, PLAN.vector),
      dem: tilesIn(ctx, PLAN.dem)
    };
  }
  function validBbox(b) {
    return Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3]
      && b[2] - b[0] <= 0.5 && b[3] - b[1] <= 0.5; // same limits as the Android download
  }

  // ---- download ----
  const listeners = new Set();
  const jobs = new Map(); // regionId -> { jobId, cancelled }
  function emit(event) { for (const fn of listeners) { try { fn(event); } catch {} } }
  function cancelledError() { const e = new Error('다운로드가 취소되었습니다.'); e.code = 'CANCELLED'; return e; }

  async function fetchWithRetry(url, attempts = 3) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
        if (response.status === 404 || response.status === 204) return null; // no tile there (sea / outside data)
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.blob();
      } catch (error) {
        lastError = error;
        await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastError || new Error('download failed');
  }
  async function vectorTemplate() {
    const response = await fetch(SOURCES.vectorTileJson, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`벡터 지도 정보를 받지 못했습니다 (HTTP ${response.status})`);
    const tileJson = await response.json();
    const template = Array.isArray(tileJson?.tiles) ? tileJson.tiles[0] : '';
    if (!/^https:\/\/.+\{z\}.+\{x\}.+\{y\}/.test(template)) throw new Error('벡터 지도 주소 형식이 올바르지 않습니다.');
    return template;
  }

  async function downloadRegion(payload) {
    const id = String(payload?.regionId || '');
    const bbox = (payload?.bounds || []).map(Number);
    const center = (payload?.center || []).map(Number);
    if (!safeId(id) || !validBbox(bbox) || center.length !== 2 || !center.every(Number.isFinite)) {
      throw new Error('지역 범위(bbox)가 올바르지 않아 다운로드할 수 없습니다.');
    }
    if (navigator.onLine === false) throw new Error('네트워크 연결 후 다운로드하세요.');
    if (jobs.has(id)) throw new Error('이미 다운로드 중입니다.');
    const job = { jobId: payload.jobId || `${id}-${Date.now()}`, cancelled: false };
    jobs.set(id, job);
    try {
      await navigator.storage?.persist?.().catch(() => false);
      const tiles = plan(bbox);
      const vec = await vectorTemplate();
      const previous = await getMeta(id);
      // A changed bbox or store version starts this region over (other regions are untouched).
      if (previous && (previous.version !== STORE_VERSION || previous.bbox?.some((v, i) => Math.abs(v - bbox[i]) > 1e-9))) {
        await caches.delete(cacheName(id));
      }
      const meta = {
        regionId: id, version: STORE_VERSION, label: payload.regionName || id, bbox, contextBbox: tiles.contextBbox, center,
        zoom: Number(payload.zoom) || null, bearing: Number(payload.bearing) || 0, pitch: Number(payload.pitch) || null,
        downloadedAt: previous?.downloadedAt || null, satelliteComplete: false, terrainComplete: false, demComplete: false,
        skiDataComplete: false, skiDataVersion: '', bytes: 0, tileCount: 0,
        counts: { sat: tiles.sat.length, vec: tiles.vec.length, dem: tiles.dem.length }, vectorTemplate: vec, sources: SOURCES
      };
      await putMeta(meta);
      const cache = await caches.open(cacheName(id));
      const work = [
        ...tiles.sat.map(t => ({ kind: 'sat', t, src: SOURCES.satellite })),
        ...tiles.vec.map(t => ({ kind: 'vec', t, src: vec })),
        ...tiles.dem.map(t => ({ kind: 'dem', t, src: SOURCES.dem }))
      ];
      const required = work.length + 1; // + ski data
      const started = Date.now();
      let done = 0, bytes = 0, stored = 0, errored = 0, cursor = 0, firstError = null;
      const okByKind = { sat: 0, vec: 0, dem: 0 };
      const progress = () => {
        const percent = required ? (done / required) * 100 : 0;
        const rate = done / Math.max(1, (Date.now() - started) / 1000);
        emit({ regionId: id, jobId: job.jobId, phase: 'tiles', done, required, percent, mb: bytes / 1e6,
          etaSec: rate > 0 ? Math.round((required - done) / rate) : 0, errored });
      };
      progress();
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < work.length && !firstError) {
          if (job.cancelled) throw cancelledError();
          const { kind, t, src } = work[cursor++];
          const key = tileUrl(id, kind, t.z, t.x, t.y);
          try {
            const existing = await cache.match(key);
            if (existing) {
              bytes += Number(existing.headers.get('x-pl-bytes')) || 0;
              stored++; okByKind[kind]++;
            } else {
              const blob = await fetchWithRetry(src.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y));
              if (job.cancelled) throw cancelledError();
              if (blob) {
                const type = kind === 'sat' ? 'image/jpeg' : kind === 'vec' ? 'application/vnd.mapbox-vector-tile' : 'image/png';
                await cache.put(key, new Response(blob, { headers: { 'Content-Type': type, 'x-pl-bytes': String(blob.size) } }));
                bytes += blob.size; stored++;
              }
              okByKind[kind]++; // a 404 at the source (no data there) also counts as done
            }
          } catch (error) {
            if (error?.code === 'CANCELLED') throw error;
            errored++;
            if (errored > Math.max(5, work.length * 0.02)) firstError ??= new Error(`타일 다운로드 실패가 많습니다 (${errored}개). 네트워크를 확인하세요.`);
          }
          done++;
          if (done % 8 === 0) progress();
        }
      });
      await Promise.all(workers);
      if (job.cancelled) throw cancelledError();
      if (firstError) throw firstError;

      // Ski data: published file (Supabase Storage) when the server marked it ready, else the bundled one, else none.
      let skiOk = false;
      const candidates = [];
      if (payload.supabaseUrl && payload.skiDataStatus === 'ready' && payload.skiDataVersion) {
        candidates.push(`${payload.supabaseUrl}/storage/v1/object/public/ski-data/${encodeURIComponent(id)}.geojson?v=${encodeURIComponent(payload.skiDataVersion)}`);
      }
      candidates.push(new URL(`./data/ski/${encodeURIComponent(id)}.geojson`, document.baseURI).href);
      for (const url of candidates) {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) continue;
          const data = await response.json();
          if (!Array.isArray(data?.features)) continue;
          const body = JSON.stringify(data);
          await cache.put(skiUrl(id), new Response(body, { headers: { 'Content-Type': 'application/geo+json', 'x-pl-bytes': String(body.length) } }));
          bytes += body.length; skiOk = true;
          break;
        } catch {}
      }
      done++;
      progress();

      Object.assign(meta, {
        satelliteComplete: okByKind.sat === tiles.sat.length, terrainComplete: okByKind.vec === tiles.vec.length,
        demComplete: okByKind.dem === tiles.dem.length, skiDataComplete: skiOk,
        skiDataVersion: skiOk ? String(payload.skiDataVersion || '') : '', bytes, tileCount: stored, downloadedAt: new Date().toISOString()
      });
      await putMeta(meta);
      return { ok: true, regionId: id, bytes, tileCount: stored, errored };
    } finally {
      jobs.delete(id);
    }
  }

  function statusFromMeta(meta) {
    if (!meta) return { downloaded: false, complete: false, usable: false };
    const core = meta.satelliteComplete && meta.terrainComplete && meta.demComplete;
    const stale = meta.version !== STORE_VERSION;
    const missing = [];
    if (!meta.satelliteComplete) missing.push('pixel_ratio'); // labels: app.js offlineMissingText
    if (!meta.terrainComplete) missing.push('style');
    if (!meta.demComplete) missing.push('terrain');
    return {
      downloaded: true, complete: core && !stale, usable: (meta.terrainComplete || meta.satelliteComplete) && meta.demComplete && !stale,
      needsUpdate: !core || stale, missing,
      pwaBytes: meta.bytes || 0, pwaTileCount: meta.tileCount || 0, skiDataComplete: Boolean(meta.skiDataComplete),
      skiData: { savedBbox: meta.bbox, version: meta.skiDataVersion || '' } // used by app.js bbox-changed check
    };
  }

  // ---- Mapbox styles for the main map (offline mode only; online Mapbox styles are not touched) ----
  function styleFor(meta, key) {
    const id = meta.regionId, ctx = meta.contextBbox || contextBbox(meta.bbox);
    const sources = {
      'pwa-offline-vec': { type: 'vector', tiles: [`${base}offline-tiles/${id}/vec/{z}/{x}/{y}.pbf`], minzoom: PLAN.vector[0], maxzoom: PLAN.vector[1], bounds: ctx, attribution: ATTRIBUTION.vector },
      'pwa-offline-dem': { type: 'raster-dem', tiles: [`${base}offline-tiles/${id}/dem/{z}/{x}/{y}.png`], tileSize: 256, encoding: 'terrarium', minzoom: PLAN.dem[0], maxzoom: PLAN.dem[1], bounds: ctx, attribution: ATTRIBUTION.dem },
      'pwa-offline-hillshade': { type: 'raster-dem', tiles: [`${base}offline-tiles/${id}/dem/{z}/{x}/{y}.png`], tileSize: 256, encoding: 'terrarium', minzoom: PLAN.dem[0], maxzoom: PLAN.dem[1], bounds: ctx }
    };
    const glyphs = 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf'; // labels only when reachable (no offline fonts yet)
    const roads = (color, casing) => [
      { id: 'pwa-road-major', type: 'line', source: 'pwa-offline-vec', 'source-layer': 'transportation', filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
        paint: { 'line-color': color.major, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 3, 17, 6] } },
      { id: 'pwa-road-minor', type: 'line', source: 'pwa-offline-vec', 'source-layer': 'transportation', filter: ['match', ['get', 'class'], ['secondary', 'tertiary', 'minor', 'service', 'track'], true, false],
        minzoom: 10, paint: { 'line-color': color.minor, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.6, 17, 3.5], 'line-opacity': casing } },
      { id: 'pwa-road-path', type: 'line', source: 'pwa-offline-vec', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'path'],
        minzoom: 13, paint: { 'line-color': color.path, 'line-width': 1, 'line-dasharray': [2, 1.5] } }
    ];
    if (key === 'satellite') {
      Object.assign(sources, {
        'pwa-offline-sat-context': { type: 'raster', tiles: [`${base}offline-tiles/${id}/sat/{z}/{x}/{y}.jpg`], tileSize: 256, minzoom: PLAN.satContext[0], maxzoom: PLAN.satContext[1], bounds: ctx, attribution: ATTRIBUTION.satellite },
        'pwa-offline-sat-detail': { type: 'raster', tiles: [`${base}offline-tiles/${id}/sat/{z}/{x}/{y}.jpg`], tileSize: 256, minzoom: PLAN.satDetail[0], maxzoom: PLAN.satDetail[1], bounds: meta.bbox }
      });
      return { version: 8, name: `POWDERLINE offline satellite ${id}`, glyphs, sources, layers: [
        { id: 'pwa-background', type: 'background', paint: { 'background-color': '#1d2a1f' } },
        { id: 'pwa-sat-context', type: 'raster', source: 'pwa-offline-sat-context' },
        { id: 'pwa-sat-detail', type: 'raster', source: 'pwa-offline-sat-detail' },
        ...roads({ major: '#ffffff', minor: '#ffffff', path: '#f8f1da' }, 0.55).map(layer => ({ ...layer, paint: { ...layer.paint, 'line-opacity': 0.55 } }))
      ] };
    }
    const winter = key === 'winter';
    const c = winter
      ? { bg: '#f4f7fb', wood: '#c9d6de', grass: '#edf2f6', rock: '#dfe4ea', ice: '#ffffff', water: '#b6d3e6', building: '#dbe2e8', shadow: '#56708c', highlight: '#ffffff', accent: '#8ea6be', ex: 0.6,
          road: { major: '#8796a5', minor: '#a9b5c1', path: '#7d8b99' } }
      : { bg: '#eef0e5', wood: '#b4cf9f', grass: '#dbe8c8', rock: '#e2ddd3', ice: '#f6fbff', water: '#9fcbe3', building: '#d8cfc4', shadow: '#4a4a3a', highlight: '#ffffff', accent: '#6e6a55', ex: 0.4,
          road: { major: '#f2bd6b', minor: '#ffffff', path: '#857a68' } };
    return { version: 8, name: `POWDERLINE offline ${winter ? 'winter' : 'terrain'} ${id}`, glyphs, sources, layers: [
      { id: 'pwa-background', type: 'background', paint: { 'background-color': c.bg } },
      { id: 'pwa-landcover', type: 'fill', source: 'pwa-offline-vec', 'source-layer': 'landcover',
        paint: { 'fill-color': ['match', ['get', 'class'], 'wood', c.wood, 'grass', c.grass, 'farmland', c.grass, 'rock', c.rock, 'ice', c.ice, 'sand', c.rock, c.grass], 'fill-opacity': 0.85 } },
      { id: 'pwa-park', type: 'fill', source: 'pwa-offline-vec', 'source-layer': 'park', paint: { 'fill-color': c.grass, 'fill-opacity': 0.4 } },
      { id: 'pwa-water', type: 'fill', source: 'pwa-offline-vec', 'source-layer': 'water', paint: { 'fill-color': c.water } },
      { id: 'pwa-waterway', type: 'line', source: 'pwa-offline-vec', 'source-layer': 'waterway', paint: { 'line-color': c.water, 'line-width': 1.2 } },
      { id: 'pwa-hillshade', type: 'hillshade', source: 'pwa-offline-hillshade',
        paint: { 'hillshade-exaggeration': c.ex, 'hillshade-shadow-color': c.shadow, 'hillshade-highlight-color': c.highlight, 'hillshade-accent-color': c.accent } },
      // Contour lines: reserved slot (no offline contour data yet).
      { id: 'pwa-building', type: 'fill', source: 'pwa-offline-vec', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': c.building } },
      ...roads(c.road, 1)
    ] };
  }

  async function readSkiData(id) {
    try {
      const response = await (await caches.open(cacheName(id))).match(skiUrl(id));
      return response ? await response.json() : null;
    } catch { return null; }
  }

  window.PowderlinePwaOffline = {
    allowed,
    addListener(eventName, fn) {
      if (eventName === 'offlineDownloadProgress' && typeof fn === 'function') listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
    downloadRegion,
    async cancelRegionDownload({ regionId } = {}) {
      const job = jobs.get(regionId);
      if (!job) return { cancelled: false };
      job.cancelled = true;
      return { cancelled: true };
    },
    async getOfflineStatus({ regionId } = {}) { return statusFromMeta(await getMeta(regionId)); },
    async listOfflineRegions() {
      const rows = await allMeta();
      return { regions: rows.map(m => ({ regionId: m.regionId, regionName: m.label, center: m.center, bbox: m.bbox })) };
    },
    async deleteRegion({ regionId } = {}) {
      if (!safeId(regionId)) return { deleted: false };
      if (jobs.has(regionId)) jobs.get(regionId).cancelled = true;
      await caches.delete(cacheName(regionId)); // only this region's cache
      await deleteMeta(regionId).catch(() => {});
      return { deleted: true };
    },
    getRegionMeta: getMeta,
    async listCompleteRegions() { return (await allMeta()).filter(m => statusFromMeta(m).complete); },
    styleFor,
    readSkiData,
    plan
  };

  // The isolated Kiroro PoC pack (pwa-kiroro-offline.html) is replaced by this store: drop its unused data once.
  try {
    if (!localStorage.getItem('powderline.pwaOffline.legacyCleared')) {
      indexedDB.deleteDatabase(LEGACY.db);
      caches.delete(LEGACY.cache).catch(() => {});
      localStorage.setItem('powderline.pwaOffline.legacyCleared', '1');
    }
  } catch {}
})();
