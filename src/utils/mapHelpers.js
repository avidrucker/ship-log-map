// src/utils/mapHelpers.js

/**
 * Map data normalization and hydration utilities
 */

import { printDebug } from './debug.js';

// Ensure every node has size/color/x/y; every edge has id & direction
export function normalizeGraphData(data) {
  if (!data) return { nodes: [], edges: [], notes: {} };
  
  const normalizedNodes = (data.nodes || []).map(node => ({
    id: node.id,
    title: node.title || node.label || '',
    x: typeof node.x === 'number' ? node.x : 0,
    y: typeof node.y === 'number' ? node.y : 0,
    size: node.size || 'regular',
    color: node.color || 'gray',
    imageUrl: node.imageUrl || 'unspecified'
  }));

  const normalizedEdges = (data.edges || []).map(edge => ({
    id: edge.id || `${edge.source}__${edge.target}`,
    source: edge.source,
    target: edge.target,
    direction: edge.direction || 'forward'
  }));

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    notes: data.notes || {},
    mode: data.mode || 'editing',
    mapName: data.mapName || 'default_map',
    cdnBaseUrl: data.cdnBaseUrl || '',
    orientation: data.orientation || 0,
    compassVisible: data.compassVisible !== false,
    bgImage: data.bgImage || {
      imageUrl: "",
      x: 0,
      y: 0,
      scale: 100,
      opacity: 100,
      visible: false,
      included: false
    }
  };
}

// Assign missing coordinates using the default graph as reference
export function hydrateCoordsIfMissing(graph, defaultGraph) {
  if (!graph || !defaultGraph) return graph;
  
  const hydratedNodes = graph.nodes.map(node => {
    if (typeof node.x === 'number' && typeof node.y === 'number') {
      return node; // Already has coordinates
    }
    
    // Find matching node in default graph
    const defaultNode = defaultGraph.nodes.find(dn => dn.id === node.id || dn.title === node.title);
    if (defaultNode) {
      printDebug(`🎯 [mapHelpers] Hydrating coordinates for node "${node.id}" from default: (${defaultNode.x}, ${defaultNode.y})`);
      return {
        ...node,
        x: defaultNode.x,
        y: defaultNode.y
      };
    }
    
    // Fallback to origin
    printDebug(`⚠️ [mapHelpers] No default coordinates found for node "${node.id}", using (0, 0)`);
    return {
      ...node,
      x: 0,
      y: 0
    };
  });
  
  return {
    ...graph,
    nodes: hydratedNodes
  };
}

// Check if URL has any query parameters
export function hasAnyQueryParams() {
  return window.location.search && window.location.search.length > 1;
}

// previously getEditingEnabledFromQuery
export function getCanEditFromQuery() {
  const urlParams = new URLSearchParams(window.location.search);
  const canedit = urlParams.get('canedit');
  return canedit === 'true';
}

// Get normalized map URL from query parameters
export function getNormalizedMapUrlFromQuery() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('map') || '';
}
