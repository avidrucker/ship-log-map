/**
 * **`useCytoscapeInstance.js`** 
 * - Custom hook for Cytoscape instance management
   - Eliminates `document.querySelector("#cy")?._cy` calls
   - Provides `updateNodeInPlace()` for avoiding recreation
   - Includes optimized methods for common operations
 */

import { useRef, useCallback, useState } from 'react';

/**
 * Custom hook to manage Cytoscape instance with performance optimizations
 */
export function useCytoscapeInstance() {
  const cytoscapeRef = useRef(null);
  // State to store the original camera position when zooming to selection
  const [originalCamera, setOriginalCamera] = useState(null);
  
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
    //// TODO: troubleshoot performance with fit calls
    //// console.log("Fitting view to all nodes with padding:", padding);
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

  // Save current camera state
  const saveOriginalCamera = useCallback(() => {
    const cy = cytoscapeRef.current;
    if (!cy) return null;
    
    const camera = {
      zoom: cy.zoom(),
      pan: { ...cy.pan() }
    };
    
    setOriginalCamera(camera);
    return camera;
  }, []);

  // Restore camera to original state with smooth animation
  const restoreOriginalCamera = useCallback((animate = true) => {
    const cy = cytoscapeRef.current;
    if (!cy || !originalCamera) return false;
    
    try {
      if (animate) {
        cy.animate({
          zoom: originalCamera.zoom,
          pan: originalCamera.pan
        }, {
          duration: 500,
          easing: 'ease-out'
        });
      } else {
        cy.zoom(originalCamera.zoom);
        cy.pan(originalCamera.pan);
      }
      
      setOriginalCamera(null);
      return true;
    } catch (error) {
      console.warn('Failed to restore original camera:', error);
      return false;
    }
  }, [originalCamera]);

  // Fit to selection in the top half of the viewport
  const fitToSelection = useCallback((elementIds, options = {}) => {
    const cy = cytoscapeRef.current;
    if (!cy || !elementIds || elementIds.length === 0) return false;

    const {
      animate = true,
      padding = 50,
      targetHalf = 'top', // 'top' or 'bottom'
      saveCamera = true,
      zoomLevel = 'close' // 'close' for single element zoom, 'fit' for fitting multiple elements
    } = options;

    try {
      // Save current camera state if requested
      if (saveCamera) {
        saveOriginalCamera();
      }

      // Get the elements to fit
      const elements = cy.elements().filter(el => elementIds.includes(el.id()));
      if (elements.length === 0) return false;

      const containerWidth = cy.width();
      const containerHeight = cy.height();

      // Calculate target viewport dimensions (top half or bottom half)
      const targetHeight = containerHeight / 2;
      const targetY = targetHalf === 'top' ? 0 : containerHeight / 2;
      const targetCenterX = containerWidth / 2;
      const targetCenterY = targetY + (targetHeight / 2);

      let targetZoom, targetPan;

      if (zoomLevel === 'close' && elements.length === 1) {
        // For single element: zoom in close so it takes up most of the target area
        const element = elements[0];
        const isNode = element.isNode();
        
        // Get element position
        const elementPos = element.position();
        
        // For nodes, adjust zoom based on node size
        // For edges, use the midpoint and a slightly lower zoom
        if (isNode) {
          // Get the node size from its data
          const nodeSize = element.data('size') || 'regular';
          
          // Base node size in pixels at zoom 1 (approximate)
          let baseNodeSize;
          let zoomMultiplier;
          
          switch (nodeSize) {
            case 'half':
              baseNodeSize = 120; // Half-size nodes are smaller
              zoomMultiplier = 0.7; // Reduce zoom for half nodes (was too much at 0.25)
              break;
            case 'regular':
              baseNodeSize = 175; // Regular size
              zoomMultiplier = 0.7; // Perfect zoom level for regular nodes
              break;
            case 'double':
              baseNodeSize = 340; // Double-size nodes are larger
              zoomMultiplier = 0.7; // Further reduced zoom for double nodes (was still too much at 0.07)
              break;
            default:
              baseNodeSize = 175;
              zoomMultiplier = 0.7;
              break;
          }
          
          // Calculate desired size to fit nicely in the target area
          const desiredNodeSize = Math.min(targetHeight * zoomMultiplier, containerWidth * zoomMultiplier);
          targetZoom = desiredNodeSize / baseNodeSize;
        } else {
          // For edges, zoom to show the edge prominently
          const bb = element.boundingBox();
          const elementWidth = Math.max(bb.w, 100); // Minimum width for edge visibility
          const elementHeight = Math.max(bb.h, 100); // Minimum height for edge visibility
          
          const availableWidth = containerWidth - (2 * padding);
          const availableHeight = targetHeight - (2 * padding);
          
          const zoomX = availableWidth / elementWidth;
          const zoomY = availableHeight / elementHeight;
          targetZoom = Math.min(zoomX, zoomY, 3.0); // Cap at 3x zoom for edges
          
          // Use edge center
          const edgeCenter = {
            x: bb.x1 + (bb.w / 2),
            y: bb.y1 + (bb.h / 2)
          };
          elementPos.x = edgeCenter.x;
          elementPos.y = edgeCenter.y;
        }

        // Calculate pan to center the element in the target area
        targetPan = {
          x: targetCenterX - (elementPos.x * targetZoom),
          y: targetCenterY - (elementPos.y * targetZoom)
        };

      } else {
        // Original logic for fitting multiple elements or when zoomLevel is 'fit'
        const bb = elements.boundingBox();
        const elementWidth = bb.w;
        const elementHeight = bb.h;
        const availableWidth = containerWidth - (2 * padding);
        const availableHeight = targetHeight - (2 * padding);

        const zoomX = availableWidth / elementWidth;
        const zoomY = availableHeight / elementHeight;
        targetZoom = Math.min(zoomX, zoomY) * cy.zoom();

        // Calculate pan to center elements in target area
        const elementCenterX = bb.x1 + (elementWidth / 2);
        const elementCenterY = bb.y1 + (elementHeight / 2);

        targetPan = {
          x: targetCenterX - (elementCenterX * targetZoom),
          y: targetCenterY - (elementCenterY * targetZoom)
        };
      }

      // Apply the transformation
      if (animate) {
        cy.animate({
          zoom: targetZoom,
          pan: targetPan
        }, {
          duration: 500,
          easing: 'ease-out'
        });
      } else {
        cy.zoom(targetZoom);
        cy.pan(targetPan);
      }

      return true;
    } catch (error) {
      console.warn('Failed to fit to selection:', error);
      return false;
    }
  }, [saveOriginalCamera]);

  // Check if we have a saved camera state
  const hasOriginalCamera = useCallback(() => {
    return originalCamera !== null;
  }, [originalCamera]);

  // Export current node positions from Cytoscape
  const exportNodePositions = useCallback(() => {
    const cy = cytoscapeRef.current;
    if (!cy) return [];
    // Only export positions for domain nodes (parent containers)
    return cy.nodes('.entry-parent').map(node => ({
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
    exportNodePositions,
    saveOriginalCamera,
    restoreOriginalCamera,
    fitToSelection,
    hasOriginalCamera
  };
}
