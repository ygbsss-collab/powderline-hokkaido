/* Isolated browser-only Kiroro offline 3D PoC. No Mapbox, native map, auth or user data access. */
(() => {
  'use strict';

  const PACK_VERSION = 'kiroro-20261120-z15-v1';
  const PACK_ID = 'kiroro';
  const SKI_AREA_ID = 'dc149ee3d21fe9e7835c7c46db72272c25a6c040';
  const BBOX = [140.966636, 43.048858, 141.042287, 43.079879];
  const BASEMAP_BYTES = 983062;
  const BASEMAP_SHA256 = '0e02ea3f0aac8e7362e1492d4ae27ee71aee9e134914f13b0d2ee515b4df5513';
  const DEM_CACHE = 'powderline-pwa-kiroro-dem-v1';
  const DB_NAME = 'powderline-pwa-kiroro-offline-v1';
  const $ = id => document.getElementById(id);
  const ui = {
    status: $('status'), progress: $('progress'), storage: $('storage'),
    download: $('download'), show: $('show'), remove: $('remove'),
    panel: $('mapPanel'), mapStatus: $('mapStatus'),
  };
  let map = null;
  let busy = false;
  let currentPack = null;
  let protocolRegistered = false;

  function browserAllowed() {
    const capacitor = window.Capacitor;
    if (capacitor?.isNativePlatform?.() || ['android', 'ios'].includes(capacitor?.getPlatform?.())) return false;
    if (/Android.*(?:;\s*wv\)|Version\/4\.0.*Chrome\/)/i.test(navigator.userAgent)) return false;
    const official = location.origin === 'https://ygbsss-collab.github.io'
      && location.pathname.startsWith('/powderline-hokkaido/');
    const local = /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(location.origin)
      && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return official || local;
  }

  function setStatus(message, error = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle('error', error);
  }
  function mb(bytes) { return `${(bytes / 1_000_000).toFixed(1)} MB`; }
  function asset(path) { return new URL(path, location.href).href; }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('packs', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function packOperation(mode, action) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('packs', mode);
        const request = action(tx.objectStore('packs'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  const loadPack = () => packOperation('readonly', store => store.get(PACK_ID));
  const savePack = pack => packOperation('readwrite', store => store.put(pack));
  const deletePack = () => packOperation('readwrite', store => store.delete(PACK_ID));

  async function digestHex(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function fetchBytes(url, expectedBytes, expectedHash) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok || response.type !== 'basic') throw new Error(`다운로드 실패: ${response.status} ${url}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== expectedBytes || await digestHex(bytes) !== expectedHash) {
      throw new Error(`파일 검증 실패: ${url}`);
    }
    return bytes;
  }
  function validManifest(manifest) {
    return manifest?.version === 1 && manifest?.encoding === 'terrarium'
      && manifest?.minzoom === 8 && manifest?.maxzoom === 15
      && Array.isArray(manifest.tiles) && manifest.tiles.length === 185
      && manifest.tiles.every(tile => /^\d{1,2}\/\d+\/\d+\.png$/.test(tile.path)
        && tile.path === `${tile.z}/${tile.x}/${tile.y}.png`
        && tile.bytes > 100 && /^[a-f0-9]{64}$/.test(tile.sha256));
  }
  async function loadManifest() {
    const response = await fetch(asset('./data/offline/kiroro-dem/manifest.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error('DEM 목록을 받지 못했습니다.');
    const manifest = await response.json();
    if (!validManifest(manifest)) throw new Error('DEM 목록 버전 또는 내용이 맞지 않습니다.');
    return manifest;
  }
  async function getSkiData() {
    const response = await fetch(asset('./data/ski/kiroro.geojson'), { cache: 'no-store' });
    if (!response.ok) throw new Error('키로로 스키 데이터를 받지 못했습니다.');
    const source = await response.json();
    const features = source.features.filter(feature =>
      feature.properties?.skiAreas?.some(area => area.properties?.id === SKI_AREA_ID));
    const counts = features.reduce((sum, feature) => {
      const type = feature.properties?.powderlineType;
      sum[type] = (sum[type] || 0) + 1;
      return sum;
    }, {});
    if (features.length !== 62 || counts.lift !== 10 || counts.run !== 46 || counts.station !== 6) {
      throw new Error('키로로 리프트·슬로프 식별 결과가 예상과 다릅니다.');
    }
    return { type: 'FeatureCollection', features };
  }
  function demUrl(tile) { return asset(`./data/offline/kiroro-dem/${tile.path}`); }
  async function cachedTileValid(cache, tile) {
    const response = await cache.match(demUrl(tile));
    return Boolean(response?.ok && (await response.blob()).size === tile.bytes);
  }
  async function verifyPack(pack) {
    if (!pack || pack.version !== PACK_VERSION || !pack.complete ||
        pack.basemap?.size !== BASEMAP_BYTES || pack.skiData?.features?.length !== 62 ||
        !validManifest(pack.manifest)) return false;
    const cache = await caches.open(DEM_CACHE);
    for (const tile of pack.manifest.tiles) {
      if (!await cachedTileValid(cache, tile)) return false;
    }
    return true;
  }
  async function storageStatus() {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) ui.storage.textContent = `브라우저 저장소 사용량 ${mb(estimate.usage || 0)} / 추정 한도 ${mb(estimate.quota || 0)} · 저장소 자동 정리 가능`;
  }
  async function refresh() {
    currentPack = await loadPack();
    const complete = await verifyPack(currentPack);
    ui.show.disabled = busy || !complete;
    ui.remove.disabled = busy || !currentPack;
    ui.download.disabled = busy || complete;
    if (!busy) {
      setStatus(complete
        ? `저장 완료 · DEM ${currentPack.manifest.tiles.length}장 · ${mb(currentPack.totalBytes)} · 오프라인 사용 가능`
        : currentPack ? '저장 중단 또는 누락된 타일이 있습니다. 온라인에서 이어받으세요.'
          : '저장된 키로로 지도가 없습니다. 온라인에서 다운로드하세요.');
    }
    await storageStatus();
    return complete;
  }

  async function download() {
    if (busy) return;
    busy = true;
    ui.download.disabled = ui.show.disabled = ui.remove.disabled = true;
    try {
      if (navigator.onLine === false) throw new Error('네트워크 연결 후 다운로드하세요.');
      await navigator.storage?.persist?.().catch(() => false);
      const manifest = await loadManifest();
      let pack = await loadPack();
      if (pack?.version !== PACK_VERSION || !pack.basemap || !pack.skiData) {
        setStatus('기본 지도와 스키 데이터를 받는 중…');
        const basemapBytes = await fetchBytes(
          asset('./data/offline/kiroro-basemap-z15.pmtiles'), BASEMAP_BYTES, BASEMAP_SHA256);
        const skiData = await getSkiData();
        pack = { id: PACK_ID, version: PACK_VERSION, complete: false,
          basemap: new Blob([basemapBytes], { type: 'application/vnd.pmtiles' }), skiData, manifest };
        await savePack(pack);
      }
      const cache = await caches.open(DEM_CACHE);
      ui.progress.hidden = false;
      ui.progress.max = manifest.tiles.length;
      let done = 0;
      let bytes = 0;
      let cursor = 0;
      let firstError = null;
      const workers = Array.from({ length: 6 }, async () => {
        while (cursor < manifest.tiles.length && !firstError) {
          const tile = manifest.tiles[cursor++];
          try {
            if (!await cachedTileValid(cache, tile)) {
              const data = await fetchBytes(demUrl(tile), tile.bytes, tile.sha256);
              await cache.put(demUrl(tile), new Response(data, { headers: { 'Content-Type': 'image/png' } }));
            }
            bytes += tile.bytes;
            ui.progress.value = ++done;
            setStatus(`DEM 저장·검증 중 ${done}/${manifest.tiles.length}장`);
          } catch (error) { firstError ??= error; }
        }
      });
      await Promise.all(workers);
      if (firstError) throw firstError;
      pack.manifest = manifest;
      pack.totalBytes = BASEMAP_BYTES + bytes + new Blob([JSON.stringify(pack.skiData)]).size;
      pack.complete = true;
      await savePack(pack);
      if (!await verifyPack(pack)) throw new Error('저장 완료 검증에 실패했습니다.');
      ui.progress.hidden = true;
      busy = false;
      await refresh();
      await showMap();
    } catch (error) {
      busy = false;
      ui.progress.hidden = true;
      await refresh();
      setStatus(`다운로드 오류: ${error.message}`, true);
    }
  }

  function terrainProtocol(params) {
    const match = /^kiroro-dem:\/\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(params.url);
    if (!match) throw new Error('허용되지 않은 DEM 주소');
    const path = `${match[1]}/${match[2]}/${match[3]}.png`;
    return caches.open(DEM_CACHE).then(cache => cache.match(asset(`./data/offline/kiroro-dem/${path}`)))
      .then(response => {
        if (!response) throw new Error(`오프라인 DEM 누락: ${path}`);
        return response.arrayBuffer();
      }).then(data => ({ data }));
  }
  function mapStyle(skiData) {
    return {
      version: 8,
      name: 'POWDERLINE Kiroro PWA Offline',
      sources: {
        base: { type: 'vector', url: 'pmtiles://kiroro-basemap-z15.pmtiles', attribution: '© OpenStreetMap contributors · Protomaps' },
        dem: { type: 'raster-dem', tiles: ['kiroro-dem://{z}/{x}/{y}.png'], tileSize: 256,
          minzoom: 8, maxzoom: 15, encoding: 'terrarium', attribution: 'Terrain: AWS Open Data Terrain Tiles / USGS and NOAA' },
        ski: { type: 'geojson', data: skiData, attribution: 'OpenSkiData / OpenSkiMap.org (ODbL)' },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#dce8ea' } },
        { id: 'landcover', type: 'fill', source: 'base', 'source-layer': 'landcover', paint: { 'fill-color': '#b2c8b2', 'fill-opacity': 0.65 } },
        { id: 'forest', type: 'fill', source: 'base', 'source-layer': 'landuse', filter: ['==', ['get', 'kind'], 'forest'], paint: { 'fill-color': '#8daf9a', 'fill-opacity': 0.6 } },
        { id: 'water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#9dc6d9' } },
        { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.3 } },
        { id: 'roads', type: 'line', source: 'base', 'source-layer': 'roads', paint: { 'line-color': '#f6f5e8', 'line-width': 1.4 } },
        { id: 'runs-fill', type: 'fill', source: 'ski', filter: ['==', ['get', 'powderlineType'], 'run'], paint: { 'fill-color': '#64c7e7', 'fill-opacity': 0.18 } },
        { id: 'runs-line', type: 'line', source: 'ski', filter: ['==', ['get', 'powderlineType'], 'run'], paint: { 'line-color': '#1d91c0', 'line-width': 2.8 } },
        { id: 'lifts', type: 'line', source: 'ski', filter: ['==', ['get', 'powderlineType'], 'lift'], paint: { 'line-color': '#d24778', 'line-width': 3 } },
        { id: 'stations', type: 'circle', source: 'ski', filter: ['==', ['get', 'powderlineType'], 'station'], paint: { 'circle-radius': 4, 'circle-color': '#d24778', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } },
      ],
    };
  }
  async function showMap() {
    const pack = await loadPack();
    if (!await verifyPack(pack)) { setStatus('지도 파일이 누락되었습니다. 온라인에서 이어받으세요.', true); return; }
    if (map) { map.resize(); return; }
    if (!protocolRegistered) {
      const archive = new pmtiles.PMTiles(new pmtiles.FileSource(
        new File([pack.basemap], 'kiroro-basemap-z15.pmtiles', { type: 'application/vnd.pmtiles' })));
      const protocol = new pmtiles.Protocol();
      protocol.add(archive);
      maplibregl.addProtocol('pmtiles', protocol.tile);
      maplibregl.addProtocol('kiroro-dem', terrainProtocol);
      protocolRegistered = true;
    }
    ui.panel.hidden = false;
    ui.mapStatus.textContent = '저장된 지도와 DEM 로딩 중…';
    map = new maplibregl.Map({
      container: 'map', style: mapStyle(pack.skiData), center: [140.999, 43.064],
      zoom: 13, pitch: 45, bearing: -12, minZoom: 8, maxZoom: 15,
      maxBounds: [[BBOX[0], BBOX[1]], [BBOX[2], BBOX[3]]], antialias: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.on('load', () => map.setTerrain({ source: 'dem', exaggeration: 1.35 }));
    map.on('idle', () => {
      if (map.getTerrain() && map.isSourceLoaded('dem')) {
        ui.mapStatus.textContent = '오프라인 3D 지형 준비됨 · 드래그·회전·확대 가능';
      }
    });
    map.on('error', event => {
      ui.mapStatus.textContent = `지도 오류: ${event.error?.message || '타일 로딩 실패'}`;
    });
    for (const layer of ['lifts', 'runs-line']) {
      map.on('click', layer, event => {
        const feature = event.features?.[0];
        if (!feature) return;
        const popup = document.createElement('span');
        popup.textContent = feature.properties?.name || (layer === 'lifts' ? '리프트' : '슬로프');
        new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(popup).addTo(map);
      });
    }
  }
  async function removeMap() {
    if (busy || !confirm('이 브라우저에 저장한 키로로 지도만 삭제할까요?')) return;
    if (map) { map.remove(); map = null; }
    ui.panel.hidden = true;
    await deletePack();
    await caches.delete(DEM_CACHE);
    await refresh();
  }

  ui.download.addEventListener('click', download);
  ui.show.addEventListener('click', () => showMap().catch(error => setStatus(error.message, true)));
  ui.remove.addEventListener('click', () => removeMap().catch(error => setStatus(error.message, true)));
  window.__kiroroOfflinePoc = { download, showMap, verify: async () => verifyPack(await loadPack()),
    getMap: () => map, getStatus: () => ui.status.textContent };

  (async () => {
    if (!browserAllowed()) {
      setStatus('공식 PWA 웹 출처 또는 localhost 전용입니다. Android/iOS 네이티브 앱에서는 실행되지 않습니다.', true);
      ui.download.disabled = true;
      return;
    }
    try {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('./sw.js');
        await navigator.serviceWorker.ready;
      }
      await refresh();
    } catch (error) { setStatus(`초기화 오류: ${error.message}`, true); }
  })();
})();
