// src/graph/cyAdapter.js
import cytoscape from "cytoscape";
import cytoscapeStyles from "../cytoscapeStyles.js";
import { deserializeGraph } from "./ops.js";
import { TEST_ICON_SVG } from "../constants/testAssets.js";
import { GRAYSCALE_IMAGES } from "../config/features.js";
import { convertImageToGrayscale } from "../utils/grayscaleUtils.js";
import { loadImageWithFallback, getCdnBaseUrl, imageCache } from "../utils/imageLoader.js";
import { printDebug } from "../utils/debug.js"; // printWarn

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

  // Process nodes - use cache/CDN/fallback system, then apply grayscale if enabled
  const nodes = g.nodes.map(n => {
    let imageUrl = n.imageUrl;
    
    // Handle "unspecified" or missing image URLs
    if (!imageUrl || imageUrl === "unspecified") {
      imageUrl = TEST_ICON_SVG;
    }    // If not a data URL and not the test SVG, check if we need to use the loader system
    else if (imageUrl !== TEST_ICON_SVG && !imageUrl.startsWith('data:')) {
      printDebug(`🔍 [cyAdapter] Processing non-data-URL image: ${imageUrl}, forceImageLoad: ${forceImageLoad}`);
      
      // First check if we have it in cache synchronously
      const cacheKey = `${g.mapName || ''}:${imageUrl}`;
      if (imageCache.has(cacheKey)) {
        // Use cached version
        imageUrl = imageCache.get(cacheKey);
        printDebug(`✅ [cyAdapter] Using cached image for: ${n.imageUrl}`);
        printDebug(`🔍 [cyAdapter] Cached imageUrl is: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null/undefined'}`);
      } else if (forceImageLoad) {
        // Only trigger loading if explicitly requested (e.g., on map load, not on node moves)
        const loadKey = `${g.mapName || ''}:${imageUrl}`;
        if (!pendingImageLoads.has(loadKey)) {
          pendingImageLoads.add(loadKey);
          printDebug(`🔄 [cyAdapter] Starting image load for: ${imageUrl}`);
          
          // Use resolved CDN base URL (from override / graph / persisted) to avoid race with localStorage
            if (effectiveCdnBaseUrl) {
            loadImageWithFallback(imageUrl, g.mapName || '', effectiveCdnBaseUrl).then(loadedImageUrl => {
              pendingImageLoads.delete(loadKey);
              printDebug(`✅ [cyAdapter] Image loaded successfully for ${imageUrl}, got data URL of length: ${loadedImageUrl?.length || 0}`);
              
              // Immediately show the original loaded image (do NOT wait for grayscale)
              if (onImageLoaded) {
                onImageLoaded(n.id, loadedImageUrl);
              }
              
              // Apply grayscale afterwards (background) if enabled and real raster image
              if (GRAYSCALE_IMAGES && loadedImageUrl && 
                  (loadedImageUrl.startsWith('data:image/png;') || 
                   loadedImageUrl.startsWith('data:image/jpeg;') || 
                   loadedImageUrl.startsWith('data:image/jpg;') || 
                   loadedImageUrl.startsWith('data:image/webp;'))) {
                printDebug(`🎨 [cyAdapter] Starting grayscale (post-display) for: ${imageUrl}`);
                preprocessImageToGrayscale(loadedImageUrl, imageUrl).then(grayscaleUrl => {
                  printDebug(`✅ [cyAdapter] Grayscale conversion complete for: ${imageUrl}`);
                  if (onImageLoaded) {
                    onImageLoaded(n.id, grayscaleUrl);
                  }
                }).catch(error => {
                  console.warn(`❌ [cyAdapter] Grayscale conversion failed for: ${imageUrl}`, error);
                });
              }
            }).catch(error => {
              pendingImageLoads.delete(loadKey);
              console.warn(`❌ [cyAdapter] Failed to load image: ${imageUrl}`, error);
            });
          } else {
            printDebug(`⚠️ [cyAdapter] No effective CDN base URL available during load for '${imageUrl}'`);
          }
        } else {
          printDebug(`⏳ [cyAdapter] Image already loading: ${imageUrl}`);
        }
        
        // Use test icon as placeholder while loading
        imageUrl = TEST_ICON_SVG;
      } else {
        // Don't trigger loading, use test icon as placeholder
        printDebug(`🔒 [cyAdapter] Skipping image load (not forced): ${imageUrl}`);
        imageUrl = TEST_ICON_SVG;
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
    
    const nodeData = {
      group: "nodes",
      data: {
        id: n.id,
        label: n.title ?? "",
        color: n.color ?? "gray",
        size: n.size ?? "regular",
        imageUrl: imageUrl,
        originalImageUrl: n.imageUrl // Store original filename for comparison
      },
      position: { x: n.x, y: n.y },
      selectable: true,
      grabbable: mode === 'editing' // Only grabbable in editing mode
    };
    
    //// printDebug(`🎯 [cyAdapter] Creating node "${n.id}" with imageUrl: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null/undefined'}`);
    
    return nodeData;
  });

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
  
  // Create image update callback aware of active instance
  const onImageLoaded = (nodeId, imageUrl) => {
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
      printDebug(`✅ [cyAdapter] Updated node ${nodeId} image on active instance`);
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
      // wheelSensitivity: 0.2,
      pixelRatio: 1,
      layout: { name: 'preset' }
    });
  
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
      // wheelSensitivity: 0.2,
      pixelRatio: 1,
      layout: { name: 'preset' }
    });

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
  // Create image update callback
  const onImageLoaded = (nodeId, imageUrl) => {
    if (cy && cy.getElementById(nodeId).length > 0) {
      cy.getElementById(nodeId).data('imageUrl', imageUrl);
      cy.style().update();
    }
  };
  
  // Build elements WITHOUT forcing image load (sync path) but pass override to allow mid-session CDN changes
  const newElements = buildElementsFromDomain(graph, { ...options, onImageLoaded, forceImageLoad: false, cdnBaseUrlOverride: graph.cdnBaseUrl });
  printDebug(`🔄 [cyAdapter] Syncing elements without forcing image loads`);
  
  // Save current camera state to restore later
  const currentZoom = cy.zoom();
  const currentPan = cy.pan();
  
  // Get current positions to preserve them
  const currentPositions = {};
  cy.nodes().forEach(node => {
    currentPositions[node.id()] = node.position();
  });
  
  // Check if we really need to update by comparing element counts and IDs
  const currentNodes = cy.nodes().map(n => n.id()).sort();
  const currentEdges = cy.edges().map(e => e.id()).sort();
  const newNodes = newElements.filter(e => e.group === 'nodes').map(e => e.data.id).sort();
  const newEdges = newElements.filter(e => e.group === 'edges').map(e => e.data.id).sort();
  
  const nodesChanged = JSON.stringify(currentNodes) !== JSON.stringify(newNodes);
  const edgesChanged = JSON.stringify(currentEdges) !== JSON.stringify(newEdges);
  
  if (!nodesChanged && !edgesChanged) {
    // Only update data properties without full resync if structure hasn't changed
    newElements.forEach(newEl => {
      if (newEl.group === 'nodes') {
        const existingNode = cy.getElementById(newEl.data.id);
        if (existingNode.length > 0) {
          existingNode.data(newEl.data);
        }
      } else if (newEl.group === 'edges') {
        const existingEdge = cy.getElementById(newEl.data.id);
        if (existingEdge.length > 0) {
          existingEdge.data(newEl.data);
        }
      }
    });
  } else {
    // Full resync needed when structure changes
    cy.json({ elements: newElements });
    
    // Restore positions after sync
    cy.nodes().forEach(node => {
      const savedPosition = currentPositions[node.id()];
      if (savedPosition) {
        node.position(savedPosition);
      }
    });
    
    // Restore camera state after full resync
    cy.zoom(currentZoom);
    cy.pan(currentPan);
  }
  
  return cy;
}

// Wire common events; handlers are optional (restored)
export function wireEvents(cy, handlers = {}, mode = 'editing') {
  printDebug(`🔌 [cyAdapter] Wiring events in mode: ${mode}`);
  
  const {
    onNodeSelectionChange,
    onEdgeSelectionChange,
    onNodeClick,
    onEdgeClick,
    onNodeDoubleClick,
    onEdgeDoubleClick,
    onBackgroundClick,
    onNodeMove,
    onZoomChange,
    onCameraMove
  } = handlers;

  printDebug(`🔌 [cyAdapter] Available handlers: ${Object.keys(handlers).join(', ')}`);

  cy.on("select unselect", "node", () => {
    if (onNodeSelectionChange) {
      const ids = cy.$("node:selected").map(n => n.id());
      onNodeSelectionChange(ids);
    }
  });

  cy.on("select unselect", "edge", () => {
    if (onEdgeSelectionChange) {
      const ids = cy.$("edge:selected").map(e => e.id());
      onEdgeSelectionChange(ids);
    }
  });

  if (mode === 'playing') {
    cy.on('select', (evt) => {
      if (evt.target.isNode() || evt.target.isEdge()) {
        const selectedElement = evt.target;
        setTimeout(() => {
          cy.elements().not(selectedElement).unselect();
        }, 0);
      }
    });
  }

  cy.on("tap", "node", (evt) => {
    if (mode === 'playing') {
      const clickedNode = evt.target;
      const wasSelected = clickedNode.selected();
      setTimeout(() => {
        if (wasSelected) {
          clickedNode.unselect();
          return;
        } else {
          if (onNodeClick) onNodeClick(evt.target.id(), "node");
        }
      }, 0);
      return;
    }
    if (onNodeClick) onNodeClick(evt.target.id(), "node");
  });

  cy.on("tap", "edge", (evt) => {
    if (mode === 'playing') {
      const clickedEdge = evt.target;
      const wasSelected = clickedEdge.selected();
      setTimeout(() => {
        if (wasSelected) {
          clickedEdge.unselect();
          return;
        } else {
          if (onEdgeClick) onEdgeClick(evt.target.id(), "edge");
        }
      }, 0);
      return;
    }
    if (onEdgeClick) onEdgeClick(evt.target.id(), "edge");
  });

  cy.on("tap", (evt) => {
    if (evt.target === cy) {
      cy.elements().unselect();
      if (onBackgroundClick) onBackgroundClick();
    }
  });

  cy.on("dbltap", "node", (evt) => { if (onNodeDoubleClick) onNodeDoubleClick(evt.target.id()); });
  cy.on("dbltap", "edge", (evt) => { if (onEdgeDoubleClick) onEdgeDoubleClick(evt.target.id()); });
  cy.on("dragfree", "node", (evt) => { if (onNodeMove) { const n = evt.target; const { x, y } = n.position(); onNodeMove(n.id(), { x, y }); } });
  
  // Add debugging for viewport events
  cy.on("viewport", () => { 
    const zoom = cy.zoom();
    const pan = cy.pan();
    printDebug(`🎥 [cyAdapter] Viewport event - zoom: ${zoom.toFixed(2)}, pan: (${Math.round(pan.x)}, ${Math.round(pan.y)})`);
    
    if (onZoomChange) {
      printDebug(`🎥 [cyAdapter] Calling onZoomChange with: ${zoom}`);
      onZoomChange(zoom);
    }
    
    if (onCameraMove) {
      printDebug(`🎥 [cyAdapter] Calling onCameraMove with: (${Math.round(pan.x)}, ${Math.round(pan.y)})`);
      onCameraMove({ x: pan.x, y: pan.y });
    }
  });
  cy.on("mouseover", "node, edge", (evt) => { evt.cy.container().style.cursor = "pointer"; });
  cy.on("mouseout", "node, edge", (evt) => { evt.cy.container().style.cursor = "default"; });

  return () => {
    printDebug("🧹 [cyAdapter] Removing event listeners");
    cy.off("select");
    cy.off("unselect");
    cy.off("tap");
    cy.off("dbltap");
    cy.off("dragfree");
    cy.off("viewport");
    cy.off("mouseover");
    cy.off("mouseout");
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
