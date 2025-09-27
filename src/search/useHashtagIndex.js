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
  const [wordToFullNamesMap, setWordToFullNamesMap] = useState(() => new Map());
  const [fullNamesMap, setFullNamesMap] = useState(() => new Map());

  useEffect(() => {
    const tagMap = new Map();
    const labelMap = new Map(); // word -> Set(nodeIds)
    const fullNamesMap = new Map(); // nodeId -> fullPlaceName
    const wordToFullNamesMap = new Map(); // word -> Set(fullPlaceNames)

    // Index hashtags from notes (unchanged)
    for (const n of nodes) {
      const tags = extractHashtagsFromText(getNodeNotes(n));
      for (const t of tags) {
        const entry = tagMap.get(t) || { nodes: new Set(), edges: new Set() };
        entry.nodes.add(n.id);
        tagMap.set(t, entry);
      }

      // Index node labels - track full place names and their component words
      if (n.title) {
        const fullName = n.title.trim(); // Keep original case for display
        const fullNameLower = fullName.toLowerCase();
        
        if (!fullName) continue;
        
        // Store the full place name for this node
        fullNamesMap.set(n.id, fullName);
        
        // Index the full place name as searchable (for direct matches)
        if (!labelMap.has(fullNameLower)) {
          labelMap.set(fullNameLower, new Set());
        }
        labelMap.get(fullNameLower).add(n.id);
        
        // Index individual words to point back to full place names
        const words = fullNameLower.split(/\s+/).filter(word => word.length > 0);
        
        for (const word of words) {
          // Skip very common words
          if (['the', 'a', 'an', 'of', 'in', 'at', 'on', 'to'].includes(word)) {
            continue;
          }
          
          // Map word -> nodeIds (for search functionality)
          if (!labelMap.has(word)) {
            labelMap.set(word, new Set());
          }
          labelMap.get(word).add(n.id);
          
          // Map word -> full place names (for suggestions)
          if (!wordToFullNamesMap.has(word)) {
            wordToFullNamesMap.set(word, new Set());
          }
          wordToFullNamesMap.get(word).add(fullName); // Store original case
        }
      }
    }

    // Index hashtags from edge notes (unchanged)
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
    
    // Store the new maps for full place name handling
    setWordToFullNamesMap(wordToFullNamesMap);
    setFullNamesMap(fullNamesMap);
  }, [nodes, edges, getNodeNotes, getEdgeNotes]);

  // Updated suggestions that include both hashtags and labels
  function getSuggestions(prefix, limit = 12) {
    const p = (prefix || '').toLowerCase();
    if (!p) return [];
    
    const suggestions = [];
    const seenSuggestions = new Set();
    
    // Add hashtag matches (with # prefix)
    for (const tag of allTagsSorted) {
      if (tag.startsWith(p)) {
        const suggestion = '#' + tag;
        if (!seenSuggestions.has(suggestion)) {
          suggestions.push(suggestion);
          seenSuggestions.add(suggestion);
          if (suggestions.length >= limit) return suggestions;
        }
      }
    }
    
    // Add full place names that start with the prefix
    for (const label of allLabelsSorted) {
      if (label.startsWith(p)) {
        // Check if this is a full place name (has spaces or corresponds to a full name)
        const nodeIdsWithThisLabel = labelIndex.get(label);
        if (nodeIdsWithThisLabel) {
          // Get the full place names for these nodes
          for (const nodeId of nodeIdsWithThisLabel) {
            const fullName = fullNamesMap.get(nodeId);
            if (fullName && !seenSuggestions.has(fullName)) {
              suggestions.push(fullName);
              seenSuggestions.add(fullName);
              if (suggestions.length >= limit) return suggestions;
            }
          }
        }
      }
    }
    
    // Add full place names whose component words start with the prefix
    for (const [word, fullNames] of wordToFullNamesMap) {
      if (word.startsWith(p)) {
        for (const fullName of fullNames) {
          if (!seenSuggestions.has(fullName)) {
            suggestions.push(fullName);
            seenSuggestions.add(fullName);
            if (suggestions.length >= limit) return suggestions;
          }
        }
      }
    }
    
    return suggestions;
  }

  // Updated search function to handle both hashtags and labels
  // In useHashtagIndex.js, update findMatchesFromTokens to handle quoted place names:
  function findMatchesFromTokens(tokens) {
    if (!tokens.length) return { nodeIds: new Set(), edgeIds: new Set() };

    const perTokenNodeSets = [];
    const perTokenEdgeSets = [];

    for (const tok of tokens) {
      const nodeUnion = new Set();
      const edgeUnion = new Set();

      // Check if it's a quoted full place name
      if (tok.startsWith('"') && tok.endsWith('"')) {
        const fullNameToSearch = tok.slice(1, -1); // Remove quotes
        
        // Find nodes with this exact full name
        for (const [nodeId, fullName] of fullNamesMap) {
          if (fullName.toLowerCase() === fullNameToSearch) {
            nodeUnion.add(nodeId);
          }
        }
      } 
      // Check if it's a hashtag search (starts with #)
      else if (tok.startsWith('#')) {
        const hashtagToSearch = tok.slice(1).toLowerCase(); // Remove # for lookup
        
        // Only search in hashtags, NOT in place names
        for (const [tag, { nodes: ns, edges: es }] of hashtagIndex.entries()) {
          if (tag.startsWith(hashtagToSearch)) {
            ns.forEach(id => nodeUnion.add(id));
            es.forEach(id => edgeUnion.add(id));
          }
        }
      } 
      // Regular word search (no # or quotes)
      else {
        const t = tok.toLowerCase();
        
        // Search in hashtags
        for (const [tag, { nodes: ns, edges: es }] of hashtagIndex.entries()) {
          if (tag.startsWith(t)) {
            ns.forEach(id => nodeUnion.add(id));
            es.forEach(id => edgeUnion.add(id));
          }
        }

        // Search in node labels/words
        for (const [label, nodeIds] of labelIndex.entries()) {
          if (label.startsWith(t)) {
            nodeIds.forEach(id => nodeUnion.add(id));
          }
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
    wordToFullNamesMap,
    fullNamesMap,
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
