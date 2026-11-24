// Bump this version when the app shell changes so installed clients can update together.
const SHELL_CACHE_PREFIX = 'powderline-pwa-shell-';
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}v7`;
const SHELL_FILES = [
  './',
  './index.html',
  './pwa-kiroro-offline.html',
  './pwa-kiroro-offline.css',
  './pwa-kiroro-offline.js',
  './pwa-offline-entry.js',
  './vendor/pwa-maplibre-gl.js',
  './vendor/pwa-maplibre-gl.css',
  './vendor/pwa-pmtiles.js',
  './manifest.webmanifest',
  './config.js',
  './app.js',
  './weather.js',
  './push-notifications.js',
  './pwa-notify.js',
  './styles.css',
  './weather.css',
  './vendor/mapbox-gl.js',
  './vendor/mapbox-gl.css',
  './vendor/supabase.js',
  './vendor/fonts.css',
  './vendor/fonts/material-symbols-outlined.woff2',
  './vendor/fonts/ChakraPetch-2015b2df.woff2',
  './vendor/fonts/ChakraPetch-e481178b.woff2',
  './vendor/fonts/DMMono-42078d9d.woff2',
  './vendor/fonts/DMMono-9bb7177f.woff2',
  './vendor/fonts/Inter-1ab1ad55.woff2',
  './vendor/fonts/JetBrainsMono-1cd702cd.woff2',
  './vendor/fonts/Manrope-f00cccc4.woff2',
  './assets/favicon.png',
  './assets/powderline-icon-splash.png',
  './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png',
  './assets/pwa-apple-touch-icon.png',
  // Intro first frame (styles.css) and the 8 default profile avatars (party list / markers work without network).
  // The intro video is not cached: when it cannot load, the intro finishes on its 'error' event.
  './assets/powderline-app-intro-first.jpg',
  './assets/avatars/avatar-01.webp',
  './assets/avatars/avatar-02.webp',
  './assets/avatars/avatar-03.webp',
  './assets/avatars/avatar-04.webp',
  './assets/avatars/avatar-05.webp',
  './assets/avatars/avatar-06.webp',
  './assets/avatars/avatar-07.webp',
  './assets/avatars/avatar-08.webp',
  // Ride On / SOS alert sounds (app.js): must play offline on the slope.
  './assets/audio/01_ride_on_final.mp3',
  './assets/audio/02_warning_final.mp3',
  './assets/audio/03_back_on_track_final.mp3',
  './assets/audio/04_course_finished_final.mp3',
  './assets/audio/05_sos_emergency_final.mp3'
];
const SHELL_URLS = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).href));
const APP_URL = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_FILES.map(async path => {
      const url = new URL(path, self.registration.scope);
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok || response.type !== 'basic') throw new Error(`App shell unavailable: ${path}`);
      await cache.put(url, response);
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Local test notification (pwa-notify.js → registration.showNotification). Tap: focus an open POWDERLINE window,
// otherwise open the app. No server push is handled here.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) return existing.focus();
    return self.clients.openWindow(APP_URL);
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ---- Kiroro offline basemap for the main Mapbox map (app.js PWA offline style). The pack is written by
// pwa-kiroro-offline.js: PMTiles Blob in IndexedDB, DEM PNGs in their own Cache Storage. Read-only here. ----
importScripts('./vendor/pwa-pmtiles.js'); // global `pmtiles` (same file the Kiroro page uses)
const KIRORO_DB = 'powderline-pwa-kiroro-offline-v1';
const KIRORO_PACK_VERSION = 'kiroro-20261120-z15-v1';
const KIRORO_DEM_CACHE = 'powderline-pwa-kiroro-dem-v1';
const KIRORO_TILE_PATH = /\/offline-tiles\/kiroro\/(\d{1,2})\/(\d+)\/(\d+)\.mvt$/;
const KIRORO_DEM_PATH = /\/data\/offline\/kiroro-dem\/\d{1,2}\/\d+\/\d+\.png$/;
let kiroroArchive = null; // { key, archive }

function readKiroroPack() {
  return new Promise(resolve => {
    const request = indexedDB.open(KIRORO_DB);
    request.onupgradeneeded = () => request.transaction.abort(); // never create the DB here: no pack yet
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const get = db.transaction('packs', 'readonly').objectStore('packs').get('kiroro');
        get.onsuccess = () => { db.close(); resolve(get.result || null); };
        get.onerror = () => { db.close(); resolve(null); };
      } catch { db.close(); resolve(null); }
    };
  });
}
async function kiroroBasemap() {
  const pack = await readKiroroPack();
  if (!pack?.complete || pack.version !== KIRORO_PACK_VERSION || !(pack.basemap instanceof Blob)) { kiroroArchive = null; return null; }
  const key = `${pack.version}:${pack.basemap.size}:${pack.totalBytes || 0}`;
  if (kiroroArchive?.key !== key) {
    const file = new File([pack.basemap], 'kiroro-basemap-z15.pmtiles', { type: 'application/vnd.pmtiles' });
    kiroroArchive = { key, archive: new pmtiles.PMTiles(new pmtiles.FileSource(file)) };
  }
  return kiroroArchive.archive;
}
async function kiroroTileResponse(z, x, y) {
  try {
    const archive = await kiroroBasemap();
    if (!archive) return new Response(null, { status: 404 });
    const tile = await archive.getZxy(z, x, y); // decompressed MVT bytes
    if (!tile?.data) return new Response(null, { status: 204 }); // no tile at this z/x/y (outside / empty)
    return new Response(tile.data, { headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile' } });
  } catch (error) {
    console.warn('Kiroro offline tile failed:', z, x, y, error?.message || error);
    return new Response(null, { status: 500 });
  }
}
// Map requests: saved DEM first. 'no-store' (the Kiroro downloader re-verifying a tile) always goes to the network.
async function kiroroDemResponse(request) {
  if (request.cache !== 'no-store') {
    const cached = await (await caches.open(KIRORO_DEM_CACHE)).match(request.url);
    if (cached) return cached;
  }
  return fetch(request);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search) return;

  const tileMatch = KIRORO_TILE_PATH.exec(url.pathname);
  if (tileMatch) {
    event.respondWith(kiroroTileResponse(Number(tileMatch[1]), Number(tileMatch[2]), Number(tileMatch[3])));
    return;
  }
  if (KIRORO_DEM_PATH.test(url.pathname)) {
    event.respondWith(kiroroDemResponse(request));
    return;
  }

  if (url.href === APP_URL || url.href === INDEX_URL) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(APP_URL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(APP_URL, { cacheName: SHELL_CACHE })) || Response.error();
      }
    })());
    return;
  }

  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
