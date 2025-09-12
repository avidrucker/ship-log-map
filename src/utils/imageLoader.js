// src/utils/imageLoader.js

/**
 * Image Loader & Cache
 *
 * Responsibilities
 * - Lazy-load images (regular + placeholder) with caching and error handling.
 * - Report readiness to cyAdapter so nodes don’t flicker while loading.
 *
 * Exports
 * - loadImage(url): Promise<HTMLImageElement>
 * - primePlaceholder(mapName, cdnBaseUrl)
 */

import { printDebug, printWarn } from "../utils/debug.js";
import { getCdnBaseUrl, buildCdnUrl, buildAlternativeBaseUrls } from './cdnHelpers.js';
import { blobToDataUrl, blobToThumbnailDataUrl } from './imageUtils.js';

// Storage keys
const IMAGE_CACHE_KEY = 'shipLogImageCache';
const DEFAULT_PLACEHOLDER_FILENAME = 'default_image.svg';
const PLACEHOLDER_CACHE_KEY_PREFIX = '__default_placeholder__:'; // + mapName

const IMAGE_NOT_FOUND_SVG = `data:image/svg+xml;base64,${btoa(`
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#f5f5f5" stroke="#ccc" stroke-width="2"/>
  <text x="50" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">Image</text>
  <text x="50" y="50" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">not</text>
  <text x="50" y="65" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">found</text>
  <path d="M25 25 L75 75 M75 25 L25 75" stroke="#ff6b6b" stroke-width="2"/>
</svg>
`)}`;

// ⬇️ Important: thumbnail-only cache mode (keeps localStorage tiny)
const THUMBNAIL_ONLY_CACHE = true;
const THUMB_SIZE = 100;

// Lightweight listeners for when the placeholder becomes available
const placeholderListeners = new Set();
function notifyPlaceholderLoaded(mapName, dataUrl) {
  placeholderListeners.forEach(fn => { try { fn(mapName, dataUrl); } catch {
    printDebug("imageLoader.js: error occured while attempting to notifyPlaceholderLoaded")
  } });
}
export function onDefaultPlaceholderLoaded(listener) {
  placeholderListeners.add(listener);
  return () => placeholderListeners.delete(listener);
}

// Image cache management
class ImageCache {
  constructor() {
    this.cache = new Map();
    this.loadCache();
  }
  loadCache() {
    printDebug(`💾 [ImageCache] Loading cache from localStorage...`);
    try {
      const cached = localStorage.getItem(IMAGE_CACHE_KEY);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        this.cache.clear();
        Object.entries(parsedCache).forEach(([key, value]) => this.cache.set(key, value));
        printDebug(`✅ [ImageCache] Cache hydrated with ${this.cache.size} entries`);
      }
    } catch (error) {
      console.warn('Failed to load image cache from localStorage:', error);
    }
  }
  saveCache() {
    try {
      const obj = {};
      this.cache.forEach((value, key) => { obj[key] = value; });
      const serialized = JSON.stringify(obj);
      printDebug(`💾 [ImageCache] Saving ${Object.keys(obj).length} entries (size=${serialized.length} chars)`);
      localStorage.setItem(IMAGE_CACHE_KEY, serialized);
    } catch (error) {
      console.error('❌ [ImageCache] Failed to save image cache:', error);
      if (error?.name === 'QuotaExceededError') {
        printWarn('🚨 [ImageCache] Quota exceeded; clearing entire image cache');
        this.cache.clear();
        try { localStorage.removeItem(IMAGE_CACHE_KEY); } catch {
          printDebug("imageLoader.js: error removing image cache key")
        }
      }
    }
  }
  get(key) { return this.cache.get(key); }
  has(key) { return this.cache.has(key); }
  set(key, value) {
    this.cache.set(key, value);
    if (!this._saveScheduled) {
      this._saveScheduled = true;
      queueMicrotask(() => { this._saveScheduled = false; this.saveCache(); });
    }
  }
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    try { localStorage.removeItem(IMAGE_CACHE_KEY); } catch {
      printDebug("imageLoader.js: error occurred removing image cache key");
    }
    printDebug(`🧹 [ImageCache] Cleared cache (${size} entries removed)`);
  }
  size() { return this.cache.size; }
}
const imageCache = new ImageCache();

// Placeholder state tracking per mapName
const placeholderLoadPromises = new Map(); // mapName -> Promise

async function fetchBlob(url, cacheMode = 'force-cache') {
  const started = Date.now();
  const resp = await fetch(url, { cache: cacheMode });
  const duration = Date.now() - started;
  if (!resp.ok) {
    const ct = resp.headers.get('content-type');
    throw new Error(`HTTP ${resp.status} (${resp.statusText}) ct=${ct || 'n/a'} in ${duration}ms`);
  }
  return await resp.blob();
}

// Diagnostics tracking (unchanged)
const MAX_DIAGNOSTIC_ENTRIES = 100;
const imageLoadDiagnostics = new Map();
function recordImageAttempt(key, info) {
  let entry = imageLoadDiagnostics.get(key);
  if (!entry) { entry = { attempts: [], finalResult: null }; imageLoadDiagnostics.set(key, entry); }
  entry.attempts.push({ ...info, ts: Date.now() });
  if (entry.attempts.length > 10) entry.attempts.splice(0, entry.attempts.length - 10);
  if (imageLoadDiagnostics.size > MAX_DIAGNOSTIC_ENTRIES) {
    const oldestKey = [...imageLoadDiagnostics.entries()].sort((a,b)=>a[1].attempts[0].ts - b[1].attempts[0].ts)[0]?.[0];
    if (oldestKey) imageLoadDiagnostics.delete(oldestKey);
  }
}
function finalizeImageAttempt(key, finalResult) {
  const entry = imageLoadDiagnostics.get(key);
  if (entry) entry.finalResult = finalResult;
}
export function getImageLoadDiagnostics() {
  const out = {};
  imageLoadDiagnostics.forEach((v,k)=> { out[k] = { attempts: v.attempts, finalResult: v.finalResult }; });
  return out;
}
export function clearImageLoadDiagnostics() { imageLoadDiagnostics.clear(); }

// Attempt to load & cache default placeholder for a map (idempotent)
export function ensureDefaultPlaceholderLoaded(mapName = 'default_map', cdnBaseUrlOverride) {
  const cacheKey = PLACEHOLDER_CACHE_KEY_PREFIX + mapName;
  if (imageCache.has(cacheKey)) {
    const existing = imageCache.get(cacheKey);
    // Return cached result (either string data URL or null for failed loads)
    return Promise.resolve(existing);
  }
  if (placeholderLoadPromises.has(mapName)) return placeholderLoadPromises.get(mapName);

  const cdnBaseUrl = cdnBaseUrlOverride !== undefined ? cdnBaseUrlOverride : getCdnBaseUrl();
  if (!cdnBaseUrl) {
    printDebug(`⚠️ [ImageLoader] No CDN base URL; skipping placeholder load for map '${mapName}'`);
    // Cache the null result to avoid repeated attempts
    imageCache.set(cacheKey, null);
    return Promise.resolve(null);
  }
  const url = buildCdnUrl(cdnBaseUrl, mapName, DEFAULT_PLACEHOLDER_FILENAME);
  const p = (async () => {
    try {
      printDebug(`🖼️ [ImageLoader] Attempting to load default placeholder from: ${url}`);
      const blob = await fetchBlob(url);
      // Placeholder is SVG; keep as data URL (small)
      const dataUrl = await blobToDataUrl(blob);
      if (!dataUrl.startsWith('data:image/svg+xml')) {
        printWarn(`⚠️ [ImageLoader] default_image.svg did not return SVG (content-type mismatch)`);
        // Cache the failure to avoid repeated attempts
        imageCache.set(cacheKey, null);
        return null;
      }
      imageCache.set(cacheKey, dataUrl);
      notifyPlaceholderLoaded(mapName, dataUrl);
      printDebug(`✅ [ImageLoader] Loaded & cached default placeholder for map '${mapName}'`);
      return dataUrl;
    } catch (e) {
      printDebug(`❌ [ImageLoader] Failed to load default placeholder: ${e.message}`);
      // Cache the failure to avoid repeated attempts
      imageCache.set(cacheKey, null);
      return null;
    } finally {
      placeholderLoadPromises.delete(mapName);
    }
  })();
  placeholderLoadPromises.set(mapName, p);
  return p;
}

export function getDefaultPlaceholderSvg(mapName = 'default_map') {
  const cacheKey = PLACEHOLDER_CACHE_KEY_PREFIX + mapName;
  const v = imageCache.get(cacheKey);
  return (typeof v === 'string') ? v : null;
}

/**
 * Core loader for images referenced in graph.
 * - Returns a **data URL string** (never a Blob) to keep callers simple and prevent substring/startsWith crashes.
 * - When options.fullSize === true: returns the full image **without caching** (for background underlay only).
 * - Otherwise: caches **only a 100×100 WebP thumbnail** in localStorage and returns that thumbnail.
 */
export async function loadImageWithFallback(imagePath, mapName = '', cdnBaseUrlOverride = undefined, options = {}) {
  const { fullSize = false, thumbnailSize = THUMB_SIZE } = options;
  printDebug(`🖼️ [ImageLoader] loadImageWithFallback("${imagePath}", map="${mapName}", fullSize=${fullSize})`);

  if (!imagePath) return IMAGE_NOT_FOUND_SVG;
  if (typeof imagePath === 'string' && imagePath.startsWith('data:')) return imagePath;

  const cacheKey = `${mapName}:${imagePath}`;
  if (!fullSize) {
    // Normal path: serve tiny thumbnail from cache if present
    if (imageCache.has(cacheKey)) {
      const cached = imageCache.get(cacheKey);
      if (typeof cached === 'string') {
        printDebug(`💾 [ImageLoader] Cache hit for ${cacheKey}`);
        return cached;
      }
    }
  }

  const cdnBaseUrl = cdnBaseUrlOverride !== undefined ? cdnBaseUrlOverride : getCdnBaseUrl();
  if (!cdnBaseUrl) {
    printDebug(`⚠️ [ImageLoader] No CDN base URL set; cannot fetch '${imagePath}'`);
    return IMAGE_NOT_FOUND_SVG;
  }

  const primaryUrl = buildCdnUrl(cdnBaseUrl, mapName, imagePath);
  const diagKey = cacheKey;

  const attemptFetch = async (url, cacheMode) => {
    try {
      recordImageAttempt(diagKey, { url, cacheMode, phase: 'fetch-start' });
      const blob = await fetchBlob(url, cacheMode);
      recordImageAttempt(diagKey, { url, cacheMode, phase: 'fetch-success', blobSize: blob.size });

      if (fullSize) {
        // For BG: return full image data URL and DO NOT CACHE
        const dataUrl = await blobToDataUrl(blob);
        return { success: true, dataUrl };
      }

      if (THUMBNAIL_ONLY_CACHE) {
        const thumbUrl = await blobToThumbnailDataUrl(blob, thumbnailSize, 'image/webp', 0.85);
        imageCache.set(cacheKey, thumbUrl);
        return { success: true, dataUrl: thumbUrl };
      } else {
        const dataUrl = await blobToDataUrl(blob);
        imageCache.set(cacheKey, dataUrl);
        return { success: true, dataUrl };
      }
    } catch (e) {
      recordImageAttempt(diagKey, { url, cacheMode, phase: 'fetch-error', error: e.message });
      printDebug(`❌ [ImageLoader] Attempt failed url='${url}' cache='${cacheMode}' error='${e.message}'`);
      return { success: false, error: e };
    }
  };

  const cacheModes = ['force-cache', 'no-cache'];
  const alternativeBases = buildAlternativeBaseUrls(cdnBaseUrl);
  const urlsToTry = [primaryUrl];
  alternativeBases.forEach(base => {
    const altUrl = buildCdnUrl(base, mapName, imagePath);
    if (altUrl && !urlsToTry.includes(altUrl)) urlsToTry.push(altUrl);
  });

  for (const url of urlsToTry) {
    for (const mode of cacheModes) {
      const res = await attemptFetch(url, mode);
      if (res.success) {
        finalizeImageAttempt(diagKey, 'success');
        printDebug(`✅ [ImageLoader] Loaded '${imagePath}' from '${url}' (len=${res.dataUrl.length})`);
        return res.dataUrl;
      }
    }
  }

  printDebug(`🛑 [ImageLoader] All attempts failed for '${imagePath}'. Falling back to IMAGE_NOT_FOUND_SVG.`);
  if (!fullSize) imageCache.set(cacheKey, IMAGE_NOT_FOUND_SVG);
  finalizeImageAttempt(diagKey, 'fallback');
  return IMAGE_NOT_FOUND_SVG;
}

// Preload list of nodes (only those with non-data imageUrl strings)
export async function preloadNodeImages(nodes, mapName = '', cdnBaseUrlOverride = undefined) {
  const tasks = nodes
    .filter(n => n.imageUrl && typeof n.imageUrl === 'string' && !n.imageUrl.startsWith('data:') && n.imageUrl !== 'unspecified')
    .map(n => loadImageWithFallback(n.imageUrl, mapName, cdnBaseUrlOverride)
      .then(url => ({ id: n.id, url }))
      .catch(() => null));
  const results = await Promise.all(tasks);
  return results.filter(Boolean);
}

export function clearAllImageCaches() {
  imageCache.clear();
  try { localStorage.removeItem('shipLogGrayscaleCache'); } catch {
    printDebug("imageLoader.js: error occurred while removing grayscale cache")
  }
}

export function getImageCacheStats(mapName = 'default_map') {
  const placeholder = getDefaultPlaceholderSvg(mapName);
  return {
    totalImages: imageCache.size(),
    cdnBaseUrl: getCdnBaseUrl(),
    cacheSize: (() => { try { return (localStorage.getItem(IMAGE_CACHE_KEY) || '').length; } catch { return 0; } })(),
    hasDefaultPlaceholder: !!placeholder,
    defaultPlaceholderLength: placeholder ? placeholder.length : 0,
    diagnosticsCount: imageLoadDiagnostics.size
  };
}

export { imageCache };
