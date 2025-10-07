// src/graph/cyAdapter.js

/**
 * Cytoscape Adapter (rendering + event wiring)
 *
 * Responsibilities
 * - Mount/tear down Cytoscape with a provided container element.
 * - Sync declarative domain `nodes`/`edges` to Cytoscape elements.
 * - Wire pointer/selection/double-click/background events back to React.
 * - Manage image placeholders + grayscale readiness for image nodes.
 *
 * Key Functions
 * - mountCy(container, opts) -> cy
 * - syncElements(cy, {nodes, edges})
 * - wireEvents(cy, callbacks)
 * - updateOverlays(cy, notes, showNoteCountOverlay)
 *
 * Contracts
 * - Receives dumb data (no Cytoscape instances); returns no domain mutations.
 * - Emits IDs and minimal payloads via callbacks; App decides how to react.
 */

import cytoscape from "cytoscape";
import cytoscapeStyles from "../cytoscapeStyles.js";
import { deserializeGraph } from "./ops.js";
import { TEST_ICON_SVG } from "../constants/testAssets.js";
import { GRAYSCALE_IMAGES } from "../config/features.js";
import { convertImageToGrayscale } from "../utils/grayscaleUtils.js";
import { getCdnBaseUrl } from "../utils/cdnHelpers.js";
import { loadImageWithFallback, imageCache, getDefaultPlaceholderSvg, ensureDefaultPlaceholderLoaded, onDefaultPlaceholderLoaded } from "../utils/imageLoader.js";
import { printDebug } from "../utils/debug.js"; // printWarn
import { installAppearOnAdd } from '../anim/appear.js';
import { isSearchInProgress, isCurrentSearchSelection, getCurrentSearchIds } from '../search/searchHighlighter.js';
import { ensure as ensureOverlays, refreshPositions as refreshOverlayPositions, attach as attachOverlayManager, detach as detachOverlayManager, setNoteCountsVisible } from './overlayManager.js';

// Cache for grayscale images to avoid reprocessing
const GRAYSCALE_CACHE_KEY = 'shipLogGrayscaleCache';
const grayscaleCache = new Map();
const pendingConversions = new Set();

// Track pending image loads to prevent duplicate requests
const pendingImageLoads = new Set();

// Queue for image updates that finish loading before Cytoscape instance exists
const pendingNodeImageUpdates = [];

// Track current active Cytoscape instance (helps with React 18 StrictMode double mount)
let currentActiveCy = null;

// Load grayscale cache from localStorage on module initialization
function loadGrayscaleCacheFromStorage() {
  try {
    const cached = localStorage.getItem(GRAYSCALE_CACHE_KEY);
    if (cached) {
      const parsedCache = JSON.parse(cached);
      const entryCount = Object.keys(parsedCache).length;
      printDebug(`💾 [cyAdapter] Loading grayscale cache from localStorage with ${entryCount} entries`);
      Object.entries(parsedCache).forEach(([key, value]) => {
        grayscaleCache.set(key, value);
        printDebug(`💾 [cyAdapter] Loaded grayscale cache entry: "${key.substring(0, 50)}..." -> value length: ${value?.length || 0}`);
      });
      printDebug(`✅ [cyAdapter] Grayscale cache loaded successfully with ${grayscaleCache.size} entries`);
    } else {
      printDebug(`💾 [cyAdapter] No grayscale cache found in localStorage`);
    }
  } catch (error) {
    console.warn('Failed to load grayscale cache from localStorage:', error);
  }
}

// Save grayscale cache to localStorage
function saveGrayscaleCacheToStorage() {
  try {
    const cacheObject = {};
    let savedCount = 0;
    grayscaleCache.forEach((value, key) => {
      // Only save completed conversions (strings), not promises
      if (typeof value === 'string') {
        cacheObject[key] = value;
        savedCount++;
      }
    });
    printDebug(`💾 [cyAdapter] Saving grayscale cache to localStorage: ${savedCount} entries out of ${grayscaleCache.size} total`);
    localStorage.setItem(GRAYSCALE_CACHE_KEY, JSON.stringify(cacheObject));
    printDebug(`✅ [cyAdapter] Grayscale cache saved successfully`);
  } catch (error) {
    console.warn('Failed to save grayscale cache to localStorage:', error);
  }
}

// Initialize cache from localStorage
loadGrayscaleCacheFromStorage();

// Debounced save to avoid excessive localStorage writes
let saveGrayscaleCacheTimeout = null;
function debouncedSaveGrayscaleCache() {
  clearTimeout(saveGrayscaleCacheTimeout);
  saveGrayscaleCacheTimeout = setTimeout(() => {
    saveGrayscaleCacheToStorage();
  }, 2000); // Save at most once every 2 seconds
}

// Preprocess images to grayscale in the background to avoid race conditions
function preprocessImageToGrayscale(imageUrl, originalImagePath = null) {
  printDebug(`🎨 [cyAdapter] preprocessImageToGrayscale called with: "${imageUrl?.substring(0, 50)}..." (originalPath: ${originalImagePath || 'none'})`);
  
  if (!GRAYSCALE_IMAGES || !imageUrl) {
    printDebug(`⚠️ [cyAdapter] Skipping grayscale: feature disabled or no image`);
    return Promise.resolve(imageUrl);
  }
  
  // Skip SVG placeholders and test icons
  if (imageUrl === TEST_ICON_SVG || imageUrl.includes('data:image/svg+xml')) {
    printDebug(`⚠️ [cyAdapter] Skipping grayscale for SVG placeholder`);
    return Promise.resolve(imageUrl);
  }
  
  // Only process real image data URLs - skip filenames and non-image data
  if (!imageUrl.startsWith('data:image/') || imageUrl.startsWith('data:image/svg+xml')) {
    printDebug(`⚠️ [cyAdapter] Skipping grayscale for non-image data URL: "${imageUrl?.substring(0, 50)}..."`);
    return Promise.resolve(imageUrl);
  }
  
  // Use original image path as cache key if available, otherwise fall back to image URL
  const cacheKey = originalImagePath || imageUrl;
  
  if (grayscaleCache.has(cacheKey)) {
    const cached = grayscaleCache.get(cacheKey);
    printDebug(`💾 [cyAdapter] Found cached grayscale result for key: "${originalImagePath ? 'path-based' : 'url-based'}"`);
    // If it's a string (completed conversion), return it
    if (typeof cached === 'string') {
      return Promise.resolve(cached);
    }
    // If it's a promise (in progress), return the promise
    return cached;
  }
  
  printDebug(`🔄 [cyAdapter] Starting new grayscale conversion with cache key: "${cacheKey?.substring(0, 50)}..."`);
  // Start conversion in background, but don't wait for it
  const conversionPromise = convertImageToGrayscale(imageUrl)
    .then(grayscaleUrl => {
      grayscaleCache.set(cacheKey, grayscaleUrl);
      pendingConversions.delete(imageUrl);
      // Save to localStorage when conversion completes (debounced)
      debouncedSaveGrayscaleCache();
      return grayscaleUrl;
    })
    .catch(error => {
      console.warn('Failed to convert image to grayscale:', error);
      grayscaleCache.set(cacheKey, imageUrl); // Cache the original to avoid retrying
      pendingConversions.delete(imageUrl);
      // Save to localStorage even on failure to avoid retrying (debounced)
      debouncedSaveGrayscaleCache();
      return imageUrl;
    });
  
  pendingConversions.add(imageUrl);
  grayscaleCache.set(cacheKey, conversionPromise);
  return conversionPromise;
}

// Check if there are pending conversions that might benefit from an update
export function hasPendingGrayscaleConversions() {
  return pendingConversions.size > 0;
}

// Update only image data for nodes that have completed grayscale conversion
export function updateCompletedGrayscaleImages(cy, graph) {
  if (!GRAYSCALE_IMAGES || pendingConversions.size === 0) return false;
  
  let updated = false;
  const g = deserializeGraph(graph);
  
  g.nodes.forEach(n => {
    const imageUrl = n.imageUrl;
    if (imageUrl && imageUrl !== TEST_ICON_SVG && grayscaleCache.has(imageUrl)) {
      const cached = grayscaleCache.get(imageUrl);
      if (typeof cached === 'string' && !pendingConversions.has(imageUrl)) {
        // Conversion completed, update the node
        const cyNode = cy.getElementById(n.id);
        if (cyNode.length > 0 && cyNode.data('imageUrl') !== cached) {
          cyNode.data('imageUrl', cached);
          updated = true;
        }
      }
    }
  });
  
  return updated;
}

/**
 * Update overlays from a notes object and visibility flag.
 * IMPORTANT: While a node is being dragged, we only reposition overlays
 * (cheap) instead of re-ensuring/recreating them (expensive). This stops
 * badges from “flying” or snapping.
 */
export function updateOverlays(cy, notes, showNoteCountOverlay, visited = null) {
  if (!cy || cy.destroyed()) return;

  // If drag in progress, just reposition what already exists.
  const dragging = !!cy.scratch('_overlay_dragging');
  if (dragging) {
    refreshOverlayPositions(cy);
    setNoteCountsVisible(cy, showNoteCountOverlay);
    return;
  }
  
  // Build node/edge note counts from notes object
  const nodeNoteCounts = new Map();
  const edgeNoteCounts = new Map();
  
  Object.entries(notes).forEach(([id, noteArray]) => {
    const count = Array.isArray(noteArray) ? noteArray.length : 0;
    if (count > 0) {
      const ele = cy.getElementById(id);
      if (ele.length) {
        if (ele.isNode()) nodeNoteCounts.set(id, count);
        else if (ele.isEdge()) edgeNoteCounts.set(id, count);
      }
    }
  });
  
  // Ensure overlays exist & are correct
  ensureOverlays(cy, {
    nodeNoteCounts,
    edgeNoteCounts,
    visited: visited || { nodes: new Set(), edges: new Set() }
  });

  setNoteCountsVisible(cy, showNoteCountOverlay);
}

// Convert domain graph -> Cytoscape elements (now synchronous with fallback)
export function buildElementsFromDomain(graph, options = {}) {
  const { mode = 'editing', onImageLoaded = null, forceImageLoad = false, cdnBaseUrlOverride = undefined, markAsNew = false } = options;
  const g = deserializeGraph(graph);

  // Resolve effective CDN base URL with override priority to avoid first-load race with localStorage
  const effectiveCdnBaseUrl = cdnBaseUrlOverride !== undefined ? cdnBaseUrlOverride : (g.cdnBaseUrl || getCdnBaseUrl());
  if (cdnBaseUrlOverride !== undefined) {
    printDebug(`🌐 [cyAdapter] Using cdnBaseUrlOverride='${cdnBaseUrlOverride}' (g.cdnBaseUrl='${g.cdnBaseUrl || ''}')`);
  } else if (g.cdnBaseUrl) {
    printDebug(`🌐 [cyAdapter] Using graph.cdnBaseUrl='${g.cdnBaseUrl}'`);
  } else {
    printDebug(`🌐 [cyAdapter] Using persisted cdnBaseUrl='${effectiveCdnBaseUrl || ''}'`);
  }

  // Attempt (non-blocking) load of default placeholder if not already cached
  try { ensureDefaultPlaceholderLoaded(g.mapName || 'default_map', effectiveCdnBaseUrl); } catch { /* noop */ }
  const defaultPlaceholder = getDefaultPlaceholderSvg(g.mapName || 'default_map');

  // Process nodes - use cache/CDN/fallback system, then apply grayscale if enabled
  const nodes = g.nodes.map(n => {
    let imageUrl = n.imageUrl;

    // Handle "unspecified" or missing image URLs -> use CDN placeholder if available, else test icon
    if (!imageUrl || imageUrl === "unspecified") {
      imageUrl = defaultPlaceholder || TEST_ICON_SVG;
    } else if (imageUrl !== TEST_ICON_SVG && !imageUrl.startsWith('data:')) {
      printDebug(`🔍 [cyAdapter] Processing non-data-URL image: ${imageUrl}, forceImageLoad: ${forceImageLoad}`);
      const cacheKey = `${g.mapName || ''}:${imageUrl}`;
      if (imageCache.has(cacheKey)) {
        imageUrl = imageCache.get(cacheKey);
        printDebug(`✅ [cyAdapter] Using cached image for: ${n.imageUrl}`);
        printDebug(`🔍 [cyAdapter] Cached imageUrl is: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null/undefined'}`);
      } else if (forceImageLoad) {
        const loadKey = `${g.mapName || ''}:${imageUrl}`;
        if (!pendingImageLoads.has(loadKey)) {
          pendingImageLoads.add(loadKey);
          printDebug(`🔄 [cyAdapter] Starting image load for: ${imageUrl}`);
          // IMPORTANT: update the CHILD node ("id__entry") where imageUrl lives.
          const parentIdForNode = n.id;
          const entryChildIdForNode = `${parentIdForNode}__entry`;
          const originalImageUrl = imageUrl;
          printDebug(`🎯 [cyAdapter] Scheduling async load for childId="${entryChildIdForNode}" originalUrl="${originalImageUrl}"`);
          if (effectiveCdnBaseUrl) {
            loadImageWithFallback(imageUrl, g.mapName || '', effectiveCdnBaseUrl).then(loadedImageUrl => {
              pendingImageLoads.delete(loadKey);
              printDebug(`✅ [cyAdapter] Image loaded for childId="${entryChildIdForNode}" originalUrl="${originalImageUrl}" length=${loadedImageUrl?.length || 0}`);
              if (onImageLoaded) {
                onImageLoaded(entryChildIdForNode, loadedImageUrl);
              }
              if (GRAYSCALE_IMAGES && loadedImageUrl && (loadedImageUrl.startsWith('data:image/png;') || loadedImageUrl.startsWith('data:image/jpeg;') || loadedImageUrl.startsWith('data:image/jpg;') || loadedImageUrl.startsWith('data:image/webp;'))) {
                printDebug(`🎨 [cyAdapter] Starting grayscale (post-display) for: ${originalImageUrl}`);
                preprocessImageToGrayscale(loadedImageUrl, originalImageUrl).then(grayscaleUrl => {
                  printDebug(`✅ [cyAdapter] Grayscale conversion complete for: ${originalImageUrl}`);
                  if (onImageLoaded) { onImageLoaded(entryChildIdForNode, grayscaleUrl); }
                }).catch(error => { console.warn(`❌ [cyAdapter] Grayscale conversion failed for: ${originalImageUrl}`, error); });
              }
            }).catch(error => {
              pendingImageLoads.delete(loadKey);
              console.warn(`❌ [cyAdapter] Failed to load image: ${originalImageUrl}`, error);
            });
          } else {
            printDebug(`⚠️ [cyAdapter] No effective CDN base URL available during load for '${imageUrl}'`);
          }
        } else {
          printDebug(`⏳ [cyAdapter] Image already loading: ${imageUrl}`);
        }
        imageUrl = defaultPlaceholder || TEST_ICON_SVG; // placeholder while loading
      } else {
        printDebug(`🔒 [cyAdapter] Skipping image load (not forced): ${imageUrl}`);
        imageUrl = defaultPlaceholder || TEST_ICON_SVG;
      }
    }
    
    // Apply grayscale to images that are already data URLs (cached images) - but not SVGs
    if (GRAYSCALE_IMAGES && imageUrl && 
        (imageUrl.startsWith('data:image/png;') || 
         imageUrl.startsWith('data:image/jpeg;') || 
         imageUrl.startsWith('data:image/jpg;') || 
         imageUrl.startsWith('data:image/webp;')) && 
        imageUrl !== TEST_ICON_SVG) {
      
      const originalPath = n.imageUrl; // The original filename
      let cached = grayscaleCache.get(originalPath);
      if (!cached || typeof cached !== 'string') {
        cached = grayscaleCache.get(imageUrl); // Fallback to data URL key
      }
      
      if (cached && typeof cached === 'string') {
        printDebug(`✅ [cyAdapter] Using cached grayscale for data URL (key: ${originalPath ? 'path-based' : 'url-based'})`);
        imageUrl = cached; // already grayscale
      } else {
        printDebug(`🔄 [cyAdapter] Queueing grayscale conversion (will update later) for cached data URL`);
        preprocessImageToGrayscale(imageUrl, originalPath); // background; node shows color first
      }
    }
    
    const parentId = n.id; // domain id becomes parent container id
    const entryChildId = `${parentId}__entry`; // child visual node
    const entryClasses = markAsNew ? 'entry node-entering' : 'entry';
    
    return [
      {
        group: 'nodes',
        data: { id: parentId, size: n.size ?? 'regular', color: n.color ?? 'gray', label: '', isContainer: true },
        position: { x: n.x, y: n.y },
        selectable: true,
        grabbable: mode === 'editing',
        classes: 'entry-parent'
      },
      {
        group: 'nodes',
        data: { id: entryChildId, parent: parentId, label: n.title ?? '', color: n.color ?? 'gray', size: n.size ?? 'regular', imageUrl, originalImageUrl: n.imageUrl, isNewlyCreated: markAsNew },
        position: { x: n.x, y: n.y },
        selectable: false,
        grabbable: false,
        classes: entryClasses
      }
    ];
  }).flat();

  const edges = g.edges.map(e => ({
    group: "edges",
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      direction: e.direction ?? "forward"
    },
    selectable: true
  }));

  return [...nodes, ...edges];
}

// Create & mount Cytoscape instance
export async function mountCy({ container, graph, styles = cytoscapeStyles, mode = 'editing' }) {
  let cy;
  const unsubscribePlaceholder = onDefaultPlaceholderLoaded((mapName, dataUrl) => {
    try {
      if (!cy || cy.destroyed()) return;
      const domainMapName = graph.mapName || 'default_map';
      if (mapName !== domainMapName) return;
      let updated = 0;
      cy.nodes('.entry').forEach(n => {
        const original = n.data('originalImageUrl');
        const current = n.data('imageUrl');
        if ((original === 'unspecified' || !original) && (!current || current === TEST_ICON_SVG)) {
          n.data('imageUrl', dataUrl);
          updated++;
        }
      });
      if (updated) {
        printDebug(`🖼️ [cyAdapter] Applied CDN default placeholder to ${updated} nodes after async load`);
        cy.style().update();
      }
    } catch { /* noop */ }
  });

  // Create image update callback aware of active instance
  const onImageLoaded = (nodeId, imageUrl) => {
    // Redirect parent id to child if necessary (backward compatibility safeguard)
    if (nodeId && !nodeId.endsWith('__entry')) {
      const possibleChild = `${nodeId}__entry`;
      if (cy && cy.getElementById(possibleChild).length > 0) {
        printDebug(`🛠️ [cyAdapter] Redirecting onImageLoaded target from parent '${nodeId}' to child '${possibleChild}'`);
        nodeId = possibleChild;
      }
    }
    // If local cy reference not set yet just queue
    if (!cy) {
      pendingNodeImageUpdates.push({ nodeId, imageUrl });
      return;
    }

    const isActive = currentActiveCy === cy && !cy.destroyed();
    if (!isActive) {
      console.warn(`🔁 [cyAdapter] Received image for inactive/destroyed instance. Forwarding to active instance. node=${nodeId}`);
      pendingNodeImageUpdates.push({ nodeId, imageUrl });
      if (currentActiveCy && !currentActiveCy.destroyed()) {
        const activeNode = currentActiveCy.getElementById(nodeId);
        if (activeNode.length) {
          activeNode.data('imageUrl', imageUrl);
          currentActiveCy.style().update();
          printDebug(`✅ [cyAdapter] Applied image update to active instance for node ${nodeId}`);
        }
      }
      return;
    }

    const node = cy.getElementById(nodeId);
    if (!node || node.length === 0) {
      console.warn(`⚠️ [cyAdapter] Cannot find node ${nodeId} on (possibly inactive) instance; queueing update`);
      pendingNodeImageUpdates.push({ nodeId, imageUrl });
      return;
    }

    try {
      node.data('imageUrl', imageUrl);
      cy.style().update();
      printDebug(`✅ [cyAdapter] Updated node "${nodeId}" image on active instance (imageUrl length: ${imageUrl?.length || 0})`);
    } catch (err) {
      console.error(`❌ [cyAdapter] Failed to update node ${nodeId} image:`, err);
    }
  };

  // Check if any images need to be loaded
  const { nodes } = graph;
  if (typeof window !== 'undefined' && pendingImageLoads.size > 0) {
    printDebug(`♻️ [cyAdapter] Clearing ${pendingImageLoads.size} stale pendingImageLoads for new mount`);
    pendingImageLoads.clear();
  }
  const needsImageLoading = nodes.some(node => {
    const imageUrl = node.imageUrl;
    if (!imageUrl || imageUrl === "unspecified" || imageUrl.startsWith('data:')) {
      return false;
    }
    const cacheKey = `${graph.mapName || ''}:${imageUrl}`;
    return !imageCache.has(cacheKey);
  });

  const cdnBaseUrlOverride = graph.cdnBaseUrl;

  if (needsImageLoading) {
    printDebug(`⏳ [cyAdapter] Some images need loading, mounting with placeholders first...`);
    
    const elements = buildElementsFromDomain(graph, { mode, onImageLoaded, forceImageLoad: true, cdnBaseUrlOverride });
    printDebug(`🚀 [cyAdapter] Mounting cytoscape with image loading enabled`);
    
    cy = cytoscape({
      container,
      style: styles,
      elements,
      selectionType: mode === 'editing' ? "additive" : "single",
      pixelRatio: 1,
      motionBlur: true,
      textureOnViewport: false,
      layout: { name: 'preset' }
    });

    const detachAppearAnimation = installAppearOnAdd(cy, { 
      skipInitial: true,
      onlyWhenFlag: 'isNewlyCreated'
    });

    attachOverlayManager(cy);
// Kill any queued animations that were scheduled pre-attach
try { cy.$('node.edge-note-count, node.edge-unseen, node.note-count, node.unseen').stop(true, true); } catch {}

    try { 
      cy.on('destroy', () => { 
        try { 
          unsubscribePlaceholder(); 
          detachAppearAnimation?.();
          detachOverlayManager(cy);
        } catch { /* noop */ } 
      }); 
    } catch { /* noop */ }

    currentActiveCy = cy;
    
    if (pendingNodeImageUpdates.length) {
      printDebug(`📦 [cyAdapter] Applying ${pendingNodeImageUpdates.length} queued image updates after mount`);
      pendingNodeImageUpdates.splice(0).forEach(({ nodeId, imageUrl }) => {
        onImageLoaded(nodeId, imageUrl);
      });
    }
    
    return cy;
  } else {
    printDebug(`✅ [cyAdapter] All images are cached, mounting with cached images...`);
    
    const elements = buildElementsFromDomain(graph, { mode, onImageLoaded, forceImageLoad: false, cdnBaseUrlOverride });
    printDebug(`🚀 [cyAdapter] Mounting cytoscape with cached images`);
    
    cy = cytoscape({
      container,
      style: styles,
      elements,
      selectionType: mode === 'editing' ? "additive" : "single",
      pixelRatio: 1,
      motionBlur: true,
      textureOnViewport: false,
      layout: { name: 'preset' }
    });

    const detachAppearAnimation = installAppearOnAdd(cy, { 
      skipInitial: true,
      onlyWhenFlag: 'isNewlyCreated'
    });
    
    attachOverlayManager(cy);
// Kill any queued animations that were scheduled pre-attach
try { cy.$('node.edge-note-count, node.edge-unseen, node.note-count, node.unseen').stop(true, true); } catch {}

    try { 
      cy.on('destroy', () => { 
        try { 
          unsubscribePlaceholder(); 
          detachAppearAnimation?.();
          detachOverlayManager(cy);
        } catch { /* noop */ } 
      }); 
    } catch { /* noop */ }

    currentActiveCy = cy;

    if (pendingNodeImageUpdates.length) {
      printDebug(`📦 [cyAdapter] Applying ${pendingNodeImageUpdates.length} queued image updates after mount (cached path)`);
      pendingNodeImageUpdates.splice(0).forEach(({ nodeId, imageUrl }) => {
        onImageLoaded(nodeId, imageUrl);
      });
    }
    
    return cy;
  }
}

// Replace elements with a fresh build from the domain state
export function syncElements(cy, graph, options = {}) {
  const existingNodeIds = new Set(cy.nodes('.entry-parent').map(n => n.id()));
  
  const onImageLoaded = (nodeId, imageUrl) => {
    if (!cy || cy.destroyed()) return;
    if (nodeId && !nodeId.endsWith('__entry')) {
      const possibleChild = `${nodeId}__entry`;
      if (cy.getElementById(possibleChild).length > 0) nodeId = possibleChild;
    }
    const el = cy.getElementById(nodeId);
    if (el && el.length > 0) {
      el.data('imageUrl', imageUrl);
      cy.style().update();
    }
  };

  const { mode = 'editing' } = options;

  const newElements = buildElementsFromDomain(
    graph,
    { ...options, onImageLoaded, forceImageLoad: false, cdnBaseUrlOverride: graph.cdnBaseUrl }
  );

  printDebug(`🔄 [cyAdapter] Syncing elements`);

  const currentZoom = cy.zoom();
  const currentPan = cy.pan();
  
  // Build position map and do structural comparison in a single pass
  const currentPositions = {};
  const currentNodeIds = [];
  const currentEdgeIds = [];
  
  cy.nodes().forEach(node => {
    currentPositions[node.id()] = node.position();
    // Exclude overlay/UI nodes and background node from structural comparison
    if (!node.hasClass('note-count') && !node.hasClass('edge-note-count') && 
        !node.hasClass('unseen') && !node.hasClass('edge-unseen') &&
        node.id() !== '__background_image_node__') {
      currentNodeIds.push(node.id());
    }
  });
  
  cy.edges().forEach(edge => {
    currentEdgeIds.push(edge.id());
  });
  
  currentNodeIds.sort();
  currentEdgeIds.sort();
  
  const newNodeIds = [];
  const newEdgeIds = [];
  newElements.forEach(e => {
    if (e.group === 'nodes') newNodeIds.push(e.data.id);
    else if (e.group === 'edges') newEdgeIds.push(e.data.id);
  });
  newNodeIds.sort();
  newEdgeIds.sort();
  
  const nodesChanged = JSON.stringify(currentNodeIds) !== JSON.stringify(newNodeIds);
  const edgesChanged = JSON.stringify(currentEdgeIds) !== JSON.stringify(newEdgeIds);

  if (!nodesChanged && !edgesChanged) {
    newElements.forEach(newEl => {
      if (newEl.group === 'nodes') {
        const existingNode = cy.getElementById(newEl.data.id);
        if (existingNode.length > 0) existingNode.data(newEl.data);
      } else if (newEl.group === 'edges') {
        const existingEdge = cy.getElementById(newEl.data.id);
        if (existingEdge.length > 0) existingEdge.data(newEl.data);
      }
    });
  } else {
    const newNodeIds = new Set();
    newElements.filter(e => e.group === 'nodes' && e.data.id.endsWith('__entry')).forEach(el => {
      const parentId = el.data.parent;
      if (parentId && !existingNodeIds.has(parentId)) {
        newNodeIds.add(parentId);
      }
    });
    
    const modifiedElements = newElements.map(el => {
      if (el.group === 'nodes' && el.data.id.endsWith('__entry')) {
        const parentId = el.data.parent;
        if (parentId && newNodeIds.has(parentId)) {
          return {
            ...el,
            classes: el.classes ? `${el.classes} node-entering` : 'entry node-entering',
            data: { ...el.data, isNewlyCreated: true }
          };
        }
      }
      return el;
    });

    cy.json({ elements: modifiedElements });

    cy.nodes().forEach(node => {
      // Skip background node - it manages its own position
      if (node.id() === '__background_image_node__') return;
      
      const savedPosition = currentPositions[node.id()];
      if (savedPosition) node.position(savedPosition);
    });
    cy.zoom(currentZoom);
    cy.pan(currentPan);

    setTimeout(() => {
      newNodeIds.forEach(parentId => {
        const entryNode = cy.getElementById(`${parentId}__entry`);
        if (entryNode.length > 0) {
          printDebug(`🎬 [cyAdapter] Triggering CSS animation for: ${entryNode.id()}`);
          entryNode.removeClass('node-entering');
          setTimeout(() => {
            entryNode.data('isNewlyCreated', null);
            printDebug(`✅ [cyAdapter] CSS animation complete for: ${entryNode.id()}`);
          }, 600);
        }
      });
    }, 50);
  }

  // Set grabbable state and ensure entry children in a single pass
  const expectedParentGrabbable = mode === 'editing';
  const parentsNeedingChildren = [];
  
  cy.nodes().forEach(n => {
    if (n.hasClass('entry-parent')) {
      if (expectedParentGrabbable) n.grabify(); 
      else n.ungrabify();
      
      // Check if this parent needs an entry child
      const parentId = n.id();
      const entryChildId = `${parentId}__entry`;
      if (cy.getElementById(entryChildId).empty()) {
        parentsNeedingChildren.push({ parent: n, parentId, entryChildId });
      }
    } else {
      n.ungrabify();
    }
  });

  // Add missing entry children in batch
  if (parentsNeedingChildren.length > 0) {
    const newEntryNodes = parentsNeedingChildren.map(({ parent, parentId, entryChildId }) => ({
      group: 'nodes',
      data: {
        id: entryChildId,
        parent: parentId,
        label: parent.data('label') || '',
        size: parent.data('size') || 'regular',
        color: parent.data('color') || 'gray'
      },
      position: parent.position(),
      selectable: false,
      grabbable: false,
      classes: 'entry'
    }));
    cy.add(newEntryNodes);
  }

  try {
    const g = deserializeGraph(graph);
    const mapName = g.mapName || 'default_map';
    const effectiveCdn = graph.cdnBaseUrl || getCdnBaseUrl();

    if (!effectiveCdn) {
      printDebug(`⚠️ [cyAdapter] syncElements: no effective CDN base URL; deferring image loads`);
    } else {
      g.nodes.forEach(n => {
        const orig = n.imageUrl;
        if (!orig || orig === 'unspecified' || typeof orig !== 'string') return;
        if (orig.startsWith('data:')) return;

        const loadKey = `${mapName}:${orig}`;
        if (imageCache.has(loadKey)) return;
        if (pendingImageLoads.has(loadKey)) {
          printDebug(`⏳ [cyAdapter] syncElements: image already loading ${orig}`);
          return;
        }

        pendingImageLoads.add(loadKey);
        printDebug(`🔄 [cyAdapter] syncElements: starting deferred image load for ${orig}`);

        const entryChildId = `${n.id}__entry`;

        loadImageWithFallback(orig, mapName, effectiveCdn)
          .then(async (dataUrl) => {
            pendingImageLoads.delete(loadKey);
            if (!dataUrl) return;

            let finalUrl = dataUrl;
            if (
              GRAYSCALE_IMAGES &&
              typeof dataUrl === 'string' &&
              !dataUrl.includes('data:image/svg+xml') &&
              (dataUrl.startsWith('data:image/png;') ||
               dataUrl.startsWith('data:image/jpeg;') ||
               dataUrl.startsWith('data:image/jpg;') ||
               dataUrl.startsWith('data:image/webp;'))
            ) {
              try {
                finalUrl = await preprocessImageToGrayscale(dataUrl, orig);
              } catch {
                finalUrl = dataUrl;
              }
            }

            if (cy && !cy.destroyed()) {
              onImageLoaded(entryChildId, finalUrl);
            } else {
              pendingNodeImageUpdates.push({ nodeId: entryChildId, imageUrl: finalUrl });
            }
          })
          .catch(err => {
            pendingImageLoads.delete(loadKey);
            console.warn(`❌ [cyAdapter] syncElements: failed to load image ${orig}`, err);
          });
      });
    }
  } catch (e) {
    printDebug(`⚠️ [cyAdapter] syncElements: deferred image bootstrapping failed: ${e?.message || e}`);
  }

  refreshOverlayPositions(cy);

  return cy;
}

export function wireEvents(cy, handlers = {}, mode = 'editing') {
  printDebug(`🔌 [cyAdapter] Wiring events (parent-only) mode=${mode}`);
  const { onNodeSelectionChange, onEdgeSelectionChange, onNodeClick, onEdgeClick, onNodeDoubleClick, onEdgeDoubleClick, onBackgroundClick, onNodeMove } = handlers;

  const syncParentStateToChild = (parent) => {
    const parentId = parent.id();
    const entryChildId = `${parentId}__entry`;
    const child = cy.getElementById(entryChildId);
    if (child.empty()) return;
    if (parent.selected()) child.addClass('parent-selected'); else child.removeClass('parent-selected');
    if (parent.grabbed() || parent.active()) child.addClass('parent-active'); else child.removeClass('parent-active');
  };

  cy.nodes('.entry-parent').forEach(syncParentStateToChild);

  cy.on('select unselect', 'node.entry-parent', (evt) => {
    const parent = evt.target; 
    syncParentStateToChild(parent);

    printDebug(`🎯 ${evt.type} event: ${parent.id()}, search in progress: ${isSearchInProgress()}, current search IDs: [${getCurrentSearchIds().join(', ')}]`);

    if (evt.type === 'unselect') {
      printDebug(`❌ UNSELECT EVENT: ${parent.id()}`);
      printDebug(`❌ Stack trace:`, new Error().stack);
      printDebug(`❌ Search in progress: ${isSearchInProgress()}`);
      printDebug(`❌ Current search IDs: [${getCurrentSearchIds().join(', ')}]`);
    }

    if (evt.type === 'select' && !isSearchInProgress()) {
      setTimeout(() => {
        const selectedNodes = cy.$('node.entry-parent:selected');
        const isSearchRelatedSelection = selectedNodes.some(n => isCurrentSearchSelection(n.id()));
        
        printDebug(`🧹 Selection check: search-related=${isSearchRelatedSelection}`);
        
        if (!isSearchRelatedSelection) {
          printDebug(`🧹 CLEARING search highlights - non-search selection detected`);
          cy.elements('.search-glow').removeClass('search-glow');
        } else {
          printDebug(`🧹 NOT clearing search highlights - maintaining search selection`);
        }
      }, 10);
    }

    if (onNodeSelectionChange) {
      const ids = cy.$('node.entry-parent:selected').map(n => n.id());
      printDebug(`📊 Node selection changed to: (${ids.length}) [${ids.join(', ')}]`);
      onNodeSelectionChange(ids);
    }
  });

  cy.on('select unselect', 'edge', (evt) => {
    if (evt.type === 'select' && !evt.target.hasClass('search-glow')) {
      cy.elements('.search-glow').removeClass('search-glow');
    }
    if (onEdgeSelectionChange) onEdgeSelectionChange(cy.$('edge:selected').map(e => e.id()));
  });

  // Drag state -> also flag dragging so updateOverlays() only repositions
  cy.on('grab free drag', 'node.entry-parent', (evt) => {
    syncParentStateToChild(evt.target);
    if (evt.type === 'grab' || evt.type === 'drag') cy.scratch('_overlay_dragging', true);
    if (evt.type === 'free') cy.scratch('_overlay_dragging', false);
  });

  if (mode === 'playing') {
    cy.on('select', (evt) => {
      if (isSearchInProgress()) {
        printDebug(`🎮 Playing mode: ignoring select event during search for ${evt.target.id()}`);
        return;
      }
      if (evt.target.isNode() || evt.target.isEdge()) {
        const selected = evt.target; 
        setTimeout(() => { 
          cy.elements().not(selected).unselect(); 
        }, 0);
      }
    });
  }

  cy.on('tap', 'node.entry-parent', (evt) => {
    const nodeId = evt.target.id();
    if (mode === 'playing') {
      if (onNodeClick) onNodeClick(nodeId, 'node');
      const node = evt.target;
      const wasSelected = node.selected();
      setTimeout(() => {
        if (wasSelected) node.unselect();
        else {
          cy.elements().unselect();
          node.select();
        }
      }, 0);
      return;
    }
    if (onNodeClick) onNodeClick(evt.target.id(), 'node');
  });

  cy.on('tap', 'edge', (evt) => {
    if (mode === 'playing') {
      const e = evt.target; const was = e.selected();
      setTimeout(() => { if (was) e.unselect(); else if (onEdgeClick) onEdgeClick(e.id(), 'edge'); }, 0); 
      return;
    }
    if (onEdgeClick) onEdgeClick(evt.target.id(), 'edge');
  });
  
  cy.on('tap', (evt) => { 
    if (evt.target === cy) { 
      cy.elements().unselect(); 
      cy.elements('.search-glow').removeClass('search-glow');
      if (onBackgroundClick) onBackgroundClick(); 
    } 
  });

  cy.on('dbltap', 'node.entry-parent', (evt) => { if (mode !== 'editing') return; if (onNodeDoubleClick) onNodeDoubleClick(evt.target.id()); });
  cy.on('dbltap', 'edge', (evt) => { if (mode !== 'editing') return; if (onEdgeDoubleClick) onEdgeDoubleClick(evt.target.id()); });

  // Drag end updates position (only parents are draggable)
  cy.on('dragfree', 'node.entry-parent', (evt) => {
    syncParentStateToChild(evt.target);
    if (onNodeMove) { const { x, y } = evt.target.position(); onNodeMove(evt.target.id(), { x, y }); }
    refreshOverlayPositions(cy);
  });

  const container = cy.container();

  function handleCameraUpdate(source) {
    printDebug(`Camera update triggered by: ${source}`);
  }

  function mouseupHandler() { handleCameraUpdate('mouseup'); }
  container.addEventListener('mouseup', mouseupHandler);

  let wheelTimer = null;
  function debouncedWheelHandler() {
    if (wheelTimer) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      handleCameraUpdate('wheel');
      wheelTimer = null;
    }, 200);
  }
  container.addEventListener('wheel', debouncedWheelHandler);

  function touchEndHandler() { handleCameraUpdate('touchend'); }
  container.addEventListener('touchend', touchEndHandler);

  let touchMoveTimer = null;
  function debouncedTouchMoveHandler() {
    if (touchMoveTimer) clearTimeout(touchMoveTimer);
    touchMoveTimer = setTimeout(() => {
      handleCameraUpdate('touchmove');
      touchMoveTimer = null;
    }, 120);
  }
  container.addEventListener('touchmove', debouncedTouchMoveHandler);

  cy.on('mouseover', 'node.entry-parent, edge', (evt) => { evt.cy.container().style.cursor = 'pointer'; });
  cy.on('mouseout', 'node.entry-parent, edge', (evt) => { evt.cy.container().style.cursor = 'default'; });

  return () => {
    printDebug('🧹 [cyAdapter] Removing event listeners');
    cy.removeListener('*');
    container.removeEventListener('mouseup', mouseupHandler);
    container.removeEventListener('wheel', debouncedWheelHandler);
    container.removeEventListener('touchend', touchEndHandler);
    container.removeEventListener('touchmove', debouncedTouchMoveHandler);
    if (wheelTimer) clearTimeout(wheelTimer);
    if (touchMoveTimer) clearTimeout(touchMoveTimer);
  };
}

export function clearGrayscaleCache() {
  const entriesBeforeClear = grayscaleCache.size;
  const pendingBeforeClear = pendingConversions.size;
  
  grayscaleCache.clear();
  pendingConversions.clear();
  
  printDebug(`🧹 [cyAdapter] Cleared grayscale cache: ${entriesBeforeClear} entries, ${pendingBeforeClear} pending conversions`);
  
  try { 
    localStorage.removeItem(GRAYSCALE_CACHE_KEY);
    printDebug(`✅ [cyAdapter] Removed grayscale cache from localStorage`);
  } catch (e) { 
    console.warn('Failed to clear grayscale cache from localStorage:', e); 
  }
}

// Force immediate image update for a specific node
export async function forceNodeImageUpdate(nodeId, imagePath, mapName, cdnBaseUrl, immediateImageUrl = null) {
  printDebug(`🔄 [cyAdapter] Forcing image update for node ${nodeId} with path: ${imagePath}`);
  
  if (!currentActiveCy || currentActiveCy.destroyed()) {
    printDebug(`⚠️ [cyAdapter] No active Cytoscape instance, cannot update node image`);
    return false;
  }

  const node = currentActiveCy.getElementById(nodeId);
  if (!node || node.length === 0) {
    printDebug(`⚠️ [cyAdapter] Node ${nodeId} not found in active Cytoscape instance`);
    return false;
  }

  try {
    let imageUrl;
    
    if (immediateImageUrl) {
      printDebug(`⚡ [cyAdapter] Using immediate image URL for node ${nodeId}`);
      imageUrl = immediateImageUrl;
    } else {
      imageUrl = await loadImageWithFallback(imagePath, mapName, cdnBaseUrl);
      printDebug(`✅ [cyAdapter] Loaded image for immediate update: ${imageUrl.substring(0, 50)}...`);
    }
    
    let finalImageUrl = imageUrl;
    if (GRAYSCALE_IMAGES && !imageUrl.includes('data:image/svg+xml')) {
      finalImageUrl = await preprocessImageToGrayscale(imageUrl, imagePath);
      printDebug(`🎨 [cyAdapter] Applied grayscale for immediate update`);
    }
    
    node.data('imageUrl', finalImageUrl);
    currentActiveCy.style().update();
    printDebug(`✅ [cyAdapter] Successfully updated node ${nodeId} image immediately`);
    
    return true;
  } catch (error) {
    printDebug(`❌ [cyAdapter] Failed to force update node ${nodeId} image:`, error);
    return false;
  }
}

export function debugPrintEntireGraph(cy) {
  if (!cy) {
    console.warn("No Cytoscape instance provided.");
    return;
  }
  const nodes = cy.nodes().map(n => ({
    id: n.id(),
    classes: n.classes(),
    position: n.position(),
    data: n.data()
  }));
  const edges = cy.edges().map(e => ({
    id: e.id(),
    source: e.source().id(),
    target: e.target().id(),
    classes: e.classes(),
    data: e.data()
  }));
  console.log("Cytoscape Nodes:", nodes);
  console.log("Cytoscape Edges:", edges);
}
