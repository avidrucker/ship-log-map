import { useEffect, useMemo, useState } from 'react';
import { extractHashtagsFromText, normalizeTag, tokenizeQuery } from './hashtagUtils';

// Default extractors; override via props if your shapes differ
const defaultNodeNotes = node => {
  // e.g., node.note (string) or node.notes (array)
  const parts = [];
  if (node?.note) parts.push(node.note);
  if (Array.isArray(node?.notes)) parts.push(...node.notes);
  return parts.join('\n');
};

const defaultEdgeNotes = edge => {
  if (edge?.note) return edge.note;
  if (Array.isArray(edge?.notes)) return edge.notes.join('\n');
  return '';
};

export function useHashtagIndex({
  nodes = [],
  edges = [],
  getNodeNotes = defaultNodeNotes,
  getEdgeNotes = defaultEdgeNotes
}) {
  const [index, setIndex] = useState(() => new Map()); // tag -> { nodes:Set, edges:Set }
  const [allTagsSorted, setAllTagsSorted] = useState([]);

  useEffect(() => {
    const map = new Map();

    // index nodes
    for (const n of nodes) {
      const tags = extractHashtagsFromText(getNodeNotes(n));
      for (const t of tags) {
        const entry = map.get(t) || { nodes: new Set(), edges: new Set() };
        entry.nodes.add(n.id);
        map.set(t, entry);
      }
    }

    // index edges
    for (const e of edges) {
      const tags = extractHashtagsFromText(getEdgeNotes(e));
      for (const t of tags) {
        const entry = map.get(t) || { nodes: new Set(), edges: new Set() };
        entry.edges.add(e.id);
        map.set(t, entry);
      }
    }

    const sorted = Array.from(map.keys()).sort(); // for suggestions
    setIndex(map);
    setAllTagsSorted(sorted);
  }, [nodes, edges, getNodeNotes, getEdgeNotes]);

  // Prefix suggestions for the "current word" being typed
  function getSuggestions(prefix, limit = 12) {
    const p = (prefix || '').toLowerCase();
    if (!p) return [];
    const out = [];
    for (const tag of allTagsSorted) {
      if (tag.startsWith(p)) {
        out.push('#' + tag);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // AND semantics across tokens; each token is a prefix over hashtag names
  function findMatchesFromTokens(tokens) {
    if (!tokens.length) return { nodeIds: new Set(), edgeIds: new Set() };

    // For each token, build the union of IDs that have a hashtag starting with that token
    const perTokenNodeSets = [];
    const perTokenEdgeSets = [];

    for (const tok of tokens) {
      const t = tok.toLowerCase();
      const nodeUnion = new Set();
      const edgeUnion = new Set();

      for (const [tag, { nodes: ns, edges: es }] of index.entries()) {
        if (tag.startsWith(t)) {
          ns.forEach(id => nodeUnion.add(id));
          es.forEach(id => edgeUnion.add(id));
        }
      }
      perTokenNodeSets.push(nodeUnion);
      perTokenEdgeSets.push(edgeUnion);
    }

    // Intersect across tokens (AND)
    const nodeIds = intersectSets(perTokenNodeSets);
    const edgeIds = intersectSets(perTokenEdgeSets);
    return { nodeIds, edgeIds };
  }

  return {
    index,                // Map(tag -> {nodes:Set, edges:Set})
    allTagsSorted,        // [string]
    getSuggestions,
    findMatchesFromTokens,
    tokenizeQuery         // re-export for convenience
  };
}

function intersectSets(sets) {
  if (!sets.length) return new Set();
  let acc = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    const next = sets[i];
    const tmp = new Set();
    acc.forEach(v => { if (next.has(v)) tmp.add(v); });
    acc = tmp;
    if (acc.size === 0) break;
  }
  return acc;
}
