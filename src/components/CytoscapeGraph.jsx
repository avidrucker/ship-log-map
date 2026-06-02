// src/components/CytoscapeGraph.jsx

/**
 * CytoscapeGraph — Declarative wrapper around Cytoscape
 *
 * Responsibilities
 * - Mounts a Cytoscape instance and keeps it in sync with `nodes`/`edges`.
 * - Emits high-level events to the parent (clicks, double-clicks, selections,
 *   background clicks) without mutating domain state.
 * - Handles "fit on next render" and "shouldFitOnNextRender" acknowledgements.
 * - Integrates grayscale/placeholder image readiness to avoid flicker.
 *
 * Props (selected)
 * - nodes, edges, mode ('editing'|'playing'), mapName, cdnBaseUrl
 * - onNodeSelectionChange(ids), onEdgeSelectionChange(ids)
 * - onNodeClick(id), onEdgeClick(id), onBackgroundClick()
 * - shouldFitOnNextRender, onFitCompleted()
 *
 * Gotchas
 * - Keep props stable (useCallback/memo) to avoid unnecessary full re-syncs.
 */

import React, { useEffect, useRef, useMemo, useState } from "react";
import {
  mountCy, syncElements, wireEvents,
  updateOverlays
} from "../graph/cyAdapter.js";
import { ensureBgNode, removeBgNode } from "../graph/bgNodeAdapter.js";
import { 
  hasPendingGrayscaleConversions, 
  updateCompletedGrayscaleImages 
} from "../utils/grayscaleUtils.js";
import { setNoteCountsVisible, refreshPositions as refreshOverlayPositions } from '../graph/overlayManager.js';
import { printDebug, printError, printWarn } from "../utils/debug.js";
import { TEST_ICON_SVG } from "../constants/testAssets.js";
import { GRAYSCALE_IMAGES, DEV_MODE } from "../config/features.js";

function CytoscapeGraph({
  nodes = [],
  edges = [],
  mode = 'editing',
  mapName = 'default_map',
  cdnBaseUrl = '',

  selectedNodeIds = [],
  selectedEdgeIds = [],

  initialZoom,
  initialCameraPosition,

  // Per-frame stream for BG layer (kept outside reducer commits)
  onViewportChange,

  shouldFitOnNextRender = false,
  onFitCompleted,

  onNodeSelectionChange,
  onEdgeSelectionChange,
  onNodeClick,
  onEdgeClick,
  onNodeDoubleClick,
  onEdgeDoubleClick,
  onBackgroundClick,
  onNodeMove,

  showNoteCountOverlay = false,
  notes = {},
  visited = { nodes: new Set(), edges: new Set() },
  onCytoscapeInstanceReady,
  
  // Background image integration
  bgImage = null // { imageUrl, visible, opacity, calibration: { tx, ty, s } }
}) {
  
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [isCyReady, setIsCyReady] = useState(false);

  // Latest callback refs; avoids re-binding cytoscape listeners every render
  const onViewportRef = useRef(null);
  useEffect(() => { onViewportRef.current = onViewportChange || null; }, [onViewportChange]);

  // rAF id so we throttle viewport streaming to once per frame
  const viewportRafIdRef = useRef(0);

  // ---- Helpers: attach/detach viewport streaming (pan+zoom -> onViewportChange) ----
  const attachViewportStreaming = (cy) => {
    //// console.log(`🔵 [attachViewportStreaming] Attaching viewport handlers`);
    
    let isEnabled = true; // Flag to enable/disable streaming without detaching
    
    const schedule = () => {
      if (!isEnabled) {
        printDebug(`⏸️ [ViewportStreaming] schedule() called but DISABLED - skipping`);
        return; // Skip if disabled
      }
      if (!onViewportRef.current) return;
      if (viewportRafIdRef.current) return;

      printDebug(`🔵 [ViewportStreaming] Scheduling viewport update rAF`);

      viewportRafIdRef.current = requestAnimationFrame(() => {
        viewportRafIdRef.current = 0;
        printDebug(`📡 [ViewportStreaming] Executing viewport update at ${performance.now().toFixed(2)}ms`);
        try {
          const p = cy.pan();
          const z = cy.zoom();
          onViewportRef.current({ pan: { x: p.x, y: p.y }, zoom: z });
        } catch (e) {
          printWarn('onViewportChange handler threw:', e);
        }
      });
    };
    
    cy.on('pan zoom', schedule);
    //// console.log(`🔵 [attachViewportStreaming #${attachId}] Handlers attached to 'pan zoom' events`);
    
    // seed once
    schedule();

    // Expose pause/resume on the cy instance for use during animations
    cy.__pauseViewportStreaming = () => {
      isEnabled = false;
      if (viewportRafIdRef.current) {
        cancelAnimationFrame(viewportRafIdRef.current);
        viewportRafIdRef.current = 0;
      }
    };
    
    cy.__resumeViewportStreaming = () => {
      isEnabled = true;
      schedule(); // Trigger one final update after resume
    };

    const cleanup = () => {
      //// console.log(`🔴 [attachViewportStreaming #${attachId}] Cleaning up viewport handlers`);
      cy.off('pan zoom', schedule);
      if (viewportRafIdRef.current) {
        cancelAnimationFrame(viewportRafIdRef.current);
        viewportRafIdRef.current = 0;
      }
      delete cy.__pauseViewportStreaming;
      delete cy.__resumeViewportStreaming;
    };
    return cleanup;
  };

  // ---- Helpers: lightweight drag-FPS counter (dev profiling) ----
  const attachDragFpsCounter = React.useCallback((cy) => {
    let rafId = null;
    let frameCount = 0;
    let startTime = 0;

    const tick = () => {
      frameCount++;
      rafId = requestAnimationFrame(tick);
    };

    const onGrab = () => {
      frameCount = 0;
      startTime = performance.now();
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    };

    const onFree = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (DEV_MODE) {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0.1) {
          // eslint-disable-next-line no-console
          console.info('[FPS] drag fps:', Math.round(frameCount / elapsed), `(${frameCount} frames / ${elapsed.toFixed(2)}s)`);
        }
      }
    };

    cy.on('grab', 'node.entry-parent', onGrab);
    cy.on('free', 'node.entry-parent', onFree);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      cy.off('grab', 'node.entry-parent', onGrab);
      cy.off('free', 'node.entry-parent', onFree);
    };
  }, []);

  // ---- Helpers: attach/detach edge-count (note bubble) live reposition rAF ----
  const attachEdgeCountLiveUpdater = React.useCallback((cy) => {
    let rafId = null;
    let lastUpdateTime = 0;
    const MIN_UPDATE_INTERVAL = 100; // Max 10 updates per second

    const scheduleUpdate = () => {
      // Check time FIRST — if a RAF is already pending, let it fire rather than
      // cancelling it (the old cancel-before-check pattern lost pending updates).
      const now = performance.now();
      if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) return; // too soon
      if (rafId !== null) return;                             // already scheduled

      rafId = requestAnimationFrame(() => {
        rafId = null;
        lastUpdateTime = performance.now();
        try {
          refreshOverlayPositions(cy);
        } catch (e) {
          printWarn('edge-count update failed:', e);
        }
      });
    };

    cy.on('drag', 'node.entry-parent', scheduleUpdate);
    cy.on('dragfree', 'node.entry-parent', scheduleUpdate);

    const cleanup = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      cy.off('drag', 'node.entry-parent', scheduleUpdate);
      cy.off('dragfree', 'node.entry-parent', scheduleUpdate);
    };

    return cleanup;
  }, []);

  // ------------------- Mount once -------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const mount = async () => {
      try {
        const cy = await mountCy({
          container: containerRef.current,
          graph: { nodes, edges, mapName, cdnBaseUrl },
          mode
        });
        cyRef.current = cy;
        containerRef.current._cy = cy; // exposes cy to E2E tests via document.getElementById('cy')._cy
        setIsCyReady(true); // Trigger effects that depend on cy being ready

        // Initialize camera
        if (typeof initialZoom === "number") cy.zoom(initialZoom);
        if (initialCameraPosition && Number.isFinite(initialCameraPosition.x) && Number.isFinite(initialCameraPosition.y)) {
          cy.pan(initialCameraPosition);
        }

        // Wire domain/UI events
        const off = wireEvents(cy, {
          onNodeSelectionChange: onNodeSelectionChangeRef,
          onEdgeSelectionChange: onEdgeSelectionChangeRef,
          onNodeClick: onNodeClickRef,
          onEdgeClick: onEdgeClickRef,
          onNodeDoubleClick: onNodeDoubleClickRef,
          onEdgeDoubleClick: onEdgeDoubleClickRef,
          onBackgroundClick: onBackgroundClickRef,
          onNodeMove: onNodeMoveRef,
          notes: notesRef
        }, mode);
        cy._eventCleanup = off;

        // Viewport streaming (BG layer) — attach only if consumer provided a handler
        if (onViewportRef.current) {
          cy._viewportCleanup = attachViewportStreaming(cy);
        } else {
          cy._viewportCleanup = null;
        }

        // Edge note-count live updater
        cy._edgeCountCleanup = attachEdgeCountLiveUpdater(cy);

        // Drag FPS counter (dev profiling — logs to console only)
        cy._dragFpsCleanup = attachDragFpsCounter(cy);

        if (onCytoscapeInstanceReady) onCytoscapeInstanceReady(cy);

        // Build overlays immediately so the toggle only flips classes
        try { updateOverlays(cy, notes, showNoteCountOverlay, visited, mode); }
        catch (err) { console.warn('Failed to create initial note count overlays:', err); }
      } catch (err) {
        printError('Failed to initialize Cytoscape:', err);
      }
    };

    mount();

    return () => {
      try {
        const cy = cyRef.current;
        if (!cy) return;

        if (cy._eventCleanup) cy._eventCleanup();
        if (cy._edgeCountCleanup) cy._edgeCountCleanup();
        if (cy._dragFpsCleanup) cy._dragFpsCleanup();
        if (cy._viewportCleanup) cy._viewportCleanup();
        try { removeBgNode(cy); } catch { /* noop */ }

        cy.destroy();
      } catch {
        printWarn('Failed to destroy Cytoscape instance');
      }
      cyRef.current = null;
      setIsCyReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // ------------------- Re-wire events ONLY when mode changes -------------------
  // ------------------- Re-wire events ONLY when mode changes -------------------
  useEffect(() => {
    printDebug(`🔌 [CytoscapeGraph] Mode changed, re-wiring events for mode: ${mode}`);
    const cy = cyRef.current;
    if (!cy) {
      printDebug(`⚠️ [CytoscapeGraph] cyRef.current is null, skipping event re-wiring`);
      return;
    }

    // Clean up existing domain/UI events
    if (cy._eventCleanup) {
      printDebug(`🧹 [CytoscapeGraph] Cleaning up existing events`);
      cy._eventCleanup();
      cy._eventCleanup = null;
    }

    // Clean up viewport streaming
    if (cy._viewportCleanup) {
      cy._viewportCleanup();
      cy._viewportCleanup = null;
    }

    // Clean up edge-count listeners
    if (cy._edgeCountCleanup) {
      cy._edgeCountCleanup();
      cy._edgeCountCleanup = null;
    }

    // Re-wire UI events - pass refs so handlers always use latest callbacks
    printDebug(`🔌 [CytoscapeGraph] Re-wiring events for mode: ${mode}`);
    cy._eventCleanup = wireEvents(cy, {
      onNodeSelectionChange: onNodeSelectionChangeRef,
      onEdgeSelectionChange: onEdgeSelectionChangeRef,
      onNodeClick: onNodeClickRef,
      onEdgeClick: onEdgeClickRef,
      onNodeDoubleClick: onNodeDoubleClickRef,
      onEdgeDoubleClick: onEdgeDoubleClickRef,
      onBackgroundClick: onBackgroundClickRef,
      onNodeMove: onNodeMoveRef,
      notes: notesRef
    }, mode);

    // Re-attach viewport streaming & seed once
    if (onViewportRef.current) {
      cy._viewportCleanup = attachViewportStreaming(cy);
    } else {
      cy._viewportCleanup = null;
    }
    
    // Re-attach edge-count live updater & seed once
    cy._edgeCountCleanup = attachEdgeCountLiveUpdater(cy);

    // No extra cleanup here; handled by next run or unmount
  // attachEdgeCountLiveUpdater reads from internal refs — only mode should trigger this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ------------------- Memoized structural fingerprints to avoid expensive comparisons -------------------
  // String keys encoding only structural fields (no positions).
  // When the key is unchanged between renders, only positions changed — skip the
  // expensive Cytoscape Map-build + N-comparison and go straight to batch update.
  const nodesKey = useMemo(() =>
    nodes.map(n => [n.id, n.title ?? '', n.size ?? '', n.color ?? '', n.originalImageUrl || n.imageUrl || ''].join('\x1F')).join('\x1E')
  , [nodes]);

  const edgesKey = useMemo(() =>
    edges.map(e => [e.id, e.source, e.target, e.direction ?? 'forward'].join('\x1F')).join('\x1E')
  , [edges]);

  const prevNodesKeyRef = useRef(null);
  const prevEdgesKeyRef = useRef(null);

  // ------------------- Domain sync (nodes/edges) -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const nodesKeyChanged = nodesKey !== prevNodesKeyRef.current;
    const edgesKeyChanged = edgesKey !== prevEdgesKeyRef.current;
    prevNodesKeyRef.current = nodesKey;
    prevEdgesKeyRef.current = edgesKey;

    // Check if mode changed by comparing current node grabbable state with expected
    const expectedGrabbable = mode === 'editing';
    const modeChanged = cy.nodes().length > 0 && cy.nodes()[0].grabbable() !== expectedGrabbable;

    if (nodesKeyChanged || edgesKeyChanged || modeChanged) {
      printDebug(`🔄 [CytoscapeGraph] Structural or mode change — performing full sync`);
      syncElements(cy, { nodes, edges, mapName, cdnBaseUrl }, { mode });
      try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current, mode); } catch {
        printWarn('Failed to update overlays after full sync');
      }
      return;
    }

    // Position-only update: keys unchanged, skip all Map building and comparison.
    printDebug(`🔄 [CytoscapeGraph] Position-only update`);
    let updatedCount = 0;
    let majorChange = false;

    const cyNodeById = new Map();
    cy.nodes('.entry-parent').forEach(n => cyNodeById.set(n.id(), n));
    cy.startBatch();
    nodes.forEach(node => {
      const cyNode = cyNodeById.get(node.id);
      if (cyNode) {
        const currentPos = cyNode.position();
        const dx = Math.abs(currentPos.x - node.x);
        const dy = Math.abs(currentPos.y - node.y);
        if (dx > 0.01 || dy > 0.01) {
          cyNode.position({ x: node.x, y: node.y });
          updatedCount++;
          if (dx > 10 || dy > 10) majorChange = true;
        }
      }
    });
    cy.endBatch();

    if (updatedCount > 0) {
      try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current, mode); } catch {
        printWarn('Failed to update overlays after position-only update');
      }
      if (majorChange) {
        syncElements(cy, { nodes, edges, mapName, cdnBaseUrl }, { mode });
        try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current, mode); } catch {
          printWarn('Failed to update overlays after major position update');
        }
      }
    }
  }, [nodesKey, edgesKey, mode, mapName, cdnBaseUrl, showNoteCountOverlay, nodes, edges]);
  // notes removed from deps: accessed via notesRef.current (kept current by dedicated effect at line 692)

  // ------------------- Note count visibility toggle -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    
    // Immediately update visibility when showNoteCountOverlay changes
    setNoteCountsVisible(cy, showNoteCountOverlay);
  }, [showNoteCountOverlay]);

  // ------------------- Sync selections when app state changes -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const currentSelectedNodes = cy.$("node:selected").map(n => n.id());
    const currentSelectedEdges = cy.$("edge:selected").map(e => e.id());

    const nodeIdSet = new Set(selectedNodeIds);
    const edgeIdSet = new Set(selectedEdgeIds);

    const nodeSelectionsMatch =
      currentSelectedNodes.length === selectedNodeIds.length &&
      currentSelectedNodes.every(id => nodeIdSet.has(id));

    const edgeSelectionsMatch =
      currentSelectedEdges.length === selectedEdgeIds.length &&
      currentSelectedEdges.every(id => edgeIdSet.has(id));

    if (!nodeSelectionsMatch || !edgeSelectionsMatch) {
      cy.startBatch();
      cy.elements().unselect();
      selectedNodeIds.forEach(nodeId => {
        const node = cy.getElementById(nodeId);
        if (node.length > 0) node.select();
      });
      selectedEdgeIds.forEach(edgeId => {
        const edge = cy.getElementById(edgeId);
        if (edge.length > 0) edge.select();
      });
      cy.endBatch();
    }
  }, [selectedNodeIds, selectedEdgeIds]);

  // ------------------- Fit request -------------------
  useEffect(() => {
    if (!cyRef.current || !shouldFitOnNextRender) return;
    
    const attemptFit = () => {
      try {
        const cy = cyRef.current;
        if (!cy) {
          if (onFitCompleted) onFitCompleted();
          return;
        }

        const nodeCount = cy.nodes().length;
        printDebug(`🎯 [CytoscapeGraph] Fit attempt - nodes available: ${nodeCount}`);

        if (nodeCount > 0) {
          cy.fit(cy.nodes(), 50);
          printDebug(`✅ [CytoscapeGraph] Fit completed successfully with ${nodeCount} nodes`);
          if (onFitCompleted) onFitCompleted();
        } else {
          // Retry after a short delay if no nodes are available yet
          printDebug(`⏳ [CytoscapeGraph] No nodes available, retrying fit in 100ms`);
          setTimeout(attemptFit, 100);
        }
      } catch (error) {
        printWarn("Failed to fit Cytoscape instance:", error);
        if (onFitCompleted) onFitCompleted(); // Ensure flag gets cleared
      }
    };

    // Start with a delay to ensure elements are rendered
    const timeoutId = setTimeout(attemptFit, 150);
    
    return () => clearTimeout(timeoutId);
  }, [shouldFitOnNextRender, onFitCompleted]);

  // ------------------- Grayscale image conversions (optimized with rAF) -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    let rafId = null;
    let isChecking = false;

    const checkGrayscaleUpdates = () => {
      if (isChecking) return;
      isChecking = true;
      
      rafId = requestAnimationFrame(() => {
        isChecking = false;
        
        if (hasPendingGrayscaleConversions()) {
          printDebug('🎨 [CytoscapeGraph] raf Checking for completed grayscale conversions...');
          const updated = updateCompletedGrayscaleImages(cy, { nodes, edges, mapName, cdnBaseUrl });
          if (updated) {
            cy.forceRender();
          }
          // Continue checking while conversions are pending
          checkGrayscaleUpdates();
        }
      });
    };

    // Only start checking if there are pending conversions
    if (hasPendingGrayscaleConversions()) {
      checkGrayscaleUpdates();
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      isChecking = false;
    };
  }, [nodes, edges, mapName, cdnBaseUrl]);

  // ------------------- Immediate grabbable toggle on mode change -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const expected = mode === 'editing';
    let changed = 0;
    cy.batch(() => {
      cy.nodes().forEach(n => {
        const isGrab = n.grabbable();
        if (expected && !isGrab) { n.grabify(); changed++; }
        if (!expected && isGrab) { n.ungrabify(); changed++; }
      });
    });
    if (changed) {
      printDebug(`⚙️ [CytoscapeGraph] Mode='${mode}' enforced ${expected ? 'grabify' : 'ungrabify'} on ${changed} nodes (immediate effect)`);
    } else {
      printDebug(`⚙️ [CytoscapeGraph] Mode='${mode}' grabbable states already correct (immediate effect)`);
    }
  }, [mode]);

  // ------------------- Background image node integration -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !isCyReady) {
      return;
    }

    if (bgImage && bgImage.imageUrl) {
      printDebug(`🖼️ [CytoscapeGraph] Updating background node`, {
        visible: bgImage.visible,
        opacity: bgImage.opacity,
        hasCalibration: !!bgImage.calibration,
        calibration: bgImage.calibration
      });
      
      // Ensure Cytoscape is ready before adding background node
      cy.ready(() => {
        ensureBgNode(cy, {
          imageUrl: bgImage.imageUrl,
          visible: bgImage.visible,
          opacity: bgImage.opacity,
          calibration: bgImage.calibration || { tx: 0, ty: 0, s: 1 }
        });
      });
    } else {
      // Remove background node if no image
      cy.ready(() => {
        ensureBgNode(cy, { imageUrl: null, visible: false });
      });
    }
  }, [bgImage, isCyReady]);

  // ------------------- Note count overlay creation/refresh -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    updateOverlays(cy, notes, showNoteCountOverlay, visited, mode);

    const handleGraphChange = () => {
      updateOverlays(cy, notes, showNoteCountOverlay, visited, mode);
    };

    cy.on('add remove', handleGraphChange);
    return () => {
      cy.off('add remove', handleGraphChange);
    };
  }, [showNoteCountOverlay, notes, visited, mode]);

  // Latest callback refs; avoids re-binding cytoscape listeners every render
  // Add refs for ALL event callbacks:
  const onNodeSelectionChangeRef = useRef(onNodeSelectionChange);
  const onEdgeSelectionChangeRef = useRef(onEdgeSelectionChange);
  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  const onEdgeDoubleClickRef = useRef(onEdgeDoubleClick);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  const onNodeMoveRef = useRef(onNodeMove);

  // Keep refs in sync with props:
  useEffect(() => { onNodeSelectionChangeRef.current = onNodeSelectionChange; }, [onNodeSelectionChange]);
  useEffect(() => { onEdgeSelectionChangeRef.current = onEdgeSelectionChange; }, [onEdgeSelectionChange]);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { onEdgeClickRef.current = onEdgeClick; }, [onEdgeClick]);
  useEffect(() => { onNodeDoubleClickRef.current = onNodeDoubleClick; }, [onNodeDoubleClick]);
  useEffect(() => { onEdgeDoubleClickRef.current = onEdgeDoubleClick; }, [onEdgeDoubleClick]);
  useEffect(() => { onBackgroundClickRef.current = onBackgroundClick; }, [onBackgroundClick]);
  useEffect(() => { onNodeMoveRef.current = onNodeMove; }, [onNodeMove]);

  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const visitedRef = useRef(visited);
  useEffect(() => { visitedRef.current = visited; }, [visited]);

  // useEffect(() => {
  //   const cy = cyRef.current;
  //   if (!cy) return;

  //   const handleNodePosition = () => {
  //     updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current, mode);
  //   };

  //   cy.on('position', 'node.entry-parent', handleNodePosition);
  //   return () => {
  //     cy.off('position', 'node.entry-parent', handleNodePosition);
  //   };
  // }, [mode, showNoteCountOverlay]); // uses notesRef.current

  return (
    <div
      id="cy"
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0, left: 0,
        width: "100%",
        height: "100%",
        outline: "none"
      }}
    />
  );
}

export default React.memo(CytoscapeGraph);
