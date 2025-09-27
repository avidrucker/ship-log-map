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
  const [hashtagIndex, setHashtagIndex] = useState(() => new Map()); // tag -> { nodes:Set, edges:Set }
  const [labelIndex, setLabelIndex] = useState(() => new Map()); // label word -> Set(nodeIds)
  const [allTagsSorted, setAllTagsSorted] = useState([]);
  const [allLabelsSorted, setAllLabelsSorted] = useState([]);

  useEffect(() => {
    const tagMap = new Map();
    const labelMap = new Map();

    // console.log('🔍 Indexing nodes:', nodes.length);
    // console.log('🔍 First few nodes:', nodes.slice(0, 3));
    // console.log('🔍 Indexing edges:', edges.length);
    // console.log('🔍 First few edges:', edges.slice(0, 3));

    // Index hashtags from notes
    for (const n of nodes) {

      // if (nodes.indexOf(n) < 5) {
      //   console.log(`🔍 Node ${n.id}:`, n);
      //   console.log(`🔍 Node data:`, n);
      //   console.log(`🔍 Node label:`, n.label);
      //   console.log(`🔍 Node title:`, n.title);
      // }

      const tags = extractHashtagsFromText(getNodeNotes(n));
      for (const t of tags) {
        const entry = tagMap.get(t) || { nodes: new Set(), edges: new Set() };
        entry.nodes.add(n.id);
        tagMap.set(t, entry);
      }

      // Index node labels - store full place names with partial matching
      if (n.title) {
        const fullName = n.title.toLowerCase().trim();
        
        // Don't index if empty
        if (!fullName) continue;
        
        // Index the full place name
        if (!labelMap.has(fullName)) {
          labelMap.set(fullName, new Set());
        }
        labelMap.get(fullName).add(n.id);
        
        // Also index each word as a prefix searcher for the full name
        // This allows "ka" to find "The Ka" and "mana" to find "The Mana Hut"
        const words = fullName.split(/\s+/).filter(word => word.length > 0);
        
        for (const word of words) {
          // Skip very common words that would create noise
          if (['the', 'hale', 'a', 'an', 'of', 'in', 'at', 'on', 'to'].includes(word)) {
            continue;
          }
          
          // Index this word as pointing to the full place name
          // Key insight: we store the full name as the searchable term, not the word
          if (!labelMap.has(word)) {
            labelMap.set(word, new Set());
          }
          labelMap.get(word).add(n.id);
        }
      }

    }

    // Index hashtags from edge notes
    for (const e of edges) {
      const tags = extractHashtagsFromText(getEdgeNotes(e));
      for (const t of tags) {
        const entry = tagMap.get(t) || { nodes: new Set(), edges: new Set() };
        entry.edges.add(e.id);
        tagMap.set(t, entry);
      }
    }

    const sortedTags = Array.from(tagMap.keys()).sort();
    const sortedLabels = Array.from(labelMap.keys()).sort();
    
    setHashtagIndex(tagMap);
    setLabelIndex(labelMap);
    setAllTagsSorted(sortedTags);
    setAllLabelsSorted(sortedLabels);
  }, [nodes, edges, getNodeNotes, getEdgeNotes]);

  // Updated suggestions that include both hashtags and labels
  function getSuggestions(prefix, limit = 12) {
    const p = (prefix || '').toLowerCase();
    if (!p) return [];
    
    const suggestions = [];
    
    // Add hashtag matches (with # prefix)
    for (const tag of allTagsSorted) {
      if (tag.startsWith(p)) {
        suggestions.push('#' + tag);
        if (suggestions.length >= limit) break;
      }
    }
    
    // Add label matches (without # prefix) if we haven't hit the limit
    if (suggestions.length < limit) {
      for (const label of allLabelsSorted) {
        if (label.startsWith(p)) {
          // Don't duplicate if we already have this as a hashtag
          const labelSuggestion = label;
          const hashtagEquivalent = '#' + label;
          if (!suggestions.includes(hashtagEquivalent)) {
            suggestions.push(labelSuggestion);
            if (suggestions.length >= limit) break;
          }
        }
      }
    }
    
    return suggestions;
  }

  // Updated search function to handle both hashtags and labels
  function findMatchesFromTokens(tokens) {
    if (!tokens.length) return { nodeIds: new Set(), edgeIds: new Set() };

    const perTokenNodeSets = [];
    const perTokenEdgeSets = [];

    for (const tok of tokens) {
      const t = tok.toLowerCase();
      const nodeUnion = new Set();
      const edgeUnion = new Set();

      // Search in hashtags
      for (const [tag, { nodes: ns, edges: es }] of hashtagIndex.entries()) {
        if (tag.startsWith(t)) {
          ns.forEach(id => nodeUnion.add(id));
          es.forEach(id => edgeUnion.add(id));
        }
      }

      // Search in node labels
      for (const [label, nodeIds] of labelIndex.entries()) {
        if (label.startsWith(t)) {
          nodeIds.forEach(id => nodeUnion.add(id));
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
    hashtagIndex,         // Map(tag -> {nodes:Set, edges:Set})
    labelIndex,           // Map(label -> Set(nodeIds))
    allTagsSorted,        // [string] hashtags
    allLabelsSorted,      // [string] label words
    getSuggestions,       // Updated to include both
    findMatchesFromTokens, // Updated to search both
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
