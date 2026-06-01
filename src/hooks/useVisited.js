// src/hooks/useVisited.js
import * as React from 'react';
import { loadVisited, saveVisited, clearVisited } from '../utils/visitedStore.js';

/**
 * useVisited(mapName)
 * - Keeps visited Sets in React state
 * - Persists to localStorage per map
 * - Exposes helpers to mark/clear
 */
export default function useVisited(mapName) {
  const [visited, setVisited] = React.useState(() => loadVisited(mapName));

  // Reload when map changes
  React.useEffect(() => {
    setVisited(loadVisited(mapName));
  }, [mapName]);

  // Persist whenever visited changes — but skip when mapName just changed.
  // On a mapName transition both this effect and the reload effect fire in the
  // same flush; if we persist here we'd write the OLD map's visited under the
  // NEW map's key before the reload effect's setVisited has committed.
  const prevMapNameRef = React.useRef(mapName);
  React.useEffect(() => {
    if (mapName !== prevMapNameRef.current) {
      prevMapNameRef.current = mapName;
      return;
    }
    prevMapNameRef.current = mapName;
    saveVisited(mapName, visited);
  }, [mapName, visited]);

  const markNodeVisited = React.useCallback((id) => {
    if (!id) return;
    setVisited(v => {
      if (v.nodes.has(id)) return v;
      const next = { nodes: new Set(v.nodes), edges: new Set(v.edges) };
      next.nodes.add(id);
      return next;
    });
  }, []);

  const markEdgeVisited = React.useCallback((id) => {
    if (!id) return;
    setVisited(v => {
      if (v.edges.has(id)) return v;
      const next = { nodes: new Set(v.nodes), edges: new Set(v.edges) };
      next.edges.add(id);
      return next;
    });
  }, []);

  const clearForMap = React.useCallback(() => {
    clearVisited(mapName);
    setVisited({ nodes: new Set(), edges: new Set() });
  }, [mapName]);

  return {
    visited,               // { nodes:Set, edges:Set }
    markNodeVisited,
    markEdgeVisited,
    clearForMap,
  };
}
