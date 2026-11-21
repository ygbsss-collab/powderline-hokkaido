// Bump this version when the app shell changes so installed clients can update together.
const SHELL_CACHE_PREFIX = 'powderline-pwa-shell-';
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}v1`;
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './app.js',
  './weather.js',
  './push-notifications.js',
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
  './assets/pwa-apple-touch-icon.png'
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

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search) return;

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
