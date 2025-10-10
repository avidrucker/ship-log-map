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
import { 
  preprocessImageToGrayscale, 
  getCachedGrayscaleImage, 
  shouldProcessForGrayscale,
  clearGrayscaleCache as clearGrayscaleCacheUtil
} from "../utils/grayscaleUtils.js";
import { getCdnBaseUrl } from "../utils/cdnHelpers.js";
import { loadImageWithFallback, imageCache, getDefaultPlaceholderSvg, ensureDefaultPlaceholderLoaded, onDefaultPlaceholderLoaded } from "../utils/imageLoader.js";
import { printDebug } from "../utils/debug.js"; // printWarn
import { installAppearOnAdd } from '../anim/appear.js';
import { isSearchInProgress, isCurrentSearchSelection, getCurrentSearchIds } from '../search/searchHighlighter.js';
import { ensure as ensureOverlays, refreshPositions as refreshOverlayPositions, attach as attachOverlayManager, detach as detachOverlayManager, setNoteCountsVisible } from './overlayManager.js';

// Track pending image loads to prevent duplicate requests
const pendingImageLoads = new Set();

// Queue for image updates that finish loading before Cytoscape instance exists
const pendingNodeImageUpdates = [];

// Track current active Cytoscape instance (helps with React 18 StrictMode double mount)
let currentActiveCy = null;

/**
 * Update overlays from a notes object and visibility flag.
 * IMPORTANT: While a node is being dragged, we only reposition overlays
 * (cheap) instead of re-ensuring/recreating them (expensive). This stops
 * badges from "flying" or snapping.
 */
export function updateOverlays(cy, notes, showNoteCountOverlay, visited = null, mode = 'editing') {
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
  }, mode);

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
              
              // *** FIX: Check if callback is still valid before calling ***
              if (onImageLoaded && typeof onImageLoaded === 'function') {
                try {
                  onImageLoaded(entryChildIdForNode, loadedImageUrl);
                } catch (err) {
                  printDebug(`❌ [cyAdapter] Error in onImageLoaded callback: ${err.message}`);
                }
              }
              
              if (GRAYSCALE_IMAGES && shouldProcessForGrayscale(loadedImageUrl, TEST_ICON_SVG)) {
                printDebug(`🎨 [cyAdapter] Starting grayscale (post-display) for: ${originalImageUrl}`);
                preprocessImageToGrayscale(loadedImageUrl, originalImageUrl, TEST_ICON_SVG).then(grayscaleUrl => {
                  printDebug(`✅ [cyAdapter] Grayscale conversion complete for: ${originalImageUrl}`);
                  if (onImageLoaded && typeof onImageLoaded === 'function') { 
                    try {
                      onImageLoaded(entryChildIdForNode, grayscaleUrl); 
                    } catch (err) {
                      printDebug(`❌ [cyAdapter] Error in grayscale onImageLoaded callback: ${err.message}`);
                    }
                  }
                }).catch(error => { 
                  console.warn(`❌ [cyAdapter] Grayscale conversion failed for: ${originalImageUrl}`, error); 
                });
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
    if (GRAYSCALE_IMAGES && shouldProcessForGrayscale(imageUrl, TEST_ICON_SVG)) {
      const originalPath = n.imageUrl; // The original filename
      let cached = getCachedGrayscaleImage(originalPath);
      if (!cached) {
        cached = getCachedGrayscaleImage(imageUrl); // Fallback to data URL key
      }
      
      if (cached) {
        printDebug(`✅ [cyAdapter] Using cached grayscale for data URL (key: ${originalPath ? 'path-based' : 'url-based'})`);
        imageUrl = cached; // already grayscale
      } else {
        printDebug(`🔄 [cyAdapter] Queueing grayscale conversion (will update later) for cached data URL`);
        preprocessImageToGrayscale(imageUrl, originalPath, TEST_ICON_SVG); // background; node shows color first
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

    // *** FIX: Check if this specific cy instance is still active and not destroyed ***
    const isThisCyActive = currentActiveCy === cy && !cy.destroyed();
    if (!isThisCyActive) {
      printDebug(`🔄 [cyAdapter] Image callback for inactive instance - discarding. node=${nodeId}`);
      
      // Only forward to active instance if there IS an active instance and it has this node
      if (currentActiveCy && !currentActiveCy.destroyed()) {
        const activeNode = currentActiveCy.getElementById(nodeId);
        if (activeNode.length > 0) {
          activeNode.data('imageUrl', imageUrl);
          currentActiveCy.style().update();
          printDebug(`✅ [cyAdapter] Forwarded image update to active instance for node ${nodeId}`);
        } else {
          printDebug(`🚫 [cyAdapter] Active instance doesn't have node ${nodeId} - discarding image update`);
        }
      }
      return;
    }

    const node = cy.getElementById(nodeId);
    if (!node || node.length === 0) {
      printDebug(`⚠️ [cyAdapter] Cannot find node ${nodeId} on this instance - discarding`);
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
    try { 
      cy.$('node.edge-note-count, node.edge-unseen, node.note-count, node.unseen').stop(true, true); 
    } catch {
      console.log('Error stopping animations');
    }

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
    try { 
      cy.$('node.edge-note-count, node.edge-unseen, node.note-count, node.unseen').stop(true, true); 
    } catch {
      console.log('Error stopping animations');
    }

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

  // *** FIX: Preserve background node before any changes ***
  const bgNode = cy.getElementById('__background_image_node__');
  let preservedBgNode = null;
  
  if (bgNode.length > 0) {
    preservedBgNode = {
      data: { ...bgNode.data() },
      position: { ...bgNode.position() },
      style: {
        width: bgNode.style('width'),
        height: bgNode.style('height'),
        opacity: bgNode.style('opacity')
      },
      locked: bgNode.locked(),
      classes: bgNode.classes()
    };
    printDebug('🖼️ [cyAdapter] Preserving background node before sync:', {
      id: preservedBgNode.data.id,
      position: preservedBgNode.position,
      opacity: preservedBgNode.style.opacity
    });
  }

  const currentZoom = cy.zoom();
  const currentPan = cy.pan();
  const currentPositions = {};
  cy.nodes().forEach(node => { currentPositions[node.id()] = node.position(); });

  const currentNodes = cy.nodes().filter(n => !n.hasClass('note-count') && !n.hasClass('background-image-node')).map(n => n.id()).sort();
  const currentEdges = cy.edges().map(e => e.id()).sort();
  const newNodes = newElements.filter(e => e.group === 'nodes').map(e => e.data.id).sort();
  const newEdges = newElements.filter(e => e.group === 'edges').map(e => e.data.id).sort();
  const nodesChanged = JSON.stringify(currentNodes) !== JSON.stringify(newNodes);
  const edgesChanged = JSON.stringify(currentEdges) !== JSON.stringify(newEdges);

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

    // *** FIX: Replace elements but preserve background node ***
    cy.startBatch();

    // Remove only non-background elements
    cy.elements().not('#__background_image_node__').remove();

    // add new elements
    cy.add(modifiedElements);
    
    cy.endBatch();

    cy.nodes().forEach(node => {
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

  const expectedParentGrabbable = mode === 'editing';
  cy.nodes().forEach(n => {
    if (n.hasClass('entry-parent')) {
      if (expectedParentGrabbable) n.grabify(); else n.ungrabify();
    } else {
      n.ungrabify();
    }
  });

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
            if (GRAYSCALE_IMAGES && shouldProcessForGrayscale(dataUrl, TEST_ICON_SVG)) {
              try {
                finalUrl = await preprocessImageToGrayscale(dataUrl, orig, TEST_ICON_SVG);
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
  container.addEventListener('wheel', debouncedWheelHandler, { passive: true });

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
  container.addEventListener('touchmove', debouncedTouchMoveHandler, { passive: true });

  // add pointer styles to nodes and edges
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

// Re-export clear function from grayscale utils
export const clearGrayscaleCache = clearGrayscaleCacheUtil;

// Re-export hasPendingGrayscaleConversions for backward compatibility
export { hasPendingGrayscaleConversions } from '../utils/grayscaleUtils.js';

// Re-export updateCompletedGrayscaleImages for backward compatibility  
export { updateCompletedGrayscaleImages } from '../utils/grayscaleUtils.js';

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
      finalImageUrl = await preprocessImageToGrayscale(imageUrl, imagePath, TEST_ICON_SVG);
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