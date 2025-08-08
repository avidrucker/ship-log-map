/**
 * **`useCytoscapeInstance.js`** 
 * - Custom hook for Cytoscape instance management
   - Eliminates `document.querySelector("#cy")?._cy` calls
   - Provides `updateNodeInPlace()` for avoiding recreation
   - Includes optimized methods for common operations
 */

import { useRef, useCallback } from 'react';

/**
 * Custom hook to manage Cytoscape instance with performance optimizations
 */
export function useCytoscapeInstance() {
  const cytoscapeRef = useRef(null);
  
  // Set the Cytoscape instance reference
  const setCytoscapeInstance = useCallback((instance) => {
    cytoscapeRef.current = instance;
  }, []);
  
  // Get the current Cytoscape instance
  const getCytoscapeInstance = useCallback(() => {
    return cytoscapeRef.current;
  }, []);
  
  // Update node data in place without recreation
  const updateNodeInPlace = useCallback((nodeId, updates) => {
    const cy = cytoscapeRef.current;
    if (!cy) return false;
    
    try {
      const node = cy.$(`#${nodeId}`);
      if (node.length === 0) return false;
      
      Object.entries(updates).forEach(([key, value]) => {
        node.data(key, value);
      });
      
      return true;
    } catch (error) {
      console.warn('Failed to update node in place:', error);
      return false;
    }
  }, []);
  
  // Update edge data in place without recreation
  const updateEdgeInPlace = useCallback((edgeId, updates) => {
    const cy = cytoscapeRef.current;
    if (!cy) return false;
    
    try {
      const edge = cy.$(`#${edgeId}`);
      if (edge.length === 0) return false;
      
      Object.entries(updates).forEach(([key, value]) => {
        edge.data(key, value);
      });
      
      return true;
    } catch (error) {
      console.warn('Failed to update edge in place:', error);
      return false;
    }
  }, []);
  
  // Clear all selections in Cytoscape
  const clearCytoscapeSelections = useCallback(() => {
    const cy = cytoscapeRef.current;
    if (cy) {
      cy.elements().unselect();
    }
  }, []);
  
  // Fit view to all nodes
  const fitToView = useCallback((padding = 50) => {
    const cy = cytoscapeRef.current;
    if (cy) {
      cy.fit(cy.nodes(), padding);
    }
  }, []);
  
  // Get current viewport center in world coordinates
  const getViewportCenter = useCallback(() => {
    const cy = cytoscapeRef.current;
    if (!cy) return { x: 0, y: 0 };
    
    const extent = cy.extent();
    return {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2
    };
  }, []);
  
  // Export current node positions from Cytoscape
  const exportNodePositions = useCallback(() => {
    const cy = cytoscapeRef.current;
    if (!cy) return [];
    
    return cy.nodes().map(node => ({
      id: node.id(),
      x: node.position('x'),
      y: node.position('y')
    }));
  }, []);
  
  return {
    setCytoscapeInstance,
    getCytoscapeInstance,
    updateNodeInPlace,
    updateEdgeInPlace,
    clearCytoscapeSelections,
    fitToView,
    getViewportCenter,
    exportNodePositions
  };
}
