/* Browser-only Kiroro offline pack download / status / delete. The map itself is shown by the main app (app.js + sw.js). */
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
    download: $('download'), remove: $('remove'),
  };
  // Download management only. The saved map is shown on the main POWDERLINE map (app.js + sw.js), not here.
  let busy = false;
  let currentPack = null;

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
    ui.remove.disabled = busy || !currentPack;
    ui.download.disabled = busy || complete;
    if (!busy) {
      setStatus(complete
        ? `저장 완료 · DEM ${currentPack.manifest.tiles.length}장 · ${mb(currentPack.totalBytes)} · 메인 화면에서 오프라인 지도를 선택하세요`
        : currentPack ? '저장 중단 또는 누락된 타일이 있습니다. 온라인에서 이어받으세요.'
          : '저장된 키로로 지도가 없습니다. 온라인에서 다운로드하세요.');
    }
    await storageStatus();
    return complete;
  }

  async function download() {
    if (busy) return;
    busy = true;
    ui.download.disabled = ui.remove.disabled = true;
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
    } catch (error) {
      busy = false;
      ui.progress.hidden = true;
      await refresh();
      setStatus(`다운로드 오류: ${error.message}`, true);
    }
  }

  async function removeMap() {
    if (busy || !confirm('이 브라우저에 저장한 키로로 지도만 삭제할까요?')) return;
    await deletePack();
    await caches.delete(DEM_CACHE);
    await refresh();
  }

  ui.download.addEventListener('click', download);
  ui.remove.addEventListener('click', () => removeMap().catch(error => setStatus(error.message, true)));
  window.__kiroroOfflinePoc = { download, verify: async () => verifyPack(await loadPack()),
    getStatus: () => ui.status.textContent };

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
