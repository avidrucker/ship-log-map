// src/utils/cdnHelpers.js

/**
 * CDN Helpers
 *
 * Responsibilities
 * - Compute map-specific CDN paths for images/placeholders/test assets.
 * - Handle base URL overrides and cache-busting query params.
 *
 * Exports
 * - getMapCdnUrl(mapName, base), getPlaceholderUrl(mapName, base), etc.
 */

// Import printDebug from utils/debug.js
import { printDebug } from '../utils/debug.js';

import { loadImageWithFallback } from './imageLoader.js';
import { dataUrlOrBlobToWebpDataUrl } from './imageUtils.js';

// Helper to get map URL from query parameters
export function getMapUrlFromQuery() {
  const urlParams = new URLSearchParams(window.location.search);
  const mapUrl = urlParams.get('map');
  printDebug('[URL] Current window.location.search:', window.location.search);
  printDebug('[URL] Extracted map URL:', mapUrl);
  return mapUrl;
}

// Helper to clear query parameters
export function clearQueryParams() {
  const url = new URL(window.location);
  url.search = '';
  window.history.replaceState({}, '', url);
  printDebug('🔄 [URL] Cleared query parameters');
}

// Helper to load map from CDN
export async function loadMapFromCdn(mapUrl) {
  try {
    printDebug('[CDN] Attempting to load map from:', mapUrl);
    const response = await fetch(mapUrl);
    printDebug('[CDN] Fetch response status:', response.status, response.statusText);
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }
    const data = await response.json();
    printDebug('[CDN] Successfully loaded map data:', data);
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON structure: not an object');
    }
    return { success: true, data };
  } catch (error) {
    console.error('[CDN] Failed to load map:', error);
    printDebug('[CDN] Failed to load map:', error.message);
    return { success: false, error: error.message };
  }
}

// Externalized handleLoadFromCdn for use in App.jsx
export async function handleLoadFromCdn({
  cdnBaseUrl,
  mapName,
  setCdnLoadingState,
  setIsLoadingFromCDN,
  currentCdnLoadRef,
  normalizeGraphData,
  hydrateCoordsIfMissing,
  setGraphData,
  dispatchAppState,
  clearCytoscapeSelections,
  clearUndoState,
  defaultShipLogData,
  ACTION_TYPES,
  setBgImage,
}) {
    printDebug('handleLoadFromCdn called with cdnBaseUrl:', cdnBaseUrl, 'mapName:', mapName);
  
    if (!cdnBaseUrl) {
      printDebug('cdnHelpers.js: No CDN base URL provided, skipping load.');
      return;
    }

    if (currentCdnLoadRef?.current) {
      console.debug('🛑 [CDN] Load ignored: already in-flight.');
      return;
    }
  
    // Sanitize map name to match CDN file naming convention
    const sanitizedMapName = (mapName || 'default_map')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '') || 'default_map';

    const mapJsonFileName = sanitizedMapName + '.json';
    const mapUrl = cdnBaseUrl.endsWith('/')
      ? cdnBaseUrl + mapJsonFileName
      : cdnBaseUrl + '/' + mapJsonFileName;
    setCdnLoadingState({ isLoading: true, error: null });
  
    setIsLoadingFromCDN(true);
  
    currentCdnLoadRef.current = mapUrl;

    try {
    const result = await loadMapFromCdn(mapUrl);
    if (currentCdnLoadRef.current !== mapUrl) return;
    if (result.success) {
      const g1 = normalizeGraphData(result.data);
      const g2 = hydrateCoordsIfMissing(g1, defaultShipLogData);

      // Determine effective mode based on canedit + presence of ANY query params
      const search = window.location.search;
      const hasQuery = !!(search && search.length > 1);
      const params = new URLSearchParams(search);
      const canEdit = (params.get('canedit') === 'true') || !hasQuery;
      const effectiveMode = canEdit ? (typeof g1.mode === 'string' ? g1.mode : 'editing') : 'playing';
      const g2WithMode = { ...g2, mode: effectiveMode };
      setGraphData(g2WithMode);

    // 🖼️ Background image: honor JSON + default filename
    try {
      const b = g1.bgImage;
      if (b && typeof b === 'object' && b.included) {
        const fileName =
          (typeof b.imageUrl === 'string' && b.imageUrl.trim() !== '')
            ? b.imageUrl.trim()
            : 'underlay.png'; // default fallback name
        console.debug('🖼️ [CDN] Attempting BG load:', { fileName, mapName: g1.mapName, cdnBaseUrl: g1.cdnBaseUrl || cdnBaseUrl });
        
        // ⬇️ fullSize=true (do not cache, no thumb)
        const rawDataUrl = await loadImageWithFallback(
          fileName,
          g1.mapName,
          g1.cdnBaseUrl || cdnBaseUrl,
          { fullSize: true }
        );

        // ⬇️ convert heavy PNG/JPEG to WebP, clamp size to 2048px
        const webpDataUrl = await dataUrlOrBlobToWebpDataUrl(rawDataUrl, 2048, 0.82);

        // Safely set into the BG state (preserve authored transforms)
        setBgImage?.({
          imageUrl: webpDataUrl,         // store compact WebP
          included: true,
          x: Number.isFinite(b.x) ? b.x : 0,
          y: Number.isFinite(b.y) ? b.y : 0,
          scale: Number.isFinite(b.scale) ? b.scale : 100,
          opacity: Number.isFinite(b.opacity) ? b.opacity : 100,
          visible: (typeof b.visible === 'boolean') ? b.visible : true
        });
      } else {
        // Explicitly off
        printDebug("🖼️ [CDN] No BG image to load from CDN data");
        setBgImage?.({
          imageUrl: "",
          x: 0, y: 0, scale: 100, opacity: 100, visible: false, included: false
        });
      }
    } catch (e) {
      printDebug('🛑 [CDN] BG image failed to load:', e);
      setBgImage?.({ imageUrl: "", x: 0, y: 0, scale: 100, opacity: 100, visible: false, included: false });
    }

      dispatchAppState({ type: ACTION_TYPES.SET_MODE, payload: { mode: effectiveMode } });
      if (typeof g1.mapName === 'string') {
        dispatchAppState({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: g1.mapName } });
      }
      if (typeof g1.cdnBaseUrl === 'string') {
        dispatchAppState({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: g1.cdnBaseUrl } });
      }
      if (typeof g1.orientation === 'number') {
        dispatchAppState({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: g1.orientation } });
      }
      if (typeof g1.compassVisible === 'boolean') {
        dispatchAppState({ type: ACTION_TYPES.SET_COMPASS_VISIBLE, payload: { visible: g1.compassVisible } });
      }
      if (typeof g1.bgImage === 'object' && g1.bgImage !== null) {
        dispatchAppState({ type: ACTION_TYPES.SET_BG_IMAGE, payload: { bgImage: g1.bgImage } });
      } else {
        printDebug("cdnHelpers.js: No bgImage data found in loaded map");
      }
      console.log("cdnHelpers: Changing camera state after CDN load");
      dispatchAppState({ type: ACTION_TYPES.SET_ZOOM_INTERNAL, payload: { zoom: 1 } });
      dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION_INTERNAL, payload: { position: { x: 0, y: 0 } } });
      dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });
      clearCytoscapeSelections();
      dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
      clearUndoState();
      setCdnLoadingState({ isLoading: false, error: null });
      setIsLoadingFromCDN(false);
      currentCdnLoadRef.current = null;

      printDebug("cdnHelpers.js: Triggering a graph visual update after CDN load");
      // trigger graph visual update if needed
      dispatchAppState({ type: ACTION_TYPES.TRIGGER_GRAPH_UPDATE });
      
    } else {
      setCdnLoadingState({ isLoading: false, error: result.error || 'Failed to load map from CDN.' });
      setIsLoadingFromCDN(false);
      currentCdnLoadRef.current = null;
    }
  } catch (error) {
    setCdnLoadingState({ isLoading: false, error: error.message || 'Unexpected error.' });
    setIsLoadingFromCDN(false);
    currentCdnLoadRef.current = null;
  } finally {
    if (currentCdnLoadRef) {
      printDebug("cdnHelpers.js: finally block, resetting currentCdnLoadRef.current to false");
      currentCdnLoadRef.current = false;
    } else {
      printDebug('cdnHelpers.js: currentCdnLoadRef is not defined in finally block.');
    }
  }
}

// CDN base URL management
export function setCdnBaseUrl(url) {
  try {
    if (typeof url !== 'string') return;
    localStorage.setItem('shipLogCdnBaseUrl', url);
    printDebug(`🌐 [CDNHelpers] setCdnBaseUrl='${url}'`);
  } catch (error) {
    printDebug('Failed to set CDN base URL:', error);
  }
}
export function getCdnBaseUrl() {
  try { return localStorage.getItem('shipLogCdnBaseUrl') || ''; } catch { return ''; }
}

// Helpers
export function encodeImageFileName(fileName) { return encodeURIComponent(fileName); }
export function buildCdnUrl(cdnBaseUrl, mapName, imagePath) {
  if (!cdnBaseUrl) return null;
  const trimmedBase = cdnBaseUrl.replace(/\/+$/, '');
  const encodedMap = encodeURIComponent(mapName || 'default_map');
  // Detect if base already ends with the map segment (encoded or raw) to avoid duplication
  const lastSegment = trimmedBase.substring(trimmedBase.lastIndexOf('/') + 1);
  const baseAlreadyIncludesMap = lastSegment === encodedMap || decodeURIComponent(lastSegment) === (mapName || 'default_map');
  if (baseAlreadyIncludesMap) {
    try {
      if (!buildCdnUrl._warned) buildCdnUrl._warned = new Set();
      const key = trimmedBase + '|' + mapName;
      if (!buildCdnUrl._warned.has(key)) {
        printDebug(`🛠️ [CDNHelpers] Base URL already contains map segment; preventing duplicate: base='${trimmedBase}', map='${mapName}'`);
        buildCdnUrl._warned.add(key);
      }
    } catch { /* noop */ }
    return `${trimmedBase}/${encodeImageFileName(imagePath)}`;
  }
  return `${trimmedBase}/${encodedMap}/${encodeImageFileName(imagePath)}`;
}

export function buildAlternativeBaseUrls(cdnBaseUrl) {
  const alts = [];
  try {
    const u = new URL(cdnBaseUrl);
    // raw.githubusercontent.com -> cdn.jsdelivr.net/gh
    if (u.hostname === 'raw.githubusercontent.com') {
      const [user, repo, branch, ...rest] = u.pathname.slice(1).split('/');
      if (user && repo && branch) {
        alts.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${rest.join('/')}`.replace(/\/$/, ''));
      }
    }
    // jsdelivr -> raw.githubusercontent.com
    if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.startsWith('/gh/')) {
      const parts = u.pathname.split('/');
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

