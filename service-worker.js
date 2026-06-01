/* ship-log-map: Service Worker (offline + update + installable)
 * Scope: this file must be served from /ship-log-map/service-worker.js
 * It will only control pages under /ship-log-map/.
 */

const APP_VERSION = '0.1.14';                         // bump on each deploy
const CACHE_PREFIX = 'ship-log-map';
const PRECACHE = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
const RUNTIME  = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;

// Derive BASE_URL from where this SW is served (works on GH Pages)
const BASE_URL = (() => {
  const url = new URL(self.location.href);
  const path = url.pathname.replace(/[^/]+$/, '');
  return path.endsWith('/') ? path : path + '/';
})();

// --------- lightweight logger -> BroadcastChannel (visible in your Debug modal)
const SW_LOG_CHANNEL = 'sw-logs';
const broadcast = new BroadcastChannel(SW_LOG_CHANNEL);
function swLog(type, category, message, data = undefined) {
  const entry = { timestamp: new Date().toISOString(), type, category, message, data };
  // eslint-disable-next-line no-empty
  try { broadcast.postMessage(entry); } catch {}
  const msg = `[SW ${category}] ${message}`;
  if (type === 'error') console.error(msg, data ?? '');
  else if (type === 'warn') console.warn(msg, data ?? '');
  else console.log(msg, data ?? '');
}
swLog('info', 'init', `BASE_URL: ${BASE_URL}`);

// --------- core shell we always want available offline
const CORE_URLS = [
  `${BASE_URL}`,                    // root under scope
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}offline.html`,
  `${BASE_URL}logo192.png`,
  `${BASE_URL}logo512.png`,
  `${BASE_URL}favicon.ico`,
];

// --------- helpers
async function discoverBuildAssets() {
  try {
    // Look at built index.html to find hashed JS/CSS emitted by Vite
    const res = await fetch(`${BASE_URL}index.html`, { cache: 'no-store' });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = new Set();

    const attr = (re) => {
      let m; while ((m = re.exec(html))) {
        let href = m[1];
        if (!/^https?:\/\//.test(href)) {
          href = href.startsWith('/')
            ? `${self.location.origin}${href}`
            : `${self.location.origin}${BASE_URL}${href}`;
        }
        if (href.startsWith(self.location.origin)) urls.add(href);
      }
    };

    attr(/<script[^>]+src=["']([^"']+)["']/gi);
    attr(/<link[^>]+href=["']([^"']+)["']/gi);

    const assets = [...urls];
    swLog('info', 'install', `Discovered ${assets.length} build assets`, { sample: assets.slice(0,5) });
    return assets;
  } catch (err) {
    swLog('warn', 'install', 'Asset discovery failed', { error: err.message });
    return [];
  }
}

async function cacheAddAllIndividually(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.all(urls.map(async (u) => {
    try { await cache.add(u); }
    catch (err) { swLog('warn', 'cache', `Failed to cache: ${u}`, { error: err.message }); }
  }));
}

async function cachedIndexFallback() {
  // Try exact nav request first (for route-style documents)
  // Then index.html, then BASE_URL root, then offline.html
  const idx = await caches.match(`${BASE_URL}index.html`);
  if (idx) return idx;
  const root = await caches.match(`${BASE_URL}`);
  if (root) return root;
  const off = await caches.match(`${BASE_URL}offline.html`);
  if (off) return off;
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

// --------- message channel: cache images + diagnostics
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'CACHE_IMAGES') {
    const urls = Array.isArray(msg.urls) ? msg.urls : [];
    swLog('info', 'cache', `CACHE_IMAGES: ${urls.length} img(s)`);
    event.waitUntil((async () => {
      // Skip if offline: avoid noisy failures when testing airplane mode
      const online = await (async () => {
        try {
          // HEAD/GET to a same-origin URL – fast and private cache-busting
          const ping = await fetch(`${BASE_URL}index.html`, { method: 'HEAD', cache: 'no-store' });
          return ping.ok;
        } catch { return false; }
      })();
      if (!online) {
        swLog('info', 'cache', 'Offline – deferring image warmup');
        // Remember the list so we can warm on next activate/online
        self.graphImageList = urls;
        return;
      }
      const cache = await caches.open(RUNTIME);
      await Promise.all(urls.map(async (u) => {
        try {
          const res = await fetch(u, { cache: 'no-store' });
          if (res.ok) await cache.put(u, res.clone());
        } catch (err) {
          swLog('warn', 'cache', `Image cache fail: ${u}`, { error: err.message });
        }
      }));
      // keep list for warm-on-activate
      self.graphImageList = urls;
    })());
    return;
  }

  if (msg.type === 'GET_STATUS') {
    event.waitUntil((async () => {
      const names = await caches.keys();
      const details = {};
      for (const n of names) {
        const c = await caches.open(n);
        const ks = await c.keys();
        details[n] = ks.map(k => k.url);
      }
      swLog('info', 'status', 'Cache status', { names, detailsSample: Object.fromEntries(Object.entries(details).slice(0,1)) });
    })());
    return;
  }

  if (msg.type === 'PING') {
    swLog('info', 'status', 'PING received');
  }
});

// --------- install
self.addEventListener('install', (event) => {
  swLog('info', 'install', 'Installing…');
  event.waitUntil((async () => {
    const assets = await discoverBuildAssets();
    const toCache = [...CORE_URLS, ...assets];
    swLog('info', 'install', `Caching ${toCache.length} URL(s)`);
    await cacheAddAllIndividually(PRECACHE, toCache);
    await self.skipWaiting();
    swLog('info', 'install', 'skipWaiting complete');
  })());
});

// --------- activate
self.addEventListener('activate', (event) => {
  swLog('info', 'activate', 'Activating…');
  event.waitUntil((async () => {
    // Navigation preload improves reliability on mobile
    if ('navigationPreload' in self.registration) {
      // eslint-disable-next-line no-empty
      try { await self.registration.navigationPreload.enable(); swLog('info', 'activate', 'Navigation preload enabled'); } catch {}
    }

    // Clean old caches
    const keep = new Set([PRECACHE, RUNTIME]);
    const names = await caches.keys();
    await Promise.all(names.map((n) => {
      if (n.startsWith(CACHE_PREFIX) && !keep.has(n)) {
        swLog('info', 'activate', `Deleting old cache: ${n}`);
        return caches.delete(n);
      }
    }));

    // Optional: warm image cache from last session
    if (Array.isArray(self.graphImageList) && self.graphImageList.length) {
      const cache = await caches.open(RUNTIME);
      await Promise.all(self.graphImageList.map(async (u) => {
        // eslint-disable-next-line no-empty
        try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) await cache.put(u, r.clone()); } catch {}
      }));
      swLog('info', 'activate', `Warmed ${self.graphImageList.length} images`);
    }

    await self.clients.claim();
    swLog('success', 'activate', 'Activated & claimed clients');
  })());
});

// --------- small strategy helpers
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const hit = await caches.match(request);
    if (hit) return hit;
    return cachedIndexFallback();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, res.clone());
  }
  return res;
}

// --------- FETCH: handle navigations FIRST (Android-safe), then assets/images
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1) Always intercept navigations first
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      try {
        // Prefer navigation preload if present
        const preloaded = 'preloadResponse' in event ? await event.preloadResponse : undefined;
        if (preloaded) {
          const cache = await caches.open(RUNTIME);
          cache.put(request, preloaded.clone());
          swLog('info', 'fetch', 'Nav preload used');
          return preloaded;
        }
        const fresh = await fetch(request);
        // Cache the fresh shell
        if (fresh && fresh.ok) {
          const cache = await caches.open(RUNTIME);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (err) {
        swLog('warn', 'fetch', `Nav failed → fallback (${err.message})`);
        const exact = await caches.match(request);
        if (exact) return exact;
        return cachedIndexFallback();
      }
    })());
    return;
  }

  // 2) Non-GET requests after nav → ignore
  if (request.method !== 'GET') return;

  // 3) Everything else: choose sensible strategies
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  const isImage = /\.(png|jpe?g|gif|webp|svg)$/.test(url.pathname);
  // Allowlist your CDN host so SW will handle those images, even cross-origin.
  const isCdnImage = isImage && url.origin === 'https://avidrucker.github.io';

  // Same-origin images OR allowlisted CDN images → Cache-First
  if ((sameOrigin && isImage) || isCdnImage) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Built HTML fragments → Network-First
  if (sameOrigin && url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // JS/CSS/assets/wasm → Cache-First
  if (sameOrigin && (url.pathname.includes('/assets/') || /\.((js|css|mjs|wasm))$/.test(url.pathname))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Cross-origin (non-allowlisted) → ignore
  if (!sameOrigin && !isCdnImage) {
    // One-time log per origin
    self._loggedXO ??= new Set();
    if (!self._loggedXO.has(url.origin)) {
      swLog('info', 'fetch', `Ignoring cross-origin: ${url.origin}`);
      self._loggedXO.add(url.origin);
    }
    return;
  }

  // Default same-origin → Cache-First
  event.respondWith(cacheFirst(request));
});


self.addEventListener('sync', async (e) => {
  if (e.tag === 'warm-images' && Array.isArray(self.graphImageList) && self.graphImageList.length) {
    const cache = await caches.open(RUNTIME);
    await Promise.all(self.graphImageList.map(async (u) => {
      // eslint-disable-next-line no-empty
      try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) await cache.put(u, r.clone()); } catch {}
    }));
    swLog('info', 'sync', `Warm-images sync completed (${self.graphImageList.length})`);
  }
});