// src/utils/visitedStore.js
/**
 * VisitedStore — persist "visited" node/edge IDs per map in localStorage.
 * Shape:
 *   { nodes: Set<string>, edges: Set<string> }
 *
 * Storage key: shiplog.visited.v1:<mapName>
 */

const VERSION = 'v1';
const KEY = (mapName) => `shiplog.visited.${VERSION}:${mapName || 'default_map'}`;

function toArrays(visited) {
  return {
    nodes: Array.from(visited?.nodes ?? []),
    edges: Array.from(visited?.edges ?? []),
  };
}

function toSets(obj) {
  return {
    nodes: new Set(Array.isArray(obj?.nodes) ? obj.nodes : []),
    edges: new Set(Array.isArray(obj?.edges) ? obj.edges : []),
  };
}

export function loadVisited(mapName) {
  try {
    const raw = localStorage.getItem(KEY(mapName));
    if (!raw) return { nodes: new Set(), edges: new Set() };
    return toSets(JSON.parse(raw));
  } catch {
    return { nodes: new Set(), edges: new Set() };
  }
}

export function saveVisited(mapName, visited) {
  try {
    localStorage.setItem(KEY(mapName), JSON.stringify(toArrays(visited)));
  } catch {
    // Best effort: ignore quota/serialisation errors
  }
}

export function clearVisited(mapName) {
  try {
    localStorage.removeItem(KEY(mapName));
  } catch { /* noop */ }
}
