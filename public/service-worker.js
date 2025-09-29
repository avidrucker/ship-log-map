// public/service-worker.js

/* ship-log-map: Service Worker (offline + update + installable)
 * Scope: this file must be served from /ship-log-map/service-worker.js
 * It will only control pages under /ship-log-map/ (non-overlapping with other apps).
 */

const APP_VERSION = '0.0.1'; // <-- CI will inject package.json version (see README/CI step)
const CACHE_PREFIX = 'ship-log-map';
const PRECACHE = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
const RUNTIME = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;

// Compute BASE_URL from the service worker script URL directory.
// Example: https://avidrucker.github.io/ship-log-map/service-worker.js -> '/ship-log-map/'
const BASE_URL = (() => {
  const url = new URL(self.location.href);
  const path = url.pathname.replace(/[^/]+$/, ''); // drop filename
  return path.endsWith('/') ? path : path + '/';
})();

const CORE_URLS = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}offline.html`,
  // Icons (you will add these soon)
  `${BASE_URL}logo192.png`,
  `${BASE_URL}logo512.png`,
];

// Message channel (optional): allow page to request immediate activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Helper: fetch index.html and pull out hashed asset URLs that Vite injects (assets/*.js|css)
async function discoverBuildAssets() {
  try {
    const res = await fetch(`${BASE_URL}index.html`, { cache: 'no-store' });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = new Set();

    const assetRegex = new RegExp(`${BASE_URL.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}assets/[^"']+\\.(?:js|css)`, 'g');
    for (const m of html.matchAll(assetRegex)) {
      urls.add(m[0]);
    }

    // Also cache the Vite SVG and any CSS referenced by link tags
    const viteSvg = `${BASE_URL}vite.svg`;
    urls.add(viteSvg);

    // Look for <link rel="stylesheet" href="..."> too
    const linkHrefRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
    let lm;
    while ((lm = linkHrefRegex.exec(html)) !== null) {
      const href = lm[1].startsWith('http') ? lm[1] : new URL(lm[1], `${location.origin}${BASE_URL}`).pathname.replace(location.origin, '');
      // Only cache same-origin & within scope
      if (href.startsWith(BASE_URL)) urls.add(href);
    }

    return Array.from(urls);
  } catch (_e) {
    return [];
  }
}

// Install: precache the app shell and discovered build assets
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    const assets = await discoverBuildAssets();
    const toCache = [...CORE_URLS, ...assets];
    await cache.addAll(toCache);
    // Take over quickly
    await self.skipWaiting();
  })());
});

// Activate: clean old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => ![PRECACHE, RUNTIME].includes(n) && n.startsWith(CACHE_PREFIX))
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// Strategy helpers
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (_e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // If it's a navigation, fall back to cached index or offline page
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

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle requests within our scope (same origin + path starts with BASE_URL)
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE_URL)) {
    return;
  }

  // Navigations -> Network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML files -> Network-first
  if (url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Hashed build assets (Vite) -> Cache-first (they are content-hashed)
  if (url.pathname.startsWith(`${BASE_URL}assets/`) || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else under scope -> Cache-first as a safe default
  event.respondWith(cacheFirst(request));
});
