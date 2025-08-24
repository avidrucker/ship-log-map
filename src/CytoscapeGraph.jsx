// src/CytoscapeGraph.jsx
import React, { useEffect, useRef } from "react";
import { mountCy, syncElements, wireEvents, hasPendingGrayscaleConversions, updateCompletedGrayscaleImages, ensureNoteCountNodes, updateNoteCounts } from "./graph/cyAdapter.js";
import { printDebug, printError, printWarn } from "./utils/debug.js";

// NOTE: mountCy now supports async CDN placeholder default image loading for 'unspecified' images.
// Passing mapName & cdnBaseUrl ensures placeholder keyed per map.

// Keep the same props your App already passes in
function CytoscapeGraph({
  nodes = [],
  edges = [],
  mode = 'editing',
  mapName = 'default_map',
  cdnBaseUrl = '',

  // Selection state for synchronization
  selectedNodeIds = [],
  selectedEdgeIds = [],

  // Camera / viewport
  initialZoom,
  initialCameraPosition,
  onZoomChange,
  onCameraMove,
  shouldFitOnNextRender = false,
  onFitCompleted,

  // Selections & clicks
  onNodeSelectionChange,
  onEdgeSelectionChange,
  onNodeClick,
  onEdgeClick,
  onNodeDoubleClick,
  onEdgeDoubleClick,
  onBackgroundClick,

  // Editing callbacks (forwarded up; the graph doesn’t mutate domain state directly)
  // onDeleteSelectedEdges,
  // onNodeSelectionChange: _noUse_1, // maintained for compatibility if App passes it twice
  // onEdgeDirectionChange,
  // onDeleteSelectedNodes,
  // onNodeSizeChange,
  // onNodeColorChange,

  // Node move
  onNodeMove,

  // Note count overlay
  showNoteCountOverlay = false,
  notes = {},

  // Give parent access to cy instance
  onCytoscapeInstanceReady
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Mount once
  useEffect(() => {
    if (!containerRef.current) return;

    const mountCytoscape = async () => {
      try {
        const cy = await mountCy({
          container: containerRef.current,
          graph: { nodes, edges, mapName, cdnBaseUrl },
          mode
        });

        cyRef.current = cy;

        // Initial viewport
        if (typeof initialZoom === "number") {
          cy.zoom(initialZoom);
        }
        if (initialCameraPosition && typeof initialCameraPosition.x === "number" && typeof initialCameraPosition.y === "number") {
          cy.pan(initialCameraPosition);
        }

        // Wire events immediately after Cytoscape is ready
        printDebug(`🔌 [CytoscapeGraph] Wiring events after mount`);
        const off = wireEvents(cy, {
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
        }, mode);

        // Store the cleanup function for later use
        cyRef.current._eventCleanup = off;

        if (onCytoscapeInstanceReady) onCytoscapeInstanceReady(cy);
        // Initial note-count overlay creation if enabled
        if (showNoteCountOverlay) {
          ensureNoteCountNodes(cy, notes, showNoteCountOverlay);
          updateNoteCounts(cy, notes);
        }
      } catch (error) {
        printError('Failed to initialize Cytoscape:', error);
      }
    };

    mountCytoscape();

    return () => {
      try {
        // Clean up events first
        if (cyRef.current?._eventCleanup) {
          printDebug(`🧹 [CytoscapeGraph] Cleaning up events on unmount`);
          cyRef.current._eventCleanup();
        }
        cyRef.current?.destroy();
      } catch {
        printWarn("Failed to destroy Cytoscape instance");
      }
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // Re-wire events when handlers change (but only if cytoscape is ready)
  useEffect(() => {
    printDebug(`🔌 [CytoscapeGraph] Event handlers changed, re-wiring events`);
    if (!cyRef.current) {
      printDebug(`⚠️ [CytoscapeGraph] cyRef.current is null, skipping event re-wiring`);
      return;
    }

    // Clean up existing events
    if (cyRef.current._eventCleanup) {
      printDebug(`🧹 [CytoscapeGraph] Cleaning up existing events`);
      cyRef.current._eventCleanup();
    }

    printDebug(`🔌 [CytoscapeGraph] Re-wiring events for mode: ${mode}`);
    const off = wireEvents(cyRef.current, {
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
    }, mode);

    // Store the new cleanup function
    cyRef.current._eventCleanup = off;

    // No cleanup needed here since we handle it in the next effect run or on unmount
  }, [onNodeSelectionChange, onEdgeSelectionChange, onNodeClick, onEdgeClick, onNodeDoubleClick, onEdgeDoubleClick, onBackgroundClick, onNodeMove, onZoomChange, onCameraMove, mode]);

  // Sync when domain elements change
  // Note: mode is included as dependency because it affects grabbable property in buildElements
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    printDebug(`🔄 [CytoscapeGraph] Domain sync effect triggered - checking if sync needed (mode: ${mode})`);
    printDebug(`🔍 [CytoscapeGraph] Current nodes in cytoscape: ${cy.nodes().length}, incoming nodes: ${nodes.length}`);
    printDebug(`🔍 [CytoscapeGraph] Current edges in cytoscape: ${cy.edges().length}, incoming edges: ${edges.length}`);
    
    // Check if mode changed by comparing current node grabbable state with expected
    const expectedGrabbable = mode === 'editing';
    const modeChanged = cy.nodes().length > 0 && cy.nodes()[0].grabbable() !== expectedGrabbable;
    
    if (modeChanged) {
      printDebug(`🎯 [CytoscapeGraph] Mode change detected - current grabbable: ${cy.nodes()[0].grabbable()}, expected: ${expectedGrabbable}`);
    }
    
    // Check if only positions have changed to avoid unnecessary syncs
    const currentNodes = cy.nodes().map(n => ({
      id: n.id(),
      data: n.data(),
      position: n.position()
    }));
    
    // Helper function to normalize imageUrl for comparison
    const normalizeImageUrl = (imageUrl) => {
      // Treat "unspecified", empty values, and SVG placeholders as equivalent
      if (!imageUrl || 
          imageUrl === "unspecified" || 
          imageUrl.startsWith('data:image/svg+xml')) {
        return "placeholder";
      }
      // For data URLs that are not SVG, extract a consistent representation
      if (imageUrl.startsWith('data:image/')) {
        // For non-SVG data URLs, we can't easily extract the original filename
        // but we can use a consistent hash or representation
        return "data-url-image";
      }
      // Return the filename as-is
      return imageUrl;
    };

    // Compare with incoming nodes to see if only positions changed
    const nodeStructuralChanges = nodes.some(newNode => {
      const currentNode = currentNodes.find(cn => cn.id === newNode.id);
      if (!currentNode) return true; // New node
      
      // Check if non-position data changed by comparing relevant properties
      // newNode has: {id, title, x, y, size, color, imageUrl}
      // currentNode.data has: {id, label, size, color, imageUrl, originalImageUrl} + position separate
      
      const newNodeNonPosition = {
        id: newNode.id,
        title: newNode.title,
        size: newNode.size,
        color: newNode.color,
        // Use originalImageUrl for comparison if available, fallback to imageUrl
        imageUrl: normalizeImageUrl(newNode.originalImageUrl || newNode.imageUrl)
      };
      
      const currentNodeNonPosition = {
        id: currentNode.data.id,
        title: currentNode.data.label, // Note: cytoscape uses 'label' for display
        size: currentNode.data.size,
        color: currentNode.data.color,
        // Use originalImageUrl for comparison if available, fallback to imageUrl
        imageUrl: normalizeImageUrl(currentNode.data.originalImageUrl || currentNode.data.imageUrl)
      };
      
      const isDifferent = JSON.stringify(newNodeNonPosition) !== JSON.stringify(currentNodeNonPosition);
      if (isDifferent) {
        printDebug(`🔍 [CytoscapeGraph] Structural change detected for node ${newNode.id}:`, {
          new: newNodeNonPosition,
          current: currentNodeNonPosition,
          originalNew: {
            ...newNodeNonPosition,
            imageUrl: newNode.imageUrl,
            originalImageUrl: newNode.originalImageUrl
          },
          originalCurrent: {
            ...currentNodeNonPosition,
            imageUrl: currentNode.data.imageUrl,
            originalImageUrl: currentNode.data.originalImageUrl
          },
          // Field-by-field comparison
          idMatch: newNodeNonPosition.id === currentNodeNonPosition.id,
          titleMatch: newNodeNonPosition.title === currentNodeNonPosition.title,
          sizeMatch: newNodeNonPosition.size === currentNodeNonPosition.size,
          colorMatch: newNodeNonPosition.color === currentNodeNonPosition.color,
          imageUrlMatch: newNodeNonPosition.imageUrl === currentNodeNonPosition.imageUrl
        });
      }
      return isDifferent;
    });
    
    // Check for edge structural changes (properties other than position)
    const currentEdges = cy.edges().map(e => ({
      id: e.id(),
      data: e.data()
    }));
    
    const edgeStructuralChanges = edges.some(newEdge => {
      const currentEdge = currentEdges.find(ce => ce.id === newEdge.id);
      if (!currentEdge) return true; // New edge
      
      // Compare edge properties
      const newEdgeData = {
        id: newEdge.id,
        source: newEdge.source,
        target: newEdge.target,
        direction: newEdge.direction ?? "forward"
      };
      
      const currentEdgeData = {
        id: currentEdge.data.id,
        source: currentEdge.data.source,
        target: currentEdge.data.target,
        direction: currentEdge.data.direction ?? "forward"
      };
      
      const isDifferent = JSON.stringify(newEdgeData) !== JSON.stringify(currentEdgeData);
      if (isDifferent) {
        printDebug(`🔍 [CytoscapeGraph] Edge structural change detected for edge ${newEdge.id}:`, {
          new: newEdgeData,
          current: currentEdgeData
        });
      }
      return isDifferent;
    });
    
    const nodeCountChanged = nodes.length !== currentNodes.length;
    const edgeCountChanged = edges.length !== cy.edges().length;
    
    // Force full sync if mode changed or if there are structural changes
    if (modeChanged || nodeStructuralChanges || edgeStructuralChanges || nodeCountChanged || edgeCountChanged) {
      printDebug(`🔄 [CytoscapeGraph] Sync required:`, {
        modeChanged,
        nodeStructural: nodeStructuralChanges,
        edgeStructural: edgeStructuralChanges,
        nodeCount: nodeCountChanged,
        edgeCount: edgeCountChanged
      });
      printDebug(`🔄 [CytoscapeGraph] Performing full sync`);
      syncElements(cyRef.current, { nodes, edges, mapName, cdnBaseUrl }, { mode });
    } else {
      printDebug(`🔄 [CytoscapeGraph] Only positions changed, updating positions without sync`);
      // Only update positions without triggering full sync
      let updatedCount = 0;
      let majorChange = false;
      
      nodes.forEach(node => {
        // Find the parent node (the actual draggable node in cytoscape)
        const cyNode = cy.getElementById(node.id);
        if (cyNode.length > 0) {
          const currentPos = cyNode.position();
          const deltaX = Math.abs(currentPos.x - node.x);
          const deltaY = Math.abs(currentPos.y - node.y);
          
          if (deltaX > 0.01 || deltaY > 0.01) {
            printDebug(`📍 [CytoscapeGraph] Updating position for node ${node.id}: (${currentPos.x}, ${currentPos.y}) -> (${node.x}, ${node.y})`);
            cyNode.position({ x: node.x, y: node.y });
            updatedCount++;
            
            // If this is a large coordinate change (like from rotation), mark as major change
            if (deltaX > 10 || deltaY > 10) {
              majorChange = true;
            }
          }
        }
      });
      
      printDebug(`📍 [CytoscapeGraph] Updated positions for ${updatedCount} nodes (major change: ${majorChange})`);
      
      // If we updated any positions and it was a major change, force a refresh
      if (updatedCount > 0 && majorChange) {
        printDebug(`🔄 [CytoscapeGraph] Major position changes detected, forcing layout refresh`);
        // Force a full sync instead for major changes like rotation
        syncElements(cyRef.current, { nodes, edges, mapName, cdnBaseUrl }, { mode });
      } else if (updatedCount > 0) {
        // For minor position changes, just trigger a layout refresh
        //// TODO: troubleshoot performance with fit calls
        //// console.log("Forcing Cytoscape layout refresh after position updates");
        cy.fit(cy.nodes(), 0); // Fit without padding to refresh layout
        cy.center(); // Re-center the view
      }
    }
  }, [nodes, edges, mode, mapName, cdnBaseUrl, showNoteCountOverlay, notes]);

  // Sync selections when app state changes
  useEffect(() => {
    if (!cyRef.current) return;
    
    const cy = cyRef.current;
    
    // Get currently selected elements in Cytoscape
    const currentSelectedNodes = cy.$("node:selected").map(n => n.id());
    const currentSelectedEdges = cy.$("edge:selected").map(e => e.id());
    
    // Check if selections are out of sync
    const nodeSelectionsMatch = 
      currentSelectedNodes.length === selectedNodeIds.length &&
      currentSelectedNodes.every(id => selectedNodeIds.includes(id));
    
    const edgeSelectionsMatch = 
      currentSelectedEdges.length === selectedEdgeIds.length &&
      currentSelectedEdges.every(id => selectedEdgeIds.includes(id));
    
    if (!nodeSelectionsMatch || !edgeSelectionsMatch) {
      // Clear all selections first
      cy.elements().unselect();
      
      // Apply new selections
      selectedNodeIds.forEach(nodeId => {
        const node = cy.getElementById(nodeId);
        if (node.length > 0) {
          node.select();
        }
      });
      
      selectedEdgeIds.forEach(edgeId => {
        const edge = cy.getElementById(edgeId);
        if (edge.length > 0) {
          edge.select();
        }
      });
    }
  }, [selectedNodeIds, selectedEdgeIds]);

  // Fit request
  useEffect(() => {
    if (!cyRef.current || !shouldFitOnNextRender) return;
    const id = setTimeout(() => {
      try {
        const cy = cyRef.current;
        //// TODO: troubleshoot performance with fit calls
        //// console.log("Forcing Cytoscape layout refresh after fit request");
        cy.fit(cy.nodes(), 50);
        onFitCompleted && onFitCompleted();
      } catch {
        printWarn("Failed to fit Cytoscape instance");
      }
    }, 50);
    return () => clearTimeout(id);
  }, [shouldFitOnNextRender, onFitCompleted]);

  // Periodic check for completed grayscale image conversions
  useEffect(() => {
    if (!cyRef.current) return;
    
    const interval = setInterval(() => {
      if (hasPendingGrayscaleConversions()) {
        const updated = updateCompletedGrayscaleImages(cyRef.current, { nodes, edges, mapName, cdnBaseUrl });
        if (updated) {
          // Force a redraw without changing layout or camera
          cyRef.current.forceRender();
        }
      }
    }, 500); // Check every 500ms
    
    return () => clearInterval(interval);
  }, [nodes, edges, mapName, cdnBaseUrl]);

  // Immediate grabbable toggle on mode change (belt & suspenders)
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
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

  // Note count overlay management (Cytoscape child nodes instead of HTML overlays)
  useEffect(() => {
    if (!cyRef.current) return; const cy = cyRef.current;
    ensureNoteCountNodes(cy, notes, showNoteCountOverlay);
    updateNoteCounts(cy, notes);
    cy.on('add remove', () => { ensureNoteCountNodes(cy, notes, showNoteCountOverlay); });
    return () => { cy.off('add remove'); };
  }, [showNoteCountOverlay, notes]);

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
