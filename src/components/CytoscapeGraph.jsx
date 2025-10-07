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

import React, { useEffect, useRef, useMemo } from "react";
import {
  mountCy, syncElements, wireEvents,
  hasPendingGrayscaleConversions, updateCompletedGrayscaleImages,
  updateOverlays
} from "../graph/cyAdapter.js";
import { ensureBgNode } from "../graph/bgNodeAdapter.js";
import { setNoteCountsVisible, refreshPositions as refreshOverlayPositions } from '../graph/overlayManager.js';
import { printDebug, printError, printWarn } from "../utils/debug.js";

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

  // Latest callback refs; avoids re-binding cytoscape listeners every render
  const onViewportRef = useRef(null);
  useEffect(() => { onViewportRef.current = onViewportChange || null; }, [onViewportChange]);

  // Store all event handlers in refs so we don't re-wire events on every render
  const handlersRef = useRef({});
  useEffect(() => {
    handlersRef.current = {
      onNodeSelectionChange,
      onEdgeSelectionChange,
      onNodeClick,
      onEdgeClick,
      onNodeDoubleClick,
      onEdgeDoubleClick,
      onBackgroundClick,
      onNodeMove
    };
  }, [onNodeSelectionChange, onEdgeSelectionChange, onNodeClick, onEdgeClick,
      onNodeDoubleClick, onEdgeDoubleClick, onBackgroundClick, onNodeMove]);

  // rAF id so we throttle viewport streaming to once per frame
  const viewportRafIdRef = useRef(0);

  // ---- Helpers: attach/detach viewport streaming (pan+zoom -> onViewportChange) ----
  const attachViewportStreaming = (cy) => {
    const schedule = () => {
      if (!onViewportRef.current) return;
      if (viewportRafIdRef.current) return;
      viewportRafIdRef.current = requestAnimationFrame(() => {
        viewportRafIdRef.current = 0;
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
    // seed once
    schedule();

    const cleanup = () => {
      cy.off('pan zoom', schedule);
      if (viewportRafIdRef.current) {
        cancelAnimationFrame(viewportRafIdRef.current);
        viewportRafIdRef.current = 0;
      }
    };
    return cleanup;
  };

  // ---- Helpers: attach/detach edge-count (note bubble) live reposition rAF ----
  const attachEdgeCountLiveUpdater = React.useCallback((cy) => {
    let edgeCountRafPending = false;
    const scheduleEdgeCountUpdate = () => {
      if (edgeCountRafPending) return;
      edgeCountRafPending = true;
      requestAnimationFrame(() => {
        edgeCountRafPending = false;
        try {
          refreshOverlayPositions(cy);
        } catch (e) {
          printWarn('edge-count update failed:', e);
        }
      });
    };

    // Live updates while dragging and while programmatically moving nodes
    cy.on('drag position', 'node', scheduleEdgeCountUpdate);

    // Structural or data changes that affect edge endpoints or visibility
    cy.on('add remove data', 'edge', scheduleEdgeCountUpdate);
    cy.on('add remove', 'node', scheduleEdgeCountUpdate);

    // seed once
    scheduleEdgeCountUpdate();

    const cleanup = () => {
      cy.off('drag position', 'node', scheduleEdgeCountUpdate);
      cy.off('add remove data', 'edge', scheduleEdgeCountUpdate);
      cy.off('add remove', 'node', scheduleEdgeCountUpdate);
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

        // Initialize camera
        if (typeof initialZoom === "number") cy.zoom(initialZoom);
        if (initialCameraPosition && Number.isFinite(initialCameraPosition.x) && Number.isFinite(initialCameraPosition.y)) {
          cy.pan(initialCameraPosition);
        }

        // Wire domain/UI events (using refs to avoid re-wiring)
        const off = wireEvents(cy, handlersRef.current, mode);
        cy._eventCleanup = off;

        // Viewport streaming (BG layer)
        cy._viewportCleanup = attachViewportStreaming(cy);

        // Edge note-count live updater
        cy._edgeCountCleanup = attachEdgeCountLiveUpdater(cy);

        if (onCytoscapeInstanceReady) onCytoscapeInstanceReady(cy);

        // Build overlays immediately so the toggle only flips classes
        try { updateOverlays(cy, notes, showNoteCountOverlay, visited); }
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
        if (cy._viewportCleanup) cy._viewportCleanup();

        cy.destroy();
      } catch {
        printWarn('Failed to destroy Cytoscape instance');
      }
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

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

    // Re-wire UI events (using refs for handlers - they update automatically)
    printDebug(`🔌 [CytoscapeGraph] Re-wiring events for mode: ${mode}`);
    cy._eventCleanup = wireEvents(cy, handlersRef.current, mode);

    // Re-attach viewport streaming & seed once
    cy._viewportCleanup = attachViewportStreaming(cy);

    // Re-attach edge-count live updater & seed once
    cy._edgeCountCleanup = attachEdgeCountLiveUpdater(cy);

    // No extra cleanup here; handled by next run or unmount
  }, [mode]); // Only re-wire when mode changes - handlers use refs

  // ------------------- Memoized structural fingerprints to avoid expensive comparisons -------------------
  const nodesFingerprint = useMemo(() => {
    return nodes.map(n => ({
      id: n.id,
      title: n.title,
      size: n.size,
      color: n.color,
      imageUrl: n.originalImageUrl || n.imageUrl
    }));
  }, [nodes]);

  const edgesFingerprint = useMemo(() => {
    return edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      direction: e.direction ?? "forward"
    }));
  }, [edges]);

  // ------------------- Domain sync (nodes/edges) -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    printDebug(`🔄 [CytoscapeGraph] Domain sync effect triggered - checking if sync needed (mode: ${mode})`);
    printDebug(`🔍 [CytoscapeGraph] Current nodes in cytoscape: ${cy.nodes().length}, incoming nodes: ${nodes.length}`);
    printDebug(`🔍 [CytoscapeGraph] Current edges in cytoscape: ${cy.edges().length}, incoming edges: ${edges.length}`);

    // Check if mode changed by comparing current node grabbable state with expected
    const expectedGrabbable = mode === 'editing';
    const modeChanged = cy.nodes().length > 0 && cy.nodes()[0].grabbable() !== expectedGrabbable;

    // Quick count check first (cheapest operation)
    const cyNodeCount = cy.nodes('.entry-parent').length;
    const cyEdgeCount = cy.edges().length;
    const nodeCountChanged = nodes.length !== cyNodeCount;
    const edgeCountChanged = edges.length !== cyEdgeCount;

    // If counts changed, we know we need a full sync - skip expensive comparisons
    if (nodeCountChanged || edgeCountChanged || modeChanged) {
      printDebug(`🔄 [CytoscapeGraph] Count or mode changed - performing full sync`);
      syncElements(cy, { nodes, edges, mapName, cdnBaseUrl }, { mode });
      
      // Immediately re-place edge-count nodes post-sync
      try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current); } catch {
        printWarn('Failed to update edge count node positions after full sync');
      }
      return;
    }

    // Build lookup maps for efficient comparison (only if counts match)
    const currentNodesMap = new Map();
    cy.nodes('.entry-parent').forEach(n => {
      currentNodesMap.set(n.id(), {
        id: n.id(),
        title: n.data('label'),
        size: n.data('size'),
        color: n.data('color'),
        x: n.position().x,
        y: n.position().y
      });
    });

    const currentEdgesMap = new Map();
    cy.edges().forEach(e => {
      currentEdgesMap.set(e.id(), {
        id: e.id(),
        source: e.data('source'),
        target: e.data('target'),
        direction: e.data('direction') ?? "forward"
      });
    });

    // Check structural changes using memoized fingerprints
    let structuralChange = false;
    
    for (const nodeData of nodesFingerprint) {
      const current = currentNodesMap.get(nodeData.id);
      if (!current) {
        structuralChange = true;
        break;
      }
      if (current.title !== nodeData.title || 
          current.size !== nodeData.size || 
          current.color !== nodeData.color) {
        structuralChange = true;
        break;
      }
    }

    if (!structuralChange) {
      for (const edgeData of edgesFingerprint) {
        const current = currentEdgesMap.get(edgeData.id);
        if (!current) {
          structuralChange = true;
          break;
        }
        if (current.source !== edgeData.source || 
            current.target !== edgeData.target || 
            current.direction !== edgeData.direction) {
          structuralChange = true;
          break;
        }
      }
    }

    if (structuralChange) {
      printDebug(`🔄 [CytoscapeGraph] Performing full sync`);
      syncElements(cy, { nodes, edges, mapName, cdnBaseUrl }, { mode });

      // Immediately re-place edge-count nodes post-sync (covers undo, load, etc.)
      try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current); } catch {
        printWarn('Failed to update edge count node positions after full sync');
      }
    } else {
      printDebug(`🔄 [CytoscapeGraph] Only positions changed, updating positions without sync`);
      let updatedCount = 0;
      let majorChange = false;

      nodes.forEach(node => {
        const cyNode = cy.getElementById(node.id);
        if (cyNode.length > 0) {
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

      printDebug(`📍 [CytoscapeGraph] Updated positions for ${updatedCount} nodes (major: ${majorChange})`);

      // Nudge edge-count nodes right away so they don't wait for the next event
      if (updatedCount > 0) {
        try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current); } catch {
          printWarn('Failed to update edge count node positions after position-only update');
        }
      }

      // Optional: refresh layout on large changes
      if (updatedCount > 0 && majorChange) {
        syncElements(cy, { nodes, edges, mapName, cdnBaseUrl }, { mode });
        try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current); } catch {
          printWarn('Failed to update edge count node positions after major position-only update');
        }
      }
    }
  }, [nodesFingerprint, edgesFingerprint, mode, mapName, cdnBaseUrl, showNoteCountOverlay, notes, nodes]);
  // Note: 'nodes' is still needed for position updates in the else branch

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

    const nodeSelectionsMatch =
      currentSelectedNodes.length === selectedNodeIds.length &&
      currentSelectedNodes.every(id => selectedNodeIds.includes(id));

    const edgeSelectionsMatch =
      currentSelectedEdges.length === selectedEdgeIds.length &&
      currentSelectedEdges.every(id => selectedEdgeIds.includes(id));

    if (!nodeSelectionsMatch || !edgeSelectionsMatch) {
      cy.elements().unselect();
      selectedNodeIds.forEach(nodeId => {
        const node = cy.getElementById(nodeId);
        if (node.length > 0) node.select();
      });
      selectedEdgeIds.forEach(edgeId => {
        const edge = cy.getElementById(edgeId);
        if (edge.length > 0) edge.select();
      });
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
    cy.nodes().forEach(n => {
      const isGrab = n.grabbable();
      if (expected && !isGrab) { n.grabify(); changed++; }
      if (!expected && isGrab) { n.ungrabify(); changed++; }
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
    if (!cy) return;

    if (bgImage && bgImage.imageUrl) {
      printDebug(`🖼️ [CytoscapeGraph] Updating background node`, {
        visible: bgImage.visible,
        opacity: bgImage.opacity,
        hasCalibration: !!bgImage.calibration,
        calibration: bgImage.calibration
      });
      
      ensureBgNode(cy, {
        imageUrl: bgImage.imageUrl,
        visible: bgImage.visible,
        opacity: bgImage.opacity,
        calibration: bgImage.calibration || { tx: 0, ty: 0, s: 1 }
      });
    } else {
      // Remove background node if no image
      ensureBgNode(cy, { imageUrl: null, visible: false });
    }
  }, [bgImage]);

  // ------------------- Note count overlay creation/refresh -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    updateOverlays(cy, notes, showNoteCountOverlay, visited);

    const handleGraphChange = () => {
      updateOverlays(cy, notes, showNoteCountOverlay, visited);
    };

    cy.on('add remove', handleGraphChange);
    return () => {
      cy.off('add remove', handleGraphChange);
    };
  }, [showNoteCountOverlay, notes, visited]);

  // ------------------- Edge note-count re-run when entry-parent nodes move -------------------
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const visitedRef = useRef(visited);
  useEffect(() => { visitedRef.current = visited; }, [visited]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const handleNodePosition = () => {
      updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current);
    };

    cy.on('position', 'node.entry-parent', handleNodePosition);
    return () => {
      cy.off('position', 'node.entry-parent', handleNodePosition);
    };
  }, [showNoteCountOverlay]); // uses notesRef.current

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
