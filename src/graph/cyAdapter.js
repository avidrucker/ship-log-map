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
 * - updateNoteCounts(cy, counts)
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

// Cache for grayscale images to avoid reprocessing
const GRAYSCALE_CACHE_KEY = 'shipLogGrayscaleCache';
const grayscaleCache = new Map();
const pendingConversions = new Set();
const BASE_NODE_HEIGHT = 175;

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
      // Save to localStorage when conversion completes
      saveGrayscaleCacheToStorage();
      return grayscaleUrl;
    })
    .catch(error => {
      console.warn('Failed to convert image to grayscale:', error);
      grayscaleCache.set(cacheKey, imageUrl); // Cache the original to avoid retrying
      pendingConversions.delete(imageUrl);
      // Save to localStorage even on failure to avoid retrying
      saveGrayscaleCacheToStorage();
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

// Convert domain graph -> Cytoscape elements (now synchronous with fallback)
export function buildElementsFromDomain(graph, options = {}) {
  const { mode = 'editing', onImageLoaded = null, forceImageLoad = false, cdnBaseUrlOverride = undefined } = options;
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
    }    // If not a data URL and not the test SVG, check if we need to use the loader system
    else if (imageUrl !== TEST_ICON_SVG && !imageUrl.startsWith('data:')) {
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
          // IMPORTANT: we must update the CHILD node ("id__entry") because that's where imageUrl lives.
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
      
      // Try to find grayscale version using original path first, then data URL
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
        data: { id: entryChildId, parent: parentId, label: n.title ?? '', color: n.color ?? 'gray', size: n.size ?? 'regular', imageUrl, originalImageUrl: n.imageUrl },
        position: { x: n.x, y: n.y },
        selectable: false,
        grabbable: false,
        classes: 'entry'
      }
    ];
  }).flat();

  // Process edges (unchanged)

  const edges = g.edges.map(e => ({
    group: "edges",
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      direction: e.direction ?? "forward"
    },
    selectable: true // Always selectable, but behavior differs by mode
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
      // Queue and also attempt to apply to active instance directly
      console.warn(`🔁 [cyAdapter] Received image for inactive/destroyed instance. Forwarding to active instance. node=${nodeId}`);
      pendingNodeImageUpdates.push({ nodeId, imageUrl });        if (currentActiveCy && !currentActiveCy.destroyed()) {
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
  // On every mount, clear any stale pendingImageLoads from previous (StrictMode) mount so loads can re-subscribe
  // (We keep cache entries; only the in-flight markers are reset.)
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
    return !imageCache.has(cacheKey); // Needs loading if not in cache
  });

  const cdnBaseUrlOverride = graph.cdnBaseUrl; // pass through (avoid race with localStorage persistence)

  if (needsImageLoading) {
    printDebug(`⏳ [cyAdapter] Some images need loading, mounting with placeholders first...`);
    
    // Mount with placeholders first for immediate display
    const elements = buildElementsFromDomain(graph, { mode, onImageLoaded, forceImageLoad: true, cdnBaseUrlOverride });
    printDebug(`🚀 [cyAdapter] Mounting cytoscape with image loading enabled`);
    
    cy = cytoscape({
      container,
      style: styles,
      elements,
      selectionType: mode === 'editing' ? "additive" : "single",
      // wheelSensitivity: 0.5,
      pixelRatio: 1,
      layout: { name: 'preset' }
    });

    // Install appear animation for new nodes (skip initial render)
    const detachAppearAnimation = installAppearOnAdd(cy, { 
      skipInitial: true //,
      // onlyWhenFlag: 'isNewlyCreated' // Optional: only animate nodes marked as new
    });

    // Attach destroy listener for placeholder unsubscribe AND animation cleanup
    try { 
      cy.on('destroy', () => { 
        try { 
          unsubscribePlaceholder(); 
          detachAppearAnimation?.(); // Clean up animation listener
        } catch { /* noop */ } 
      }); 
    } catch { /* noop */ }

    currentActiveCy = cy; // mark active
    
    // Apply any queued image updates that completed before this active instance was ready
    if (pendingNodeImageUpdates.length) {
      printDebug(`📦 [cyAdapter] Applying ${pendingNodeImageUpdates.length} queued image updates after mount`);
      pendingNodeImageUpdates.splice(0).forEach(({ nodeId, imageUrl }) => {
        onImageLoaded(nodeId, imageUrl);
      });
    }
    
    return cy;
  } else {
    printDebug(`✅ [cyAdapter] All images are cached, mounting with cached images...`);
    
    // All images are cached, build with them directly
    const elements = buildElementsFromDomain(graph, { mode, onImageLoaded, forceImageLoad: false, cdnBaseUrlOverride });
    printDebug(`🚀 [cyAdapter] Mounting cytoscape with cached images`);
    
    cy = cytoscape({
      container,
      style: styles,
      elements,
      selectionType: mode === 'editing' ? "additive" : "single",
      // wheelSensitivity: 0.5,
      pixelRatio: 1,
      layout: { name: 'preset' }
    });
    // Install appear animation for new nodes (skip initial render)
    const detachAppearAnimation = installAppearOnAdd(cy, { 
      skipInitial: true,
      onlyWhenFlag: 'isNewlyCreated' // Optional: only animate nodes marked as new
    });
    
    try { 
      cy.on('destroy', () => { 
        try { 
          unsubscribePlaceholder(); 
          detachAppearAnimation?.(); // Clean up animation listener
        } catch { /* noop */ } 
      }); 
    } catch { /* noop */ }

    currentActiveCy = cy; // mark active

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
  // Track which nodes are new for animation
  const existingNodeIds = new Set(cy.nodes('.entry-parent').map(n => n.id()));
  
  // Local helper used by the deferred post-pass below
  const onImageLoaded = (nodeId, imageUrl) => {
    if (!cy || cy.destroyed()) return;
    // Make sure we're updating the child entry node
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

  // Build elements with placeholders (forceImageLoad: false) —
  // actual network loads will be handled by the post-pass we add below.
  const newElements = buildElementsFromDomain(
    graph,
    { ...options, onImageLoaded, forceImageLoad: false, cdnBaseUrlOverride: graph.cdnBaseUrl }
  );

  printDebug(`🔄 [cyAdapter] Syncing elements`);

// *** PRESERVE NOTE COUNT NODES BEFORE SYNC ***
  const noteCountNodes = [];
  cy.nodes('.note-count').forEach(node => {
    noteCountNodes.push({
      id: node.id(),
      data: { ...node.data() },
      position: { ...node.position() },
      classes: node.classes().join(' '),
      selected: node.selected(),
      hidden: node.hasClass('hidden')
    });
  });
  
  printDebug(`🔄 [cyAdapter] Preserved ${noteCountNodes.length} note count nodes before sync`);

  // Preserve camera & positions
  const currentZoom = cy.zoom();
  const currentPan = cy.pan();
  const currentPositions = {};
  cy.nodes().forEach(node => { currentPositions[node.id()] = node.position(); });

  const currentNodes = cy.nodes().filter(n => !n.hasClass('note-count')).map(n => n.id()).sort();
  const currentEdges = cy.edges().map(e => e.id()).sort();
  const newNodes = newElements.filter(e => e.group === 'nodes').map(e => e.data.id).sort();
  const newEdges = newElements.filter(e => e.group === 'edges').map(e => e.data.id).sort();
  const nodesChanged = JSON.stringify(currentNodes) !== JSON.stringify(newNodes);
  const edgesChanged = JSON.stringify(currentEdges) !== JSON.stringify(newEdges);

  if (!nodesChanged && !edgesChanged) {
    // Only data refresh
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
    // Full element set replace (but restore positions & camera)
    cy.json({ elements: newElements });
    cy.nodes().forEach(node => {
      const savedPosition = currentPositions[node.id()];
      if (savedPosition) node.position(savedPosition);
    });
    cy.zoom(currentZoom);
    cy.pan(currentPan);

    // *** IMPROVED: Mark newly created entry nodes for animation ***
    // Use a small delay to ensure DOM is ready
    setTimeout(() => {
      cy.nodes('.entry').forEach(entryNode => {
    const parentId = entryNode.data('parent');
    if (parentId && !existingNodeIds.has(parentId)) {
      // This is a new node - trigger animation directly
      printDebug(`🎬 [cyAdapter] Triggering animation for new entry node: ${entryNode.id()}`);
      
      // Mark as newly created for the appear.js system
      entryNode.data('isNewlyCreated', true);
      
      // Set initial height to 0 to prevent blip
      entryNode.style('height', 0);
      
      // Get the target height based on node size
      const nodeSize = entryNode.data('size') || 'regular';
      const NODE_SIZE_MAP = {
        'regular': 175,
        'double': 350, 
        'half': 87.5
      };
      const targetHeight = NODE_SIZE_MAP[nodeSize] || 175;
      
      // Animate to target height
      requestAnimationFrame(() => {
        entryNode.animation({
          style: { height: targetHeight },
          duration: 600,
          easing: 'ease-out'
        }).play().promise('complete').then(() => {
          // Remove the style override so CSS rules take over
          entryNode.removeStyle('height');
          entryNode.data('isNewlyCreated', null); // Clear flag
          printDebug(`✅ [cyAdapter] Animation complete for: ${entryNode.id()}`);
        });
      });
    }
  });
    }, 500);
  }

  // *** RESTORE NOTE COUNT NODES AFTER SYNC ***
  noteCountNodes.forEach(nodeData => {
    try {
      // Check if a note count node with this ID already exists
      if (cy.getElementById(nodeData.id).length === 0) {
        
        // FOR NODE NOTE COUNTS: Check if parent still exists
        if (nodeData.id.endsWith('__noteCount') && !nodeData.classes.includes('edge-note-count')) {
          const parentId = nodeData.data.parent;
          const parentExists = parentId && cy.getElementById(parentId).length > 0;
          
          if (!parentExists) {
            printDebug(`🧹 [cyAdapter] Skipping restoration of orphaned node note-count: ${nodeData.id} (parent ${parentId} no longer exists)`);
            return; // Skip this note count node
          }
        }
        
        // FOR EDGE NOTE COUNTS: Check if edge still exists  
        if (nodeData.classes.includes('edge-note-count')) {
          const edgeId = nodeData.data.edgeId;
          const edgeExists = edgeId && cy.getElementById(edgeId).length > 0;
          
          if (!edgeExists) {
            printDebug(`🧹 [cyAdapter] Skipping restoration of orphaned edge note-count: ${nodeData.id} (edge ${edgeId} no longer exists)`);
            return; // Skip this note count node
          }
        }
        
        // Only restore if parent/edge still exists
        const restoredNode = cy.add({
          group: 'nodes',
          data: nodeData.data,
          position: nodeData.position,
          classes: nodeData.classes
        });
        
        // Restore selection and visibility state
        if (nodeData.selected) {
          restoredNode.select();
        }
        if (nodeData.hidden) {
          restoredNode.addClass('hidden');
        }
        
        printDebug(`✅ [cyAdapter] Restored note count node: ${nodeData.id}`);
      }
    } catch (error) {
      console.warn(`Failed to restore note count node ${nodeData.id}:`, error);
    }
  });

  // *** CLEAN UP ANY REMAINING ORPHANED NOTE COUNTS ***
  // This handles edge cases where note counts might still be orphaned
  cy.nodes('.note-count').forEach(n => {
    let shouldRemove = false;
    
    // Check node note counts
    if (n.id().endsWith('__noteCount') && !n.hasClass('edge-note-count')) {
      const parent = n.parent();
      if (parent.length === 0 || !parent.hasClass('entry-parent')) {
        shouldRemove = true;
        printDebug(`🧹 [cyAdapter] Removing orphaned node note-count after sync: ${n.id()}`);
      }
    }
    
    // Check edge note counts
    if (n.hasClass('edge-note-count')) {
      const edgeId = n.data('edgeId');
      if (!edgeId || cy.getElementById(edgeId).length === 0) {
        shouldRemove = true;
        printDebug(`🧹 [cyAdapter] Removing orphaned edge note-count after sync: ${n.id()}`);
      }
    }
    
    if (shouldRemove) {
      cy.remove(n);
    }
  });

  // Enforce grabbable only on parents; children always ungrabbable
  const expectedParentGrabbable = mode === 'editing';
  cy.nodes().forEach(n => {
    if (n.hasClass('entry-parent')) {
      if (expectedParentGrabbable) n.grabify(); else n.ungrabify();
    } else {
      n.ungrabify();
    }
  });

  // Ensure each parent has an entry child
  cy.nodes('.entry-parent').forEach(parent => {
    const parentId = parent.id();
    const entryChildId = `${parentId}__entry`;
    if (cy.getElementById(entryChildId).empty()) {
      cy.add({
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
      });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // Deferred image bootstrapping (Fix A.2):
  // If we previously built with placeholders because cdnBaseUrl was unknown,
  // start exactly one load per missing image now that we (likely) have it.
  // ────────────────────────────────────────────────────────────────
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
        if (orig.startsWith('data:')) return; // already resolved/cached

        const loadKey = `${mapName}:${orig}`;
        if (imageCache.has(loadKey)) return;          // already cached
        if (pendingImageLoads.has(loadKey)) {         // already loading
          printDebug(`⏳ [cyAdapter] syncElements: image already loading ${orig}`);
          return;
        }

        // Mark in-flight and start the network load
        pendingImageLoads.add(loadKey);
        printDebug(`🔄 [cyAdapter] syncElements: starting deferred image load for ${orig}`);

        const entryChildId = `${n.id}__entry`;

        loadImageWithFallback(orig, mapName, effectiveCdn)
          .then(async (dataUrl) => {
            pendingImageLoads.delete(loadKey);
            if (!dataUrl) return;

            // Optional grayscale, mirroring mountCy behavior
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
              // If instance disappeared mid-load, queue for next active instance
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

  return cy;
}

export function wireEvents(cy, handlers = {}, mode = 'editing') {
  printDebug(`🔌 [cyAdapter] Wiring events (parent-only) mode=${mode}`);
  const { onNodeSelectionChange, onEdgeSelectionChange, onNodeClick, onEdgeClick, onNodeDoubleClick, onEdgeDoubleClick, onBackgroundClick, onNodeMove } = handlers; //onZoomChange, onCameraMove

  // Helper to sync selection/active classes from parent to entry child
  const syncParentStateToChild = (parent) => {
    const parentId = parent.id();
    const entryChildId = `${parentId}__entry`;
    const child = cy.getElementById(entryChildId);
    if (child.empty()) return;
    if (parent.selected()) child.addClass('parent-selected'); else child.removeClass('parent-selected');
    if (parent.grabbed() || parent.active()) child.addClass('parent-active'); else child.removeClass('parent-active');
  };

  // Initial pass
  cy.nodes('.entry-parent').forEach(syncParentStateToChild);

  // Selection events (parents only)
  cy.on('select unselect', 'node.entry-parent', (evt) => {
    const parent = evt.target; syncParentStateToChild(parent);
    if (onNodeSelectionChange) {
      const ids = cy.$('node.entry-parent:selected').map(n => n.id());
      onNodeSelectionChange(ids);
    }
  });
  cy.on('select unselect', 'edge', () => {
    if (onEdgeSelectionChange) onEdgeSelectionChange(cy.$('edge:selected').map(e => e.id()));
  });

  // Grab/drag state -> active styling
  cy.on('grab free drag', 'node.entry-parent', (evt) => {
    syncParentStateToChild(evt.target);
  });

  if (mode === 'playing') {
    cy.on('select', (evt) => {
      if (evt.target.isNode() || evt.target.isEdge()) {
        const selected = evt.target; setTimeout(() => { cy.elements().not(selected).unselect(); }, 0);
      }
    });
  }

  cy.on('tap', 'node.entry-parent', (evt) => {
    const nodeId = evt.target.id();
    
    if (mode === 'playing') {
      // Always call onNodeClick in playing mode - let App.jsx handle the logic
      if (onNodeClick) {
        onNodeClick(nodeId, 'node');
      }
      
      // Handle selection state explicitly in playing mode
      const node = evt.target;
      const wasSelected = node.selected();
      
      setTimeout(() => {
        if (wasSelected) {
          // If it was selected, unselect it
          node.unselect();
        } else {
          // If it wasn't selected, select it (but App.jsx will handle the note viewing)
          cy.elements().unselect(); // Clear other selections first
          node.select();
        }
      }, 0);
      
      return;
    }
    
    // In editing mode, just call onNodeClick normally
    if (onNodeClick) onNodeClick(evt.target.id(), 'node');
  });

  cy.on('tap', 'edge', (evt) => {
    if (mode === 'playing') {
      const e = evt.target; const was = e.selected();
      setTimeout(() => { if (was) e.unselect(); else if (onEdgeClick) onEdgeClick(e.id(), 'edge'); }, 0); return;
    }
    if (onEdgeClick) onEdgeClick(evt.target.id(), 'edge');
  });
  cy.on('tap', (evt) => { if (evt.target === cy) { cy.elements().unselect(); if (onBackgroundClick) onBackgroundClick(); } });

  cy.on('dbltap', 'node.entry-parent', (evt) => { if (mode !== 'editing') return; if (onNodeDoubleClick) onNodeDoubleClick(evt.target.id()); });
  cy.on('dbltap', 'edge', (evt) => { if (mode !== 'editing') return; if (onEdgeDoubleClick) onEdgeDoubleClick(evt.target.id()); });

  // Drag end updates position (only parents are draggable)
  cy.on('dragfree', 'node.entry-parent', (evt) => {
    syncParentStateToChild(evt.target);
    if (onNodeMove) { const { x, y } = evt.target.position(); onNodeMove(evt.target.id(), { x, y }); }
    
    // Update edge note-count positions immediately after drag
    // We need to get notes from somewhere - let's add it to the handlers
    if (handlers.notes) {
      updateNoteCounts(cy, handlers.notes);
    }
  });

  // Add mouseup, wheel, touchend, and touchmove listeners to trigger camera update only after pan/zoom ends
  const container = cy.container();

  function handleCameraUpdate(source) {
    printDebug(`Camera update triggered by: ${source}`);
    // if (handlers.onZoomChange) handlers.onZoomChange(cy.zoom());
    // if (handlers.onCameraMove) handlers.onCameraMove({ x: cy.pan().x, y: cy.pan().y });
  }

  function mouseupHandler() {
    handleCameraUpdate('mouseup');
  }
  container.addEventListener('mouseup', mouseupHandler);

  let wheelTimer = null;
  function debouncedWheelHandler() {
    if (wheelTimer) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      handleCameraUpdate('wheel');
      wheelTimer = null;
    }, 200); // 200ms debounce after last wheel event
  }
  container.addEventListener('wheel', debouncedWheelHandler);

  function touchEndHandler() {
    handleCameraUpdate('touchend');
  }
  container.addEventListener('touchend', touchEndHandler);

  let touchMoveTimer = null;
  function debouncedTouchMoveHandler() {
    if (touchMoveTimer) clearTimeout(touchMoveTimer);
    touchMoveTimer = setTimeout(() => {
      handleCameraUpdate('touchmove');
      touchMoveTimer = null;
    }, 120); // 120ms debounce after last touchmove
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

export function ensureNoteCountNodes(cy, notes, visible) {
  if (!cy) return; 
  if (cy._noteCountUpdating) return; 
  
  // Ensure cy is not destroyed before proceeding
  if (cy.destroyed()) return;
  
  cy._noteCountUpdating = true;
  
  try {

    // Clean up orphaned note-count nodes first (nodes whose parents no longer exist)
    cy.nodes('.note-count').forEach(n => {
      const isNodeNote = n.id().endsWith('__noteCount') && n.parent() && n.parent().length > 0 && n.parent().hasClass('entry-parent');
      const isEdgeNote = n.id().endsWith('__noteCount') && n.hasClass('edge-note-count');
      
      // For edge notes, check if the corresponding edge still exists
      if (isEdgeNote) {
        const edgeId = n.data('edgeId');
        if (edgeId && cy.getElementById(edgeId).length === 0) {
          printDebug(`🧹 [cyAdapter] Removing orphaned edge note-count for missing edge: ${edgeId}`);
          cy.remove(n);
          return;
        }
      }
      
      // Remove if it's neither a valid node note nor edge note
      if (!isNodeNote && !isEdgeNote) {
        printDebug(`🧹 [cyAdapter] Removing orphaned note-count node: ${n.id()}`);
        cy.remove(n);
      }
    });

    // Handle node note-counts (only create if count > 0)
    cy.nodes('.entry-parent').forEach(parent => {
      const id = parent.id();
      const size = parent.data('size') || 'regular';
      const count = Array.isArray(notes[id]) ? notes[id].length : 0;
      const noteId = `${id}__noteCount`;
      let noteNode = cy.getElementById(noteId);
      
      if (count > 0) {
        // Create or update node with notes
        if (noteNode.empty()) {
          noteNode = cy.add({ 
            group: 'nodes', 
            data: { id: noteId, parent: id, label: String(count), size }, 
            position: parent.position(), 
            selectable: false, 
            grabbable: false, 
            classes: 'note-count' 
          });
        } else {
          noteNode.data('label', String(count));
          noteNode.data('size', size);
        }
        if (visible) noteNode.removeClass('hidden'); 
        else noteNode.addClass('hidden');
      } else {
        // Remove node if no notes
        if (!noteNode.empty()) {
          cy.remove(noteNode);
        }
      }
    });

    // Handle edge note-counts (only create if count > 0)
    cy.edges().forEach(edge => {
      try {
        const id = edge.id();
        const count = Array.isArray(notes[id]) ? notes[id].length : 0;
        const noteId = `${id}__noteCount`;
        let noteNode = cy.getElementById(noteId);

        if (count > 0) {
          // Calculate midpoint position
          const sourceNode = edge.source();
          const targetNode = edge.target();
          
          // Skip if edge references non-existent nodes
          if (!sourceNode || !targetNode || sourceNode.length === 0 || targetNode.length === 0) {
            return;
          }
          
          const srcPos = sourceNode.position();
          const tgtPos = targetNode.position();
          const offsetY = -BASE_NODE_HEIGHT / 8;
          const midX = (srcPos.x + tgtPos.x) / 2;
          const midY = (srcPos.y + tgtPos.y) / 2 + offsetY;

          if (noteNode.empty()) {
            noteNode = cy.add({
              group: 'nodes',
              data: { 
                id: noteId, 
                edgeId: edge.id(),
                label: String(count), 
                size: 'small' 
              },
              position: { x: midX, y: midY },
              selectable: false,
              grabbable: false,
              classes: 'note-count edge-note-count'
            });
          } else {
            noteNode.data('label', String(count));
            noteNode.position({ x: midX, y: midY });
          }
          if (visible) noteNode.removeClass('hidden'); 
          else noteNode.addClass('hidden');
        } else {
          // Remove edge note-count if no notes
          if (!noteNode.empty()) {
            cy.remove(noteNode);
          }
        }
      } catch (error) {
        console.warn(`Failed to process edge note-count for edge ${edge.id()}:`, error);
      }
    });

    // Clean up orphaned note-count nodes
    cy.nodes('.note-count').forEach(n => {
      const isNodeNote = n.id().endsWith('__noteCount') && n.parent() && n.parent().hasClass('entry-parent');
      const isEdgeNote = n.id().endsWith('__noteCount') && n.hasClass('edge-note-count');
      if (!isNodeNote && !isEdgeNote) {
        cy.remove(n);
      }
    });
  } finally { 
    cy._noteCountUpdating = false; 
  }
}

export function updateEdgeCountNodePositions(cy) {
  // For each edge-note-count node, compute the midpoint of its edge
  const counters = cy.$('node.edge-note-count');
  counters.forEach(n => {
    const edgeId = n.data('edgeId');
    if (!edgeId) return;
    const e = cy.getElementById(edgeId);
    if (!e || e.empty()) return;

    const p1 = e.source().position();
    const p2 = e.target().position();
    const offsetY = -BASE_NODE_HEIGHT / 8;
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 + offsetY };

    n.position(mid);
  });
}

export function updateNoteCounts(cy, notes) {
  if (!cy || cy._noteCountUpdating) return;
  
  // Ensure cy is not destroyed before proceeding
  if (cy.destroyed()) return;
  
  // Update node note-counts
  cy.nodes('.note-count').forEach(n => {
    const parent = n.parent(); 
    if (!parent.empty()) { 
      const id = parent.id(); 
      const count = Array.isArray(notes[id]) ? notes[id].length : 0; 
      n.data('label', String(count)); 
      n.data('size', parent.data('size') || 'regular'); 
    }
  });
  
  // Update edge note-counts and their positions
  cy.nodes('.edge-note-count').forEach(n => {
    try {
      const edgeId = n.id().replace('__noteCount', '');
      const count = Array.isArray(notes[edgeId]) ? notes[edgeId].length : 0;
      n.data('label', String(count));
      
      // Recompute position in case edge moved
      const edge = cy.getElementById(edgeId);
      if (edge && edge.length) {
        const sourceNode = edge.source();
        const targetNode = edge.target();
        
        // Skip if edge references non-existent nodes
        if (!sourceNode || !targetNode || sourceNode.length === 0 || targetNode.length === 0) {
          return;
        }
        
        const srcPos = sourceNode.position();
        const tgtPos = targetNode.position();
        const offsetY = -BASE_NODE_HEIGHT / 8;
        const midX = (srcPos.x + tgtPos.x) / 2;
        const midY = (srcPos.y + tgtPos.y) / 2 + offsetY;
        n.position({ x: midX, y: midY });
      }
    } catch (error) {
      console.warn(`Failed to update edge note-count for node ${n.id()}:`, error);
    }
  });
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
// This is used when an image is imported and we want to see it immediately
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
    
    // If we have an immediate image URL (e.g., from fresh import), use it
    if (immediateImageUrl) {
      printDebug(`⚡ [cyAdapter] Using immediate image URL for node ${nodeId}`);
      imageUrl = immediateImageUrl;
    } else {
      // Otherwise, load from cache/CDN as usual
      imageUrl = await loadImageWithFallback(imagePath, mapName, cdnBaseUrl);
      printDebug(`✅ [cyAdapter] Loaded image for immediate update: ${imageUrl.substring(0, 50)}...`);
    }
    
    // Apply grayscale if enabled (but not for SVG placeholders)
    let finalImageUrl = imageUrl;
    if (GRAYSCALE_IMAGES && !imageUrl.includes('data:image/svg+xml')) {
      finalImageUrl = await preprocessImageToGrayscale(imageUrl, imagePath);
      printDebug(`🎨 [cyAdapter] Applied grayscale for immediate update`);
    }
    
    // Update the node immediately
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