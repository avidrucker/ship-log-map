// src/graph/ops.js
import { TEST_ICON_SVG } from "../constants/testAssets.js";

// Utility: create a stable edge id from endpoints
export function edgeId(source, target) {
  return `${source}__${target}`;
}

// Normalize graph to { nodes, edges, notes, mode }
export function normalizeGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const notes = graph?.notes && typeof graph.notes === "object" ? graph.notes : {};
  const mode = typeof graph?.mode === "string" ? graph.mode : "editing";
  return { nodes, edges, notes, mode };
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

// Rename node title
export function renameNode(graph, nodeId, newTitle) {
  const g = normalizeGraph(graph);
  return {
    ...g,
    nodes: g.nodes.map(n => (n.id === nodeId ? { ...n, title: newTitle } : n))
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
  return JSON.stringify({ nodes: g.nodes, edges: g.edges, notes: g.notes, mode: g.mode }, null, 2);
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

  return { nodes, edges, notes, mode };
}
