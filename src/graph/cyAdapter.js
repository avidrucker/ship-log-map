// src/graph/cyAdapter.js
import cytoscape from "cytoscape";
import cytoscapeStyles from "../cytoscapeStyles.js";
import { deserializeGraph } from "./ops.js";
import { TEST_ICON_SVG } from "../constants/testAssets.js";

// Convert domain graph -> Cytoscape elements
export function buildElementsFromDomain(graph) {
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
    grabbable: true
  }));

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
export function mountCy({ container, graph, styles = cytoscapeStyles }) {
  const elements = buildElementsFromDomain(graph);
  const cy = cytoscape({
    container,
    style: styles,
    elements,
    selectionType: "single",
    wheelSensitivity: 0.2,
    pixelRatio: 1
  });
  return cy;
}

// Replace elements with a fresh build from the domain state
export function syncElements(cy, graph) {
  const elements = buildElementsFromDomain(graph);
  cy.json({ elements }); // full resync (simple & predictable for now)
  return cy;
}

// Wire common events; handlers are optional
export function wireEvents(cy, handlers = {}) {
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

  // Clicks
  cy.on("tap", "node", (evt) => {
    if (onNodeClick) onNodeClick(evt.target.id(), "node");
  });

  cy.on("tap", "edge", (evt) => {
    if (onEdgeClick) onEdgeClick(evt.target.id(), "edge");
  });

  cy.on("tap", (evt) => {
    if (evt.target === cy && onBackgroundClick) onBackgroundClick();
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
