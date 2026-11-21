// Bump this version when the app shell changes so installed clients can update together.
const SHELL_CACHE_PREFIX = 'powderline-pwa-shell-';
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}v2`;
const SHELL_FILES = [
  './',
  './index.html',
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
  './assets/avatars/avatar-08.webp'
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
