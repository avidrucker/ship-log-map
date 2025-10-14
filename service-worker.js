// public/service-worker.js

/* ship-log-map: Service Worker (offline + update + installable)
 * IMPORTANT: Must be served at <BASE_URL>/service-worker.js
 * Example on GitHub Pages: https://<user>.github.io/ship-log-map/service-worker.js
 */

const APP_VERSION = '0.1.7'; // optionally replaced by CI
const CACHE_PREFIX = 'ship-log-map';
const PRECACHE = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
const RUNTIME  = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;

// Derive BASE_URL from this file's own URL directory, e.g. '/ship-log-map/'
const BASE_URL = (() => {
  const url = new URL(self.location.href);
  const path = url.pathname.replace(/[^/]+$/, ''); // drop filename
  return path.endsWith('/') ? path : path + '/';
})();

// Core URLs we always want available offline
const CORE_URLS = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}offline.html`,
  `${BASE_URL}logo192.png`,
  `${BASE_URL}logo512.png`,
  // Vite’s default dev asset; harmless if missing in prod:
  `${BASE_URL}vite.svg`,
];

// Support “skip waiting” from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---- Build asset discovery (read index.html, collect /assets/*.js|.css and linked styles) ----
async function discoverBuildAssets() {
  try {
    const res = await fetch(`${BASE_URL}index.html`, { cache: 'no-store' });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = new Set();

    // Capture hashed assets emitted by Vite under <base>/assets/
    const assetRegex = new RegExp(
      `${BASE_URL.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}assets/[^"']+\\.(?:js|css)`,
      'g'
    );
    for (const m of html.matchAll(assetRegex)) {
      urls.add(m[0]);
    }

    // Capture additional linked stylesheets (handle relative + absolute)
    const linkHrefRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
    const baseForHtml = new URL(BASE_URL, self.location.origin);
    let lm;
    while ((lm = linkHrefRegex.exec(html)) !== null) {
      const hrefAbs = new URL(lm[1], baseForHtml).href;
      const u = new URL(hrefAbs);
      // Same-origin and within our scope
      if (u.origin === self.location.origin && u.pathname.startsWith(BASE_URL)) {
        urls.add(u.pathname);
      }
    }

    return Array.from(urls);
  } catch (_e) {
    // Fail-soft: no dynamic assets discovered
    return [];
  }
}

// ---- Install: precache core + discovered build assets ----
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    const dynamicAssets = await discoverBuildAssets();
    const toCache = [...CORE_URLS, ...dynamicAssets];
    await cache.addAll(toCache);
    await self.skipWaiting();
  })());
});

// ---- Activate: clean old caches & take control ----
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

// ---- Strategies ----
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (_e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const index = await caches.match(`${BASE_URL}index.html`);
      if (index) return index;
      const offline = await caches.match(`${BASE_URL}offline.html`);
      if (offline) return offline;
    }
    throw _e;
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

// ---- Fetch routing ----
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only deal with GETs and requests within our scope
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE_URL)) return;

  // Navigations: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML files: network-first (fresh content when online)
  if (url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Hashed build assets: cache-first (content-hashed by Vite)
  if (
    url.pathname.startsWith(`${BASE_URL}assets/`) ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default: cache-first
  event.respondWith(cacheFirst(request));
});
