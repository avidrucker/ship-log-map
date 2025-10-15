// public/service-worker.js

/* ship-log-map: Service Worker (offline + update + installable)
 * Scope: this file must be served from /ship-log-map/service-worker.js
 * It will only control pages under /ship-log-map/ (non-overlapping with other apps).
 */

/* ship-log-map: Service Worker (offline + update + installable) */

const APP_VERSION = '0.1.8';
const CACHE_PREFIX = 'ship-log-map';
const PRECACHE = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
const RUNTIME = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;

// ✅ Compute BASE_URL from service worker location
const BASE_URL = (() => {
  const url = new URL(self.location.href);
  const path = url.pathname.replace(/[^/]+$/, '');
  return path.endsWith('/') ? path : path + '/';
})();

console.log('[SW] BASE_URL detected:', BASE_URL);

const CORE_URLS = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}offline.html`,
  `${BASE_URL}logo192.png`,
  `${BASE_URL}logo512.png`,
  `${BASE_URL}favicon.ico`,
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ✅ IMPROVED: Discover build assets more reliably
async function discoverBuildAssets() {
  try {
    const res = await fetch(`${BASE_URL}index.html`, { cache: 'no-store' });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = new Set();

    // Match script src and link href
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
    
    let match;
    
    // Find all script tags
    while ((match = scriptRegex.exec(html)) !== null) {
      let src = match[1];
      // Convert relative paths to absolute
      if (!src.startsWith('http')) {
        if (src.startsWith('/')) {
          src = `${self.location.origin}${src}`;
        } else {
          src = `${self.location.origin}${BASE_URL}${src}`;
        }
      }
      // Only cache same-origin assets
      if (src.startsWith(self.location.origin)) {
        urls.add(src);
      }
    }
    
    // Find all link tags (CSS, icons, etc.)
    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1];
      // Convert relative paths to absolute
      if (!href.startsWith('http')) {
        if (href.startsWith('/')) {
          href = `${self.location.origin}${href}`;
        } else {
          href = `${self.location.origin}${BASE_URL}${href}`;
        }
      }
      // Only cache same-origin assets
      if (href.startsWith(self.location.origin)) {
        urls.add(href);
      }
    }

    console.log('[SW] Discovered assets:', Array.from(urls));
    return Array.from(urls);
  } catch (err) {
    console.error('[SW] Failed to discover assets:', err);
    return [];
  }
}

// Install: precache
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    const assets = await discoverBuildAssets();
    const toCache = [...CORE_URLS, ...assets];
    
    console.log('[SW] Caching:', toCache);
    
    // Cache each URL individually to avoid failures blocking install
    const results = await Promise.allSettled(
      toCache.map(url => cache.add(url).catch(err => {
        console.warn('[SW] Failed to cache:', url, err);
      }))
    );
    
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn('[SW] Some assets failed to cache:', failed.length);
    }
    
    await self.skipWaiting();
    console.log('[SW] Install complete');
  })());
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => ![PRECACHE, RUNTIME].includes(n) && n.startsWith(CACHE_PREFIX))
        .map((n) => {
          console.log('[SW] Deleting old cache:', n);
          return caches.delete(n);
        })
    );
    await self.clients.claim();
    console.log('[SW] Activation complete');
  })());
});

// Strategy helpers
async function networkFirst(request) {
  try {
    console.log('[SW] Network first:', request.url);
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }
    
    // Navigation fallback
    if (request.mode === 'navigate') {
      const index = await caches.match(`${BASE_URL}index.html`);
      if (index) {
        console.log('[SW] Serving index.html fallback');
        return index;
      }
      const offline = await caches.match(`${BASE_URL}offline.html`);
      if (offline) {
        console.log('[SW] Serving offline.html');
        return offline;
      }
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('[SW] Cache hit:', request.url);
    return cached;
  }
  console.log('[SW] Cache miss, fetching:', request.url);
  const res = await fetch(request);
  const cache = await caches.open(RUNTIME);
  if (res && res.ok) {
    cache.put(request, res.clone());
  }
  return res;
}

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ✅ IMPORTANT: Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    console.log('[SW] Ignoring cross-origin:', request.url);
    return;
  }

  // Navigation -> Network-first
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML -> Network-first
  if (url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Assets (JS/CSS) -> Cache-first
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else -> Cache-first
  event.respondWith(cacheFirst(request));
});