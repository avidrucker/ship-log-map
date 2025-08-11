// src/CytoscapeGraph.jsx
import React, { useEffect, useRef } from "react";
import { mountCy, syncElements, wireEvents } from "./graph/cyAdapter.js";

// Keep the same props your App already passes in
function CytoscapeGraph({
  nodes = [],
  edges = [],

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

  // Give parent access to cy instance
  onCytoscapeInstanceReady
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Mount once
  useEffect(() => {
    if (!containerRef.current) return;

    cyRef.current = mountCy({
      container: containerRef.current,
      graph: { nodes, edges }
    });

    // Initial viewport
    if (typeof initialZoom === "number") {
      cyRef.current.zoom(initialZoom);
    }
    if (initialCameraPosition && typeof initialCameraPosition.x === "number" && typeof initialCameraPosition.y === "number") {
      cyRef.current.pan(initialCameraPosition);
    }

    if (onCytoscapeInstanceReady) onCytoscapeInstanceReady(cyRef.current);

    return () => {
      try {
        cyRef.current?.destroy();
      } catch {
        console.warn("Failed to destroy Cytoscape instance");
      }
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // Wire events when handlers change
  useEffect(() => {
    if (!cyRef.current) return;

    const off = wireEvents(cyRef.current, {
      onNodeSelectionChange,
      onEdgeSelectionChange,
      onNodeDoubleClick,
      onEdgeDoubleClick,
      onBackgroundClick,
      onNodeMove,
      onZoomChange,
      onCameraMove
    });

    return () => {
      off?.();
    };
  }, [onNodeSelectionChange, onEdgeSelectionChange, onNodeDoubleClick, onEdgeDoubleClick, onBackgroundClick, onNodeMove, onZoomChange, onCameraMove]);

  // Sync when domain elements change
  useEffect(() => {
    if (!cyRef.current) return;
    syncElements(cyRef.current, { nodes, edges });
  }, [nodes, edges]);

  // Fit request
  useEffect(() => {
    if (!cyRef.current || !shouldFitOnNextRender) return;
    const id = setTimeout(() => {
      try {
        const cy = cyRef.current;
        cy.fit(cy.nodes(), 50);
        onFitCompleted && onFitCompleted();
      } catch {
        console.warn("Failed to fit Cytoscape instance");
      }
    }, 50);
    return () => clearTimeout(id);
  }, [shouldFitOnNextRender, onFitCompleted]);

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

export default CytoscapeGraph;
