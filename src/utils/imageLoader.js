// src/utils/imageLoader.js
import { printDebug, printWarn } from "../utils/debug.js";

// Storage keys
const IMAGE_CACHE_KEY = 'shipLogImageCache';
const CDN_BASE_URL_KEY = 'shipLogCdnBaseUrl';
// Optional CDN placeholder filename
const DEFAULT_PLACEHOLDER_FILENAME = 'default_image.svg';

// Special cache key prefix for default placeholder (per map)
const PLACEHOLDER_CACHE_KEY_PREFIX = '__default_placeholder__:'; // + mapName

// Default "Image not found" SVG (used only when a specific image path fails)
const IMAGE_NOT_FOUND_SVG = `data:image/svg+xml;base64,${btoa(`
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#f5f5f5" stroke="#ccc" stroke-width="2"/>
  <text x="50" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">Image</text>
  <text x="50" y="50" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">not</text>
  <text x="50" y="65" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">found</text>
  <path d="M25 25 L75 75 M75 25 L25 75" stroke="#ff6b6b" stroke-width="2"/>
</svg>
`)}`;

// Lightweight listeners for when the placeholder becomes available
const placeholderListeners = new Set();
function notifyPlaceholderLoaded(mapName, dataUrl) {
  placeholderListeners.forEach(fn => {
    try { fn(mapName, dataUrl); } catch { /* noop */ }
  });
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
        const entryCount = Object.keys(parsedCache).length;
        printDebug(`💾 [ImageCache] Found ${entryCount} cached entries in localStorage`);
        this.cache.clear();
        Object.entries(parsedCache).forEach(([key, value]) => {
          this.cache.set(key, value);
        });
        printDebug(`✅ [ImageCache] Cache hydrated with ${this.cache.size} entries`);
      }
    } catch (error) {
      console.warn('Failed to load image cache from localStorage:', error);
    }
  }

  saveCache() {
    try {
      const cacheObject = {};
      this.cache.forEach((value, key) => { cacheObject[key] = value; });
      const serialized = JSON.stringify(cacheObject);
      const localStorageUsage = getLocalStorageUsage();
      printDebug(`💾 [ImageCache] Saving ${Object.keys(cacheObject).length} entries (size=${serialized.length} chars, localStorageUsage≈${Math.round(localStorageUsage/1024)}KB)`);
      localStorage.setItem(IMAGE_CACHE_KEY, serialized);
    } catch (error) {
      console.error('❌ [ImageCache] Failed to save image cache:', error);
      if (error?.name === 'QuotaExceededError') {
        printWarn('🚨 [ImageCache] Quota exceeded; clearing entire image cache');
        this.cache.clear();
        try { localStorage.removeItem(IMAGE_CACHE_KEY); } catch { /* noop */ }
      }
    }
  }

  get(key) { return this.cache.get(key); }
  has(key) { return this.cache.has(key); }

  set(key, value) {
    this.cache.set(key, value);
    // Debounced-ish save (simple microtask batching)
    if (!this._saveScheduled) {
      this._saveScheduled = true;
      queueMicrotask(() => { this._saveScheduled = false; this.saveCache(); });
    }
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    try { localStorage.removeItem(IMAGE_CACHE_KEY); } catch { /* noop */ }
    printDebug(`🧹 [ImageCache] Cleared cache (${size} entries removed)`);
  }

  size() { return this.cache.size; }
}

// Global image cache instance
const imageCache = new ImageCache();

// CDN base URL management
export function setCdnBaseUrl(url) {
  try {
    if (typeof url !== 'string') return;
    localStorage.setItem(CDN_BASE_URL_KEY, url);
    printDebug(`🌐 [ImageLoader] setCdnBaseUrl='${url}'`);
  } catch (error) {
    console.warn('Failed to set CDN base URL:', error);
  }
}
export function getCdnBaseUrl() {
  try { return localStorage.getItem(CDN_BASE_URL_KEY) || ''; } catch { return ''; }
}

// Helpers
function encodeImageFileName(fileName) { return encodeURIComponent(fileName); }
function buildCdnUrl(cdnBaseUrl, mapName, imagePath) {
  if (!cdnBaseUrl) return null;
  const trimmedBase = cdnBaseUrl.replace(/\/+$/, '');
  const encodedMap = encodeURIComponent(mapName || 'default_map');
  // Detect if base already ends with the map segment (encoded or raw) to avoid duplication
  const lastSegment = trimmedBase.substring(trimmedBase.lastIndexOf('/') + 1);
  const baseAlreadyIncludesMap = lastSegment === encodedMap || decodeURIComponent(lastSegment) === (mapName || 'default_map');
  if (baseAlreadyIncludesMap) {
    // Only log once per session per map duplication scenario (simple guard via symbol on function)
    try {
      if (!buildCdnUrl._warned) buildCdnUrl._warned = new Set();
      const key = trimmedBase + '|' + mapName;
      if (!buildCdnUrl._warned.has(key)) {
        printDebug(`🛠️ [ImageLoader] Base URL already contains map segment; preventing duplicate: base='${trimmedBase}', map='${mapName}'`);
        buildCdnUrl._warned.add(key);
      }
    } catch { /* noop */ }
    return `${trimmedBase}/${encodeImageFileName(imagePath)}`;
  }
  return `${trimmedBase}/${encodedMap}/${encodeImageFileName(imagePath)}`;
}

// Placeholder state tracking per mapName
const placeholderLoadPromises = new Map(); // mapName -> Promise

async function fetchAsDataUrl(url, options = {}) {
  const { cacheMode = 'force-cache', responseType = 'blob' } = options;
  const started = Date.now();
  const resp = await fetch(url, { cache: cacheMode });
  const duration = Date.now() - started;
  if (!resp.ok) {
    const ct = resp.headers.get('content-type');
    throw new Error(`HTTP ${resp.status} (${resp.statusText}) ct=${ct || 'n/a'} in ${duration}ms`);
  }
  const blob = await resp.blob();
  if (responseType === 'blob') {
    // Convert to base64 DataURL (important for Cytoscape image usage uniformity)
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return blob; // future extension
}

// Build alternative CDN URLs for retry (raw.githubusercontent <-> jsdelivr)
function buildAlternativeBaseUrls(cdnBaseUrl) {
  const alts = [];
  try {
    const u = new URL(cdnBaseUrl);
    // raw.githubusercontent.com -> cdn.jsdelivr.net/gh
    if (u.hostname === 'raw.githubusercontent.com') {
      // raw: /user/repo/branch/path
      const [user, repo, branch, ...rest] = u.pathname.slice(1).split('/');
      if (user && repo && branch) {
        alts.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${rest.join('/')}`.replace(/\/$/, ''));
      }
    }
    // jsdelivr -> raw.githubusercontent.com
    if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.startsWith('/gh/')) {
      // /gh/user/repo@branch/path
      const parts = u.pathname.split('/'); // ['', 'gh', 'user', 'repo@branch', 'path', ...]
      const user = parts[2];
      const repoBranch = parts[3];
      const after = parts.slice(4).join('/');
      if (repoBranch && repoBranch.includes('@')) {
        const [repo, branch] = repoBranch.split('@');
        alts.push(`https://raw.githubusercontent.com/${user}/${repo}/${branch}/${after}`.replace(/\/$/, ''));
      }
    }
  } catch { /* noop */ }
  return alts;
}

// Diagnostics tracking for image load attempts (in-memory only)
const MAX_DIAGNOSTIC_ENTRIES = 100;
const imageLoadDiagnostics = new Map(); // key -> { attempts: [...], finalResult }

function recordImageAttempt(key, info) {
  let entry = imageLoadDiagnostics.get(key);
  if (!entry) { entry = { attempts: [], finalResult: null }; imageLoadDiagnostics.set(key, entry); }
  entry.attempts.push({ ...info, ts: Date.now() });
  // Truncate attempts if too many (unlikely per key)
  if (entry.attempts.length > 10) entry.attempts.splice(0, entry.attempts.length - 10);
  // Global truncation
  if (imageLoadDiagnostics.size > MAX_DIAGNOSTIC_ENTRIES) {
    // Remove oldest by first attempt timestamp
    const oldestKey = [...imageLoadDiagnostics.entries()].sort((a,b)=>a[1].attempts[0].ts - b[1].attempts[0].ts)[0]?.[0];
    if (oldestKey) imageLoadDiagnostics.delete(oldestKey);
  }
}
function finalizeImageAttempt(key, finalResult) {
  const entry = imageLoadDiagnostics.get(key);
  if (entry) entry.finalResult = finalResult;
}
export function getImageLoadDiagnostics() {
  // Return shallow copy safe for JSON
  const out = {};
  imageLoadDiagnostics.forEach((v,k)=> { out[k] = { attempts: v.attempts, finalResult: v.finalResult }; });
  return out;
}
export function clearImageLoadDiagnostics() { imageLoadDiagnostics.clear(); }

// Attempt to load & cache default placeholder for a map (idempotent)
export function ensureDefaultPlaceholderLoaded(mapName = 'default_map', cdnBaseUrlOverride) {
  const cacheKey = PLACEHOLDER_CACHE_KEY_PREFIX + mapName;
  // If already cached (string) just resolve
  if (imageCache.has(cacheKey)) {
    const existing = imageCache.get(cacheKey);
    if (typeof existing === 'string') return Promise.resolve(existing);
  }
  if (placeholderLoadPromises.has(mapName)) return placeholderLoadPromises.get(mapName);

  const cdnBaseUrl = cdnBaseUrlOverride !== undefined ? cdnBaseUrlOverride : getCdnBaseUrl();
  if (!cdnBaseUrl) {
    printDebug(`⚠️ [ImageLoader] No CDN base URL; skipping placeholder load for map '${mapName}'`);
    return Promise.resolve(null);
  }
  const url = buildCdnUrl(cdnBaseUrl, mapName, DEFAULT_PLACEHOLDER_FILENAME);
  const p = (async () => {
    try {
      printDebug(`🖼️ [ImageLoader] Attempting to load default placeholder from: ${url}`);
      const dataUrl = await fetchAsDataUrl(url);
      if (!dataUrl.startsWith('data:image/svg+xml')) {
        printWarn(`⚠️ [ImageLoader] default_image.svg did not return SVG (content-type mismatch)`);
        return null;
      }
      imageCache.set(cacheKey, dataUrl);
      notifyPlaceholderLoaded(mapName, dataUrl);
      printDebug(`✅ [ImageLoader] Loaded & cached default placeholder for map '${mapName}'`);
      return dataUrl;
    } catch (e) {
      printDebug(`❌ [ImageLoader] Failed to load default placeholder: ${e.message}`);
      return null; // silent failure -> fallback to built-in
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

// Core loader for individual images referenced in graph
export async function loadImageWithFallback(imagePath, mapName = '', cdnBaseUrlOverride = undefined) {
  printDebug(`🖼️ [ImageLoader] loadImageWithFallback("${imagePath}", map="${mapName}")`);
  if (!imagePath) return IMAGE_NOT_FOUND_SVG;
  if (imagePath.startsWith('data:')) return imagePath; // already a data URL

  const cacheKey = `${mapName}:${imagePath}`;
  if (imageCache.has(cacheKey)) {
    const cached = imageCache.get(cacheKey);
    if (typeof cached === 'string') {
      printDebug(`💾 [ImageLoader] Cache hit for ${cacheKey}`);
      return cached;
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
      const dataUrl = await fetchAsDataUrl(url, { cacheMode });
      recordImageAttempt(diagKey, { url, cacheMode, phase: 'fetch-success', length: dataUrl.length });
      return { success: true, dataUrl };
    } catch (e) {
      recordImageAttempt(diagKey, { url, cacheMode, phase: 'fetch-error', error: e.message });
      printDebug(`❌ [ImageLoader] Attempt failed url='${url}' cache='${cacheMode}' error='${e.message}'`);
      return { success: false, error: e };
    }
  };

  // Strategy: try force-cache, then no-cache; then alternative base URLs.
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
        imageCache.set(cacheKey, res.dataUrl);
        finalizeImageAttempt(diagKey, 'success');
        printDebug(`✅ [ImageLoader] Loaded & cached '${imagePath}' from '${url}' (${res.dataUrl.length} chars)`);
        return res.dataUrl;
      }
    }
  }

  printDebug(`🛑 [ImageLoader] All attempts failed for '${imagePath}'. Falling back to IMAGE_NOT_FOUND_SVG.`);
  imageCache.set(cacheKey, IMAGE_NOT_FOUND_SVG);
  finalizeImageAttempt(diagKey, 'fallback');
  return IMAGE_NOT_FOUND_SVG;
}

// Preload list of nodes (only those with non-data imageUrl strings)
export async function preloadNodeImages(nodes, mapName = '', cdnBaseUrlOverride = undefined) {
  const tasks = nodes.filter(n => n.imageUrl && !n.imageUrl.startsWith('data:') && n.imageUrl !== 'unspecified')
    .map(n => loadImageWithFallback(n.imageUrl, mapName, cdnBaseUrlOverride).then(url => ({ id: n.id, url })).catch(() => null));
  const results = await Promise.all(tasks);
  return results.filter(Boolean);
}

export function clearAllImageCaches() {
  imageCache.clear();
  // Also attempt to clear grayscale cache (cyAdapter)
  try {
    localStorage.removeItem('shipLogGrayscaleCache');
  } catch { /* noop */ }
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

// Validate and suggest correct CDN URLs
export function validateCdnUrl(url) {
  if (!url) return { isValid: false, suggestion: null, issues: ['URL empty'], originalUrl: url, suggestedUrl: null };
  const issues = [];
  let suggestion = url;
  if (url.includes('github.com') && url.includes('/tree/')) {
    issues.push('GitHub tree URL will not serve raw assets.');
    suggestion = url.replace('/tree/', '/raw/');
  }
  if (url.endsWith('/')) {
    suggestion = suggestion.replace(/\/+$/, '');
  }
  const urlPattern = /^https?:\/\/.+/;
  if (!urlPattern.test(url)) issues.push('Must start with http(s)://');
  return { isValid: issues.length === 0, suggestion: suggestion !== url ? suggestion : null, issues, originalUrl: url, suggestedUrl: suggestion };
}

function getLocalStorageUsage() {
  try {
    let total = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k); total += (k?.length || 0) + (v?.length || 0); }
    return total;
  } catch { return 0; }
}
