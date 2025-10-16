// public/service-worker.js

/* ship-log-map: Service Worker (offline + update + installable)
 * Scope: this file must be served from /ship-log-map/service-worker.js
 * It will only control pages under /ship-log-map/ (non-overlapping with other apps).
 */

/* ship-log-map: Service Worker (offline + update + installable) */

const APP_VERSION = '0.0.1';
const CACHE_PREFIX = 'ship-log-map';
const PRECACHE = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
const RUNTIME = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;

// ✅ Compute BASE_URL from service worker location
const BASE_URL = (() => {
  const url = new URL(self.location.href);
  const path = url.pathname.replace(/[^/]+$/, '');
  return path.endsWith('/') ? path : path + '/';
})();

// ✅ Logger for SW - stores logs in IndexedDB and broadcasts to main thread
const SW_LOG_CHANNEL = 'sw-logs';
const broadcast = new BroadcastChannel(SW_LOG_CHANNEL);

function swLog(type, category, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    category,
    message,
    ...(data && { data })
  };
  
  // Send to main thread via broadcast channel
  try {
    broadcast.postMessage(entry);
  } catch (err) {
    console.error('[SW] Failed to broadcast log:', err);
  }
  
  // Also log to SW console
  const consoleMsg = `[SW ${category}] ${message}`;
  switch (type) {
    case 'error':
      console.error(consoleMsg, data || '');
      break;
    case 'warn':
      console.warn(consoleMsg, data || '');
      break;
    default:
      console.log(consoleMsg, data || '');
  }
}

swLog('info', 'init', `BASE_URL detected: ${BASE_URL}`);

const CORE_URLS = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}offline.html`,
  `${BASE_URL}logo192.png`,
  `${BASE_URL}logo512.png`,
  `${BASE_URL}favicon.ico`,
];

// Add message handler to receive image list:
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_IMAGES') {
    const urls = event.data.urls;
    swLog('info', 'cache', `Received request to cache ${urls.length} images`);
    
    event.waitUntil((async () => {
      const cache = await caches.open(RUNTIME);
      const results = await Promise.allSettled(
        urls.map(url => cache.add(url).catch(err => {
          swLog('warn', 'cache', `Failed to cache image: ${url}`, { error: err.message });
        }))
      );
      swLog('success', 'cache', `Cached ${urls.length} images`, { 
        succeeded: results.filter(r => r.status === 'fulfilled').length 
      });
    })());
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

    const assetList = Array.from(urls);
    swLog('info', 'install', `Discovered ${assetList.length} assets`, { count: assetList.length, assets: assetList.slice(0, 5) });
    return assetList;
  } catch (err) {
    swLog('error', 'install', 'Failed to discover assets', { error: err.message });
    return [];
  }
}

async function getGraphImages() {
  // Read from localStorage (available in SW via clients API)
  const clients = await self.clients.matchAll();
  if (clients.length === 0) return [];
  
  // This is hacky but works - you'd need to expose image URLs somehow
  // Better: Add a message handler to receive image list from main thread
  return [];
}

// Install: precache
self.addEventListener('install', (event) => {
  swLog('info', 'install', 'Service worker installing...');
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    const assets = await discoverBuildAssets();
    const images = await getGraphImages(); // NEW: Get image URLs
    const toCache = [...CORE_URLS, ...assets, ...images]; // Include images
    
    swLog('info', 'install', `Attempting to cache ${toCache.length} URLs`, { count: toCache.length });
    
    // Cache each URL individually to avoid failures blocking install
    const results = await Promise.allSettled(
      toCache.map(url => cache.add(url).catch(err => {
        swLog('warn', 'cache', `Failed to cache: ${url}`, { error: err.message });
      }))
    );
    
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      swLog('warn', 'install', `${failed.length} assets failed to cache`, { failedCount: failed.length });
    } else {
      swLog('success', 'install', `Successfully cached ${toCache.length} assets`);
    }
    
    await self.skipWaiting();
    swLog('info', 'install', 'Install complete, skipping waiting');
  })());
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  swLog('info', 'activate', 'Service worker activating...');
  event.waitUntil((async () => {
    const names = await caches.keys();
    const oldCaches = names.filter((n) => ![PRECACHE, RUNTIME].includes(n) && n.startsWith(CACHE_PREFIX));
    
    if (oldCaches.length > 0) {
      swLog('info', 'activate', `Deleting ${oldCaches.length} old caches`, { caches: oldCaches });
      await Promise.all(oldCaches.map((n) => caches.delete(n)));
    }
    
    await self.clients.claim();
    swLog('success', 'activate', 'Service worker activated and claimed clients');
  })());
});

// Strategy helpers
async function networkFirst(request) {
  const url = request.url.length > 100 ? request.url.substring(0, 100) + '...' : request.url;
  try {
    swLog('info', 'fetch', `Network first: ${url}`);
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
      swLog('info', 'cache', `Cached fresh response: ${url}`);
    }
    return fresh;
  } catch (err) {
    swLog('warn', 'fetch', `Network failed, trying cache: ${url}`);
    const cached = await caches.match(request);
    if (cached) {
      swLog('success', 'cache', `Cache hit (offline): ${url}`);
      return cached;
    }
    
    // Navigation fallback
    if (request.mode === 'navigate') {
      const index = await caches.match(`${BASE_URL}index.html`);
      if (index) {
        swLog('info', 'fetch', 'Serving index.html fallback for navigation');
        return index;
      }
      const offline = await caches.match(`${BASE_URL}offline.html`);
      if (offline) {
        swLog('info', 'fetch', 'Serving offline.html');
        return offline;
      }
    }
    swLog('error', 'fetch', `Network and cache both failed: ${url}`, { error: err.message });
    throw err;
  }
}

async function cacheFirst(request) {
  const url = request.url.length > 100 ? request.url.substring(0, 100) + '...' : request.url;
  const cached = await caches.match(request);
  if (cached) {
    swLog('success', 'cache', `Cache hit: ${url}`);
    return cached;
  }
  swLog('info', 'fetch', `Cache miss, fetching: ${url}`);
  try {
    const res = await fetch(request);
    const cache = await caches.open(RUNTIME);
    if (res && res.ok) {
      cache.put(request, res.clone());
      swLog('info', 'cache', `Cached new response: ${url}`);
    }
    return res;
  } catch (err) {
    swLog('error', 'fetch', `Fetch failed: ${url}`, { error: err.message });
    throw err;
  }
}

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ✅ NEW: Allow caching of same-site images (avidrucker.github.io)
  const isSameOrigin = url.origin === self.location.origin;
  const isSameSiteImage = 
    url.hostname === 'avidrucker.github.io' && 
    url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);

  // Skip cross-origin requests EXCEPT same-site images
  if (!isSameOrigin && !isSameSiteImage) {
    if (!self.loggedCrossOrigins) self.loggedCrossOrigins = new Set();
    if (!self.loggedCrossOrigins.has(url.origin)) {
      swLog('info', 'fetch', `Ignoring cross-origin: ${url.origin}`);
      self.loggedCrossOrigins.add(url.origin);
    }
    return;
  }

  // ✅ Handle same-site images with cache-first
  if (isSameSiteImage) {
    swLog('info', 'fetch', `Handling same-site image: ${url.pathname}`);
    event.respondWith(cacheFirst(request));
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