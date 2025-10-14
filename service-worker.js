// public/service-worker.js

/* ship-log-map: Service Worker (offline + update + installable)
 * IMPORTANT: Served at <BASE_URL>/service-worker.js (e.g., /ship-log-map/service-worker.js)
 */

const APP_VERSION = '0.1.8';
const CACHE_PREFIX = 'ship-log-map';
const PRECACHE = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
const RUNTIME  = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;

// Derive BASE_URL from this file's own URL directory, e.g. '/ship-log-map/'
const BASE_URL = (() => {
  const url = new URL(self.location.href);
  const path = url.pathname.replace(/[^/]+$/, '');
  return path.endsWith('/') ? path : path + '/';
})();

// Core app-shell we always want offline
const CORE_URLS = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}offline.html`,
  `${BASE_URL}logo192.png`,
  `${BASE_URL}logo512.png`,
  `${BASE_URL}vite.svg`, // harmless if missing in prod
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Discover built assets from index.html (Vite emits /assets/*.{js,css})
async function discoverBuildAssets() {
  try {
    const res = await fetch(`${BASE_URL}index.html`, { cache: 'no-store' });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = new Set();

    // Find /assets/*.{js,css} under our BASE_URL
    const assetRegex = new RegExp(
      `${BASE_URL.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}assets/[^"']+\\.(?:js|css)`,
      'g'
    );
    for (const m of html.matchAll(assetRegex)) urls.add(m[0]);

    // Also follow <link rel="stylesheet" href="...">
    const linkHrefRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
    const baseForHtml = new URL(BASE_URL, self.location.origin);
    let lm;
    while ((lm = linkHrefRegex.exec(html)) !== null) {
      const hrefAbs = new URL(lm[1], baseForHtml).href; // ✅ fix
      const u = new URL(hrefAbs);
      if (u.origin === self.location.origin && u.pathname.startsWith(BASE_URL)) {
        urls.add(u.pathname);
      }
    }

    return Array.from(urls);
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    const dynamicAssets = await discoverBuildAssets();
    await cache.addAll([...CORE_URLS, ...dynamicAssets]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.startsWith(CACHE_PREFIX) && ![PRECACHE, RUNTIME].includes(n))
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const index = await caches.match(`${BASE_URL}index.html`);
      if (index) return index;
      const offline = await caches.match(`${BASE_URL}offline.html`);
      if (offline) return offline;
    }
    throw new Error('Network and cache both failed');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  const cache = await caches.open(RUNTIME);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE_URL)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname.startsWith(`${BASE_URL}assets/`) ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
