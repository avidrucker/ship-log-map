// src/graph/cyAdapter.js
import cytoscape from "cytoscape";
import cytoscapeStyles from "../cytoscapeStyles.js";
import { deserializeGraph } from "./ops.js";
import { TEST_ICON_SVG } from "../constants/testAssets.js";
import { GRAYSCALE_IMAGES } from "../config/features.js";
import { convertImageToGrayscale } from "../utils/grayscaleUtils.js";

// Cache for grayscale images to avoid reprocessing
const grayscaleCache = new Map();
const pendingConversions = new Set();

// Preprocess images to grayscale in the background to avoid race conditions
function preprocessImageToGrayscale(imageUrl) {
  if (!GRAYSCALE_IMAGES || !imageUrl || imageUrl === TEST_ICON_SVG) {
    return Promise.resolve(imageUrl);
  }
  
  if (grayscaleCache.has(imageUrl)) {
    return Promise.resolve(grayscaleCache.get(imageUrl));
  }
  
  // Start conversion in background, but don't wait for it
  const conversionPromise = convertImageToGrayscale(imageUrl)
    .then(grayscaleUrl => {
      grayscaleCache.set(imageUrl, grayscaleUrl);
      pendingConversions.delete(imageUrl);
      return grayscaleUrl;
    })
    .catch(error => {
      console.warn('Failed to convert image to grayscale:', error);
      grayscaleCache.set(imageUrl, imageUrl); // Cache the original to avoid retrying
      pendingConversions.delete(imageUrl);
      return imageUrl;
    });
  
  pendingConversions.add(imageUrl);
  grayscaleCache.set(imageUrl, conversionPromise);
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
  const { mode = 'editing' } = options;
  const g = deserializeGraph(graph);

  // Process nodes - use cached grayscale images if available, original otherwise
  const nodes = g.nodes.map(n => {
    let imageUrl = n.imageUrl || TEST_ICON_SVG;
    
    // Use cached grayscale if available, otherwise use original and preprocess in background
    if (GRAYSCALE_IMAGES && imageUrl && imageUrl !== TEST_ICON_SVG) {
      const cached = grayscaleCache.get(imageUrl);
      if (cached && typeof cached === 'string') {
        // We have a processed grayscale URL
        imageUrl = cached;
      } else if (cached && cached instanceof Promise) {
        // Conversion is in progress, use original for now and trigger update later
        cached.then(() => {
          // Trigger a gentle update when conversion completes
          // This will be handled by the component's update cycle
        });
      } else {
        // Start preprocessing in background
        preprocessImageToGrayscale(imageUrl);
      }
    }
    
    return {
      group: "nodes",
      data: {
        id: n.id,
        label: n.title ?? "",
        color: n.color ?? "gray",
        size: n.size ?? "regular",
        imageUrl: imageUrl
      },
      position: { x: n.x, y: n.y },
      selectable: true,
      grabbable: mode === 'editing' // Only grabbable in editing mode
    };
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
export function mountCy({ container, graph, styles = cytoscapeStyles, mode = 'editing' }) {
  const elements = buildElementsFromDomain(graph, { mode });
  const cy = cytoscape({
    container,
    style: styles,
    elements,
    selectionType: mode === 'editing' ? "additive" : "single", // Dynamic selection based on mode
    wheelSensitivity: 0.2,
    pixelRatio: 1,
    layout: { name: 'preset' } // Use preset layout to preserve node positions
  });
  return cy;
}

// Replace elements with a fresh build from the domain state
export function syncElements(cy, graph, options = {}) {
  const newElements = buildElementsFromDomain(graph, options);
  
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
          // Update node data without changing position
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
