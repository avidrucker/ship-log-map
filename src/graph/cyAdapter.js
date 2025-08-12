// src/graph/cyAdapter.js
import cytoscape from "cytoscape";
import cytoscapeStyles from "../cytoscapeStyles.js";
import { deserializeGraph } from "./ops.js";
import { TEST_ICON_SVG } from "../constants/testAssets.js";

// Convert domain graph -> Cytoscape elements
export function buildElementsFromDomain(graph, options = {}) {
  const { mode = 'editing' } = options;
  const g = deserializeGraph(graph);

  const nodes = g.nodes.map(n => ({
    group: "nodes",
    data: {
      id: n.id,
      label: n.title ?? "",
      color: n.color ?? "gray",
      size: n.size ?? "regular",
      imageUrl: n.imageUrl || TEST_ICON_SVG
    },
    position: { x: n.x, y: n.y },
    selectable: true,
    grabbable: mode === 'editing' // Only grabbable in editing mode
  }));

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
export function mountCy({ container, graph, styles = cytoscapeStyles, mode = 'editing' }) {
  const elements = buildElementsFromDomain(graph, { mode });
  const cy = cytoscape({
    container,
    style: styles,
    elements,
    selectionType: mode === 'editing' ? "additive" : "single", // Dynamic selection based on mode
    wheelSensitivity: 0.2,
    pixelRatio: 1
  });
  return cy;
}

// Replace elements with a fresh build from the domain state
export function syncElements(cy, graph, options = {}) {
  const elements = buildElementsFromDomain(graph, options);
  cy.json({ elements }); // full resync (simple & predictable for now)
  return cy;
}

// Wire common events; handlers are optional
export function wireEvents(cy, handlers = {}, mode = 'editing') {
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

  // Selection updates
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

  // Mode-specific selection behavior - only for playing mode
  if (mode === 'playing') {
    // In playing mode: when something gets selected, unselect everything else
    cy.on('select', (evt) => {
      if (evt.target.isNode() || evt.target.isEdge()) {
        const selectedElement = evt.target;
        // Use setTimeout to avoid interfering with the current selection event
        setTimeout(() => {
          // Unselect all other elements, keeping only the current one
          cy.elements().not(selectedElement).unselect();
        }, 0);
      }
    });
  }
  // In editing mode, don't add any custom selection behavior - let Cytoscape handle it

  // Clicks for functionality (not selection)
  cy.on("tap", "node", (evt) => {
    if (mode === 'playing') {
      const clickedNode = evt.target;
      // In playing mode, if the node is already selected, deselect it
      // We need to check the selection state before the tap event processes
      const wasSelected = clickedNode.selected();
      
      // Use setTimeout to check after the selection has been processed
      setTimeout(() => {
        if (wasSelected) {
          // If it was selected before the click, deselect it now
          clickedNode.unselect();
          return; // Don't call onNodeClick when deselecting
        } else {
          // If it wasn't selected before, call the click handler
          if (onNodeClick) onNodeClick(evt.target.id(), "node");
        }
      }, 0);
      return; // Exit early to prevent immediate onNodeClick call
    }
    if (onNodeClick) onNodeClick(evt.target.id(), "node");
  });

  cy.on("tap", "edge", (evt) => {
    if (mode === 'playing') {
      const clickedEdge = evt.target;
      // In playing mode, if the edge is already selected, deselect it
      // We need to check the selection state before the tap event processes
      const wasSelected = clickedEdge.selected();
      
      // Use setTimeout to check after the selection has been processed
      setTimeout(() => {
        if (wasSelected) {
          // If it was selected before the click, deselect it now
          clickedEdge.unselect();
          return; // Don't call onEdgeClick when deselecting
        } else {
          // If it wasn't selected before, call the click handler
          if (onEdgeClick) onEdgeClick(evt.target.id(), "edge");
        }
      }, 0);
      return; // Exit early to prevent immediate onEdgeClick call
    }
    if (onEdgeClick) onEdgeClick(evt.target.id(), "edge");
  });

  // Background clicks to deselect and call handler
  cy.on("tap", (evt) => {
    if (evt.target === cy) {
      // Background click - deselect all elements
      cy.elements().unselect();
      if (onBackgroundClick) onBackgroundClick();
    }
  });

  // Double-click for node size cycling
  cy.on("dbltap", "node", (evt) => {
    if (onNodeDoubleClick) {
      onNodeDoubleClick(evt.target.id());
    }
  });

  // Double-click for edge direction cycling
  cy.on("dbltap", "edge", (evt) => {
    if (onEdgeDoubleClick) {
      onEdgeDoubleClick(evt.target.id());
    }
  });

  // Position / drag end
  cy.on("dragfree", "node", (evt) => {
    if (onNodeMove) {
      const n = evt.target;
      const { x, y } = n.position();
      onNodeMove(n.id(), { x, y });
    }
  });

  // Viewport
  cy.on("viewport", () => {
    if (onZoomChange) onZoomChange(cy.zoom());
    if (onCameraMove) {
      const pan = cy.pan();
      onCameraMove({ x: pan.x, y: pan.y });
    }
  });

  // Cursor handling for nodes and edges
  cy.on("mouseover", "node, edge", (evt) => {
    evt.cy.container().style.cursor = "pointer";
  });

  cy.on("mouseout", "node, edge", (evt) => {
    evt.cy.container().style.cursor = "default";
  });

  return () => {
    cy.removeListener("select");
    cy.removeListener("unselect");
    cy.removeListener("tap");
    cy.removeListener("dbltap");
    cy.removeListener("dragfree");
    cy.removeListener("viewport");
    cy.removeListener("mouseover");
    cy.removeListener("mouseout");
  };
}
