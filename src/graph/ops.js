// src/graph/ops.js

/**
 * Graph Operations (pure data transforms)
 *
 * Responsibilities
 * - CRUD and batch transforms for nodes/edges independent of rendering layer.
 * - Spatial utilities (e.g., rotate, translate, align), id generation,
 *   normalization helpers used by App/reducer and tests.
 *
 * Exports (examples)
 * - addNode(nodes, newNode)
 * - addEdge(edges, newEdge)
 * - deleteNodes(nodes, edges, ids)
 * - rotateNodes90Clockwise(nodes), incrementOrientationBy90(orientation)
 *
 * Gotchas
 * - Functions are PURE; do not reach into Cytoscape or window.
 * - Validate coordinates and skip malformed nodes gracefully.
 */

import { TEST_ICON_SVG } from "../constants/testAssets.js";
import { printDebug } from "../utils/debug.js";

// Utility: create a stable edge id from endpoints
export function edgeId(source, target) {
  return `${source}__${target}`;
}

// Normalize graph to { nodes, edges, notes, mode, mapName, cdnBaseUrl }
export function normalizeGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const notes = graph?.notes && typeof graph.notes === "object" ? graph.notes : {};
  const mode = typeof graph?.mode === "string" ? graph.mode : "editing";
  const mapName = typeof graph?.mapName === "string" ? graph.mapName : "default_map";
  const cdnBaseUrl = typeof graph?.cdnBaseUrl === "string" ? graph.cdnBaseUrl : "";
  const orientation = Number.isFinite(graph?.orientation) ? ((graph.orientation % 360) + 360) % 360 : 0;
  const compassVisible = typeof graph?.compassVisible === "boolean" ? graph.compassVisible : true;
  const bgImage = (graph && typeof graph.bgImage === 'object' && graph.bgImage !== null)
    ? graph.bgImage
    : { included: false, imageUrl: "", x: 0, y: 0, scale: 100, opacity: 100, visible: false };
  return { nodes, edges, notes, mode, mapName, cdnBaseUrl, orientation, compassVisible, bgImage };
}

// Add node
export function addNode(graph, { id, title, x, y, size = "regular", color = "gray", imageUrl = TEST_ICON_SVG }) {
  const g = normalizeGraph(graph);
  if (g.nodes.find(n => n.id === id)) return g; // no-op if exists
  return {
    ...g,
    nodes: [...g.nodes, { id, title, x, y, size, color, imageUrl }]
  };
}

// Helper: Generate a valid ID from title text
export function generateIdFromTitle(title) {
  // Handle empty or whitespace-only titles
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return 'node'; // Default fallback
  }
  
  // Replace spaces with underscores and remove any other problematic characters
  // Keep only alphanumeric characters and underscores
  const cleanId = title.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  
  // If the cleaning process results in an empty string, use fallback
  return cleanId || 'node';
}

// Helper: Find a unique ID by appending numbers if needed
export function findUniqueId(graph, baseId, excludeId = null) {
  const g = normalizeGraph(graph);
  const existingIds = new Set(g.nodes.map(n => n.id).filter(id => id !== excludeId));
  
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  
  let counter = 1;
  let candidateId = `${baseId}${counter}`;
  
  while (existingIds.has(candidateId)) {
    counter++;
    candidateId = `${baseId}${counter}`;
  }
  
  return candidateId;
}

// Remove node and connected edges
export function removeNodeAndEdges(graph, nodeId) {
  const g = normalizeGraph(graph);
  return {
    ...g,
    nodes: g.nodes.filter(n => n.id !== nodeId),
    edges: g.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    notes: Object.fromEntries(Object.entries(g.notes).filter(([k]) => k !== nodeId))
  };
}

// Rename node title and update ID to match, with cascade updates
// note: the renameNode function preserves edge notes when edge IDs change
export function renameNode(graph, nodeId, newTitle) {
  const g = normalizeGraph(graph);
  
  // Find the node to rename
  const nodeToRename = g.nodes.find(n => n.id === nodeId);
  if (!nodeToRename) {
    console.warn(`renameNode: Node with ID "${nodeId}" not found`);
    return g; // Node not found, no-op
  }
  
  // Generate new ID from title
  const baseNewId = generateIdFromTitle(newTitle);
  const newId = findUniqueId(g, baseNewId, nodeId);
  
  printDebug(`renameNode: Renaming node "${nodeId}" to title "${newTitle}", new ID: "${newId}"`);
  
  // If the ID doesn't change, just update the title
  if (newId === nodeId) {
    printDebug(`renameNode: ID unchanged, only updating title`);
    return {
      ...g,
      nodes: g.nodes.map(n => (n.id === nodeId ? { ...n, title: newTitle } : n))
    };
  }
  
  printDebug(`renameNode: ID changed from "${nodeId}" to "${newId}", updating all references`);
  
  // Update node with new ID and title
  const updatedNodes = g.nodes.map(n => 
    n.id === nodeId ? { ...n, id: newId, title: newTitle } : n
  );
  
  // Track edge ID changes for notes transfer
  const edgeIdChanges = new Map(); // oldEdgeId -> newEdgeId
  
  // Update all edges that reference the old node ID
  const updatedEdges = g.edges.map(e => {
    const newEdge = { ...e };
    let edgeChanged = false;
    
    // Update source references
    if (e.source === nodeId) {
      newEdge.source = newId;
      edgeChanged = true;
      printDebug(`renameNode: Updated edge source from "${nodeId}" to "${newId}" for edge "${e.id}"`);
    }
    
    // Update target references
    if (e.target === nodeId) {
      newEdge.target = newId;
      edgeChanged = true;
      printDebug(`renameNode: Updated edge target from "${nodeId}" to "${newId}" for edge "${e.id}"`);
    }
    
    // Regenerate edge ID if it was affected
    if (edgeChanged) {
      const oldEdgeId = newEdge.id;
      newEdge.id = edgeId(newEdge.source, newEdge.target);
      edgeIdChanges.set(oldEdgeId, newEdge.id);
      printDebug(`renameNode: Updated edge ID from "${oldEdgeId}" to "${newEdge.id}"`);
    }
    
    return newEdge;
  });
  
  // Update notes object - move notes from old IDs to new IDs
  const updatedNotes = { ...g.notes };
  
  // Move node notes
  if (updatedNotes[nodeId]) {
    updatedNotes[newId] = updatedNotes[nodeId];
    delete updatedNotes[nodeId];
    printDebug(`renameNode: Moved node notes from "${nodeId}" to "${newId}"`);
  }
  
  // Move edge notes when edge IDs change
  edgeIdChanges.forEach((newEdgeId, oldEdgeId) => {
    if (updatedNotes[oldEdgeId]) {
      updatedNotes[newEdgeId] = updatedNotes[oldEdgeId];
      delete updatedNotes[oldEdgeId];
      printDebug(`renameNode: Moved edge notes from "${oldEdgeId}" to "${newEdgeId}"`);
    }
  });
  
  return {
    ...g,
    nodes: updatedNodes,
    edges: updatedEdges,
    notes: updatedNotes
  };
}

// Set/patch node meta
export function setNodeMeta(graph, nodeId, patch) {
  const g = normalizeGraph(graph);
  return {
    ...g,
    nodes: g.nodes.map(n => (n.id === nodeId ? { ...n, ...patch } : n))
  };
}

// Add or replace an edge (id derived from endpoints)
export function connectNodes(graph, source, target, direction = "forward") {
  const g = normalizeGraph(graph);
  const id = edgeId(source, target);
  const nextEdges = g.edges.filter(e => edgeId(e.source, e.target) !== id);
  nextEdges.push({ id, source, target, direction });
  return { ...g, edges: nextEdges };
}

// Remove an edge (by id or by pair)
export function disconnectNodes(graph, idOrPair) {
  const g = normalizeGraph(graph);
  let predicate;

  if (typeof idOrPair === "string") {
    const id = idOrPair;
    predicate = (e) => (e.id ? e.id !== id : edgeId(e.source, e.target) !== id);
  } else if (idOrPair && idOrPair.source && idOrPair.target) {
    const id = edgeId(idOrPair.source, idOrPair.target);
    predicate = (e) => (e.id ? e.id !== id : edgeId(e.source, e.target) !== id);
  } else {
    return g;
  }

  return { ...g, edges: g.edges.filter(predicate) };
}

// Patch edge meta by id (or by pair)
export function setEdgeMeta(graph, idOrPair, patch) {
  const g = normalizeGraph(graph);
  const match = (e) => {
    if (typeof idOrPair === "string") {
      return (e.id ? e.id === idOrPair : edgeId(e.source, e.target) === idOrPair);
    }
    if (idOrPair && idOrPair.source && idOrPair.target) {
      return edgeId(e.source, e.target) === edgeId(idOrPair.source, idOrPair.target);
    }
    return false;
  };
  return {
    ...g,
    edges: g.edges.map(e => (match(e) ? { ...e, ...patch, id: e.id || edgeId(e.source, e.target) } : e))
  };
}

// Serialization helpers
export function serializeGraph(graph) {
  const g = normalizeGraph(graph);
  // keep clean shape
  const out = {
    nodes: g.nodes,
    edges: g.edges,
    notes: g.notes,
    mode: g.mode,
    mapName: g.mapName,
    cdnBaseUrl: g.cdnBaseUrl,
    orientation: g.orientation,
    compassVisible: g.compassVisible
  };
  if (g.bgImage) {
    out.bgImage = {
      included: !!g.bgImage.included,
      imageUrl:
        (typeof g.bgImage.imageUrl === "string" && g.bgImage.imageUrl.startsWith("data:"))
          ? "" // don’t write huge data URLs
          : (g.bgImage.imageUrl || ""),
      x: Number.isFinite(g.bgImage.x) ? g.bgImage.x : 0,
      y: Number.isFinite(g.bgImage.y) ? g.bgImage.y : 0,
      scale: Number.isFinite(g.bgImage.scale) ? g.bgImage.scale : 100,
      opacity: Number.isFinite(g.bgImage.opacity) ? g.bgImage.opacity : 100,
      visible: typeof g.bgImage.visible === "boolean"
        ? g.bgImage.visible
        : !!g.bgImage.included
    };
  }
  return JSON.stringify(out, null, 2);
}


// Accepts an object (already parsed) or a string
export function deserializeGraph(input) {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const g = normalizeGraph(parsed);

  // Backfill defaults
  const nodes = g.nodes.map(n => ({
    id: n.id,
    title: n.title ?? n.label ?? "",
    x: typeof n.x === "number" ? n.x : 0,
    y: typeof n.y === "number" ? n.y : 0,
    size: n.size ?? "regular",
    color: n.color ?? "gray",
    imageUrl: n.imageUrl || TEST_ICON_SVG
  }));

  const edges = g.edges.map(e => ({
    id: e.id || edgeId(e.source, e.target),
    source: e.source,
    target: e.target,
    direction: e.direction ?? "forward"
  }));

  const notes = g.notes;
  const mode = g.mode;
  const mapName = g.mapName;
  const cdnBaseUrl = g.cdnBaseUrl;
  const orientation = g.orientation;
  const compassVisible = g.compassVisible;
  const bgImage = {
    included: !!g.bgImage?.included,
    imageUrl: typeof g.bgImage?.imageUrl === "string" ? g.bgImage.imageUrl : "",
    x: Number.isFinite(g.bgImage?.x) ? g.bgImage.x : 0,
    y: Number.isFinite(g.bgImage?.y) ? g.bgImage.y : 0,
    scale: Number.isFinite(g.bgImage?.scale) ? g.bgImage.scale : 100,
    opacity: Number.isFinite(g.bgImage?.opacity) ? g.bgImage.opacity : 100,
    visible: typeof g.bgImage?.visible === "boolean" ? g.bgImage.visible : !!g.bgImage?.included
  };

  return { nodes, edges, notes, mode, mapName, cdnBaseUrl, orientation, compassVisible, bgImage };
}
