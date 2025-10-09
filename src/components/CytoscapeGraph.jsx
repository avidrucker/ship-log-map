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

import React, { useEffect, useRef } from "react";
import {
  mountCy, syncElements, wireEvents,
  updateOverlays
} from "../graph/cyAdapter.js";
import { 
  hasPendingGrayscaleConversions, 
  updateCompletedGrayscaleImages 
} from "../utils/grayscaleUtils.js";
import { setNoteCountsVisible, refreshPositions as refreshOverlayPositions } from '../graph/overlayManager.js';
import { printDebug, printError, printWarn } from "../utils/debug.js";
import { TEST_ICON_SVG } from "../constants/testAssets.js";
import { GRAYSCALE_IMAGES } from "../config/features.js";
import { ensureBgNode, removeBgNode } from "../graph/bgNodeAdapter.js";

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
  bgNodeProps = { imageUrl: '', visible: false, opacity: 100, calibration: { tx: 0, ty: 0, s: 1 } }
}) {
  
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Latest callback ref; avoids re-binding cytoscape listeners every render
  const onViewportRef = useRef(null);
  useEffect(() => { onViewportRef.current = onViewportChange || null; }, [onViewportChange]);

  // rAF id so we throttle viewport streaming to once per frame
  const viewportRafIdRef = useRef(0);

  // ---- Helpers: attach/detach viewport streaming (pan+zoom -> onViewportChange) ----
  const attachViewportStreaming = (cy) => {
    const schedule = () => {
      if (!onViewportRef.current) return;
      if (viewportRafIdRef.current) return;
      viewportRafIdRef.current = requestAnimationFrame(() => {
        console.log("attach viewport streaming")
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
    let updatePending = false;
    let lastUpdateTime = 0;
    const MIN_UPDATE_INTERVAL = 16; // Max 60fps
    
    const scheduleUpdate = () => {
      if (updatePending) return;
      
      const now = performance.now();
      if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
        // Too soon - schedule for later
        updatePending = true;
        setTimeout(() => {
          updatePending = false;
          scheduleUpdate();
        }, MIN_UPDATE_INTERVAL - (now - lastUpdateTime));
        return;
      }
      
      updatePending = true;
      requestAnimationFrame(() => {
        console.log("attach edege count live updater")
        updatePending = false;
        lastUpdateTime = performance.now();
        
        try {
          refreshOverlayPositions(cy);
        } catch (e) {
          printWarn('edge-count update failed:', e);
        }
      });
    };

    // *** ONLY listen to drag events (not all position changes) ***
    cy.on('drag', 'node.entry-parent', scheduleUpdate);
    
    // Initial seed
    scheduleUpdate();

    const cleanup = () => {
      cy.off('drag', 'node.entry-parent', scheduleUpdate);
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

        // Wire domain/UI events
        const off = wireEvents(cy, {
          onNodeSelectionChange,
          onEdgeSelectionChange,
          onNodeClick,
          onEdgeClick,
          onNodeDoubleClick,
          onEdgeDoubleClick,
          onBackgroundClick,
          onNodeMove,
          notes
        }, mode);
        cy._eventCleanup = off;

        // Viewport streaming (BG layer)
        cy._viewportCleanup = attachViewportStreaming(cy);

        // Edge note-count live updater
        cy._edgeCountCleanup = attachEdgeCountLiveUpdater(cy);

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
        if (cy._viewportCleanup) cy._viewportCleanup();
        try { removeBgNode(cy); } catch { /*noop*/ }

        cy.destroy();
      } catch {
        printWarn('Failed to destroy Cytoscape instance');
      }
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once
  
  // ------------------- Re-wire events when handlers/mode change -------------------
  useEffect(() => {
    printDebug(`🔌 [CytoscapeGraph] Event handlers changed, re-wiring events`);
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

    // Re-wire UI events
    printDebug(`🔌 [CytoscapeGraph] Re-wiring events for mode: ${mode}`);
    cy._eventCleanup = wireEvents(cy, {
      onNodeSelectionChange,
      onEdgeSelectionChange,
      onNodeClick,
      onEdgeClick,
      onNodeDoubleClick,
      onEdgeDoubleClick,
      onBackgroundClick,
      onNodeMove,
      notes
    }, mode);

    // Re-attach viewport streaming & seed once
    cy._viewportCleanup = attachViewportStreaming(cy);

    // Re-attach edge-count live updater & seed once
    cy._edgeCountCleanup = attachEdgeCountLiveUpdater(cy);

    // No extra cleanup here; handled by next run or unmount
  }, [
    onNodeSelectionChange, onEdgeSelectionChange, onNodeClick, onEdgeClick,
    onNodeDoubleClick, onEdgeDoubleClick, onBackgroundClick, onNodeMove,
    mode, notes, attachEdgeCountLiveUpdater
  ]);

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

    // Compare structural changes
    const currentNodes = cy.nodes().map(n => ({
      id: n.id(),
      data: n.data(),
      position: n.position()
    }));

    const normalizeImageUrl = (imageUrl) => {
      if (!imageUrl || imageUrl === "unspecified" || imageUrl.startsWith('data:image/svg+xml')) return "placeholder";
      if (imageUrl.startsWith('data:image/')) return "data-url-image";
      return imageUrl;
    };

    const nodeStructuralChanges = nodes.some(newNode => {
      const currentNode = currentNodes.find(cn => cn.id === newNode.id);
      if (!currentNode) return true;
      const newNodeNonPosition = {
        id: newNode.id,
        title: newNode.title,
        size: newNode.size,
        color: newNode.color,
        imageUrl: normalizeImageUrl(newNode.originalImageUrl || newNode.imageUrl)
      };
      const currentNodeNonPosition = {
        id: currentNode.data.id,
        title: currentNode.data.label,
        size: currentNode.data.size,
        color: currentNode.data.color,
        imageUrl: normalizeImageUrl(currentNode.data.originalImageUrl || currentNode.data.imageUrl)
      };
      return JSON.stringify(newNodeNonPosition) !== JSON.stringify(currentNodeNonPosition);
    });

    const currentEdges = cy.edges().map(e => ({ id: e.id(), data: e.data() }));
    const edgeStructuralChanges = edges.some(newEdge => {
      const currentEdge = currentEdges.find(ce => ce.id === newEdge.id);
      if (!currentEdge) return true;
      const a = { id: newEdge.id, source: newEdge.source, target: newEdge.target, direction: newEdge.direction ?? "forward" };
      const b = { id: currentEdge.data.id, source: currentEdge.data.source, target: currentEdge.data.target, direction: currentEdge.data.direction ?? "forward" };
      return JSON.stringify(a) !== JSON.stringify(b);
    });

    const nodeCountChanged = nodes.length !== currentNodes.length;
    const edgeCountChanged = edges.length !== cy.edges().length;

    if (modeChanged || nodeStructuralChanges || edgeStructuralChanges || nodeCountChanged || edgeCountChanged) {
      printDebug(`🔄 [CytoscapeGraph] Performing full sync`);
      syncElements(cy, { nodes, edges, mapName, cdnBaseUrl }, { mode });

      // Immediately re-place edge-count nodes post-sync (covers undo, load, etc.)
      try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current, mode); } catch {
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
        try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current, mode); } catch {
          printWarn('Failed to update edge count node positions after position-only update');
        }
      }

      // Optional: refresh layout on large changes
      if (updatedCount > 0 && majorChange) {
        syncElements(cy, { nodes, edges, mapName, cdnBaseUrl }, { mode });
        try { updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current, mode); } catch {
          printWarn('Failed to update edge count node positions after major position-only update');
        }
      }
    }
  }, [nodes, edges, mode, mapName, cdnBaseUrl, showNoteCountOverlay, notes]);

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

  // ------------------- Grayscale image conversions -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const interval = setInterval(() => {
      if (hasPendingGrayscaleConversions()) {
        const updated = updateCompletedGrayscaleImages(cy, { nodes, edges, mapName, cdnBaseUrl });
        if (updated) {
          cy.forceRender();
        }
      }
    }, 500);

    return () => clearInterval(interval);
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

  // ------------------- Edge note-count re-run when entry-parent nodes move -------------------
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const visitedRef = useRef(visited);
  useEffect(() => { visitedRef.current = visited; }, [visited]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const handleNodePosition = () => {
      updateOverlays(cy, notesRef.current, showNoteCountOverlay, visitedRef.current, mode);
    };

    cy.on('position', 'node.entry-parent', handleNodePosition);
    return () => {
      cy.off('position', 'node.entry-parent', handleNodePosition);
    };
  }, [showNoteCountOverlay, mode]); // uses notesRef.current

  // ------------------- Background image node integration -------------------
  // ------------------- Background image node sync -------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const { imageUrl, visible, opacity, calibration } = bgNodeProps || {};

    // Create/update or remove the background node
    ensureBgNode(cy, {
      imageUrl,
      visible,
      opacity,
      calibration
    });

    // Nothing special required on cleanup; node is removed when invisible.
    // Still, if component unmounts while visible, clean it up.
    return () => {
      // Only remove on unmount (don’t fight with other effects)
      if (cy?.destroyed && !cy.destroyed()) {
        // noop (we remove on visibility false in ensureBgNode)
      }
    };
    // Include a stable calibration dep (stringify small object is fine here)
  }, [
    cyRef,
    bgNodeProps
  ]);

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
