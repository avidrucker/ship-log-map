// src/search/useHashtagIndex.js

import { useEffect, useMemo, useState } from 'react';
import { extractHashtagsFromText, normalizeTag, tokenizeQuery } from './hashtagUtils';
import { printDebug } from '../utils/debug';

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

    printDebug('🔍 Starting indexing process...');

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
        
        printDebug(`📍 Indexing place: "${fullName}" (ID: ${n.id})`);

        // Store the full place name for this node
        fullNamesMap.set(n.id, fullName);
        
        // Index the full place name as searchable (for direct matches)
        if (!labelMap.has(fullNameLower)) {
          labelMap.set(fullNameLower, new Set());
        }
        labelMap.get(fullNameLower).add(n.id);
        
        // Index individual words to point back to full place names
        const words = fullNameLower.split(/\s+/).filter(word => word.length > 0);
        
        printDebug(`📝 Words for "${fullName}":`, words);

        for (const word of words) {
          // Skip very common words
          if (['a', 'an', 'of', 'in', 'at', 'on', 'to'].includes(word)) {
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
        
          printDebug(`🔗 Indexed word "${word}" -> place "${fullName}"`);
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
    printDebug('✅ Indexing complete');
    printDebug(`📊 Total places indexed: ${fullNamesMap.size}`);
    printDebug(`📊 Total words indexed: ${wordToFullNamesMap.size}`);
    printDebug(`📊 Sample full names:`, Array.from(fullNamesMap.values()).slice(0, 5));
  }, [nodes, edges, getNodeNotes, getEdgeNotes]);

  // Updated suggestions that include both hashtags and labels,
  // and checks for multi-word and word-order matching
  // Suggestions obey "mode":
  // - Hashtag mode: first token starts with '#': suggest ONLY hashtags (by last token prefix)
  // - Phrase mode: 2+ words, no '#': suggest ONLY full place names that start with the ENTIRE input
  // - Single-word mixed: 1 word, no '#': suggest hashtags AND place names that start with the word
  function getSuggestions(input, limit = 12) {
    const raw = (input || '').trim();
    if (!raw) return [];
    const q = raw.toLowerCase();
    const words = q.split(/\s+/);
    const firstIsHash = words[0]?.startsWith('#');
    const multiWord = words.length > 1;

    const out = [];
    const seen = new Set();

    // 1) Hashtag mode
    if (firstIsHash) {
      const last = words[words.length - 1].replace(/^#/, '');
      if (!last) return [];
      for (const tag of allTagsSorted) {
        if (tag.startsWith(last)) {
          const s = '#' + tag;
          if (!seen.has(s)) {
            out.push(s); seen.add(s);
            if (out.length >= limit) break;
          }
        }
      }
      return out;
    }

    // 2) Phrase mode (multi-word, no '#'): ONLY full names that start with the ENTIRE input
    if (multiWord) {
      for (const fullName of fullNamesMap.values()) {
        if (fullName.toLowerCase().startsWith(q)) {
          if (!seen.has(fullName)) {
            out.push(fullName); seen.add(fullName);
            if (out.length >= limit) break;
          }
        }
      }
      return out;
    }

    // 3) Single-word mixed: BOTH hashtags and place names by the word prefix
    const w = words[0];
    for (const tag of allTagsSorted) {
      if (tag.startsWith(w)) {
        const s = '#' + tag;
        if (!seen.has(s)) {
          out.push(s); seen.add(s);
          if (out.length >= limit) break;
        }
      }
    }
    if (out.length < limit) {
      for (const [word, fullNames] of wordToFullNamesMap) {
        if (word.startsWith(w)) {
          for (const fullName of fullNames) {
            if (!seen.has(fullName)) {
              out.push(fullName); seen.add(fullName);
              if (out.length >= limit) break;
            }
          }
        }
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // Updated search function to handle both hashtags and labels
  // In useHashtagIndex.js, update findMatchesFromTokens to handle quoted place names:
  function findMatchesFromTokens(tokens) {
    if (!tokens.length) return { nodeIds: new Set(), edgeIds: new Set() };

    // Special case: if we have multiple unquoted tokens that could form a place name,
    // try to match them as a combined place name first
    if (tokens.length > 1 && tokens.every(tok => !tok.startsWith('#') && !tok.startsWith('"'))) {
      const combinedSearch = tokens.join(' ').toLowerCase();
      
      // Try to find an exact place name match first
      for (const [nodeId, fullName] of fullNamesMap) {
        if (fullName.toLowerCase() === combinedSearch) {
          return { nodeIds: new Set([nodeId]), edgeIds: new Set() };
        }
      }
      
      // If no exact match, try prefix matching on the combined string
      for (const [nodeId, fullName] of fullNamesMap) {
        if (fullName.toLowerCase().startsWith(combinedSearch)) {
          return { nodeIds: new Set([nodeId]), edgeIds: new Set() };
        }
      }
    }

    // Process individual tokens
    const perTokenNodeSets = [];
    const perTokenEdgeSets = [];

    for (const tok of tokens) {
      const nodeUnion = new Set();
      const edgeUnion = new Set();

      // Check if it's a quoted full place name
      if (tok.startsWith('"') && tok.endsWith('"')) {
        const fullNameToSearch = tok.slice(1, -1).toLowerCase(); // Remove quotes and lowercase
        
        printDebug(`Searching for quoted place name: "${fullNameToSearch}"`);
        printDebug(`Available full names:`, Array.from(fullNamesMap.values()).slice(0, 5));
        
        // Find nodes with this exact full name (case insensitive)
        for (const [nodeId, fullName] of fullNamesMap) {
          if (fullName.toLowerCase() === fullNameToSearch) {
            printDebug(`Found match: ${nodeId} -> ${fullName}`);
            nodeUnion.add(nodeId);
          }
        }
        
        printDebug(`Quoted search results: ${nodeUnion.size} nodes found`);
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
