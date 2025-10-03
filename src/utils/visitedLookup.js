// src/utils/visitedLookup.js

/**
 * makeVisitedLookup
 * Returns a stable function isUnseen(id) that determines whether an id is unseen
 * by checking if it is a node or edge and then consulting the visited Sets.
 *
 * - nodes: [{ id }]
 * - edges: [{ id }]
 * - visited: { nodes: Set<string>, edges: Set<string> }
 */
export function makeVisitedLookup({ nodes = [], edges = [], visited }) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeIds = new Set(edges.map(e => e.id));

  return function isUnseen(id) {
    if (!id || !visited) return false;
    if (nodeIds.has(id)) return !visited.nodes.has(id);
    if (edgeIds.has(id)) return !visited.edges.has(id);
    return false; // unknown id
  };
}
