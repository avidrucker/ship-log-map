// src/hooks/useGraphOperations.js

import { useCallback } from 'react';
import { incrementOrientationBy90 } from '../utils/rotation';
import { ACTION_TYPES } from '../appStateReducer';  // Import ACTION_TYPES constants

/**
 * Custom hook for graph operations
 * @param {Object} cy - Cytoscape instance
 * @param {Function} dispatch - State dispatch function
 * @param {Function} resetSelectionState - Function to reset selection state
 * @param {Function} applyDebugStyles - Function to apply debug styles
 * @param {number} currentOrientation - Current orientation in degrees
 * @returns {Object} Graph operation functions
 */
export function useGraphOperations(cy, dispatch, resetSelectionState, applyDebugStyles, currentOrientation = 0) {
  const handleRotateLeft = useCallback(() => {
    // Rotate left = counter-clockwise = subtract 90 degrees
    const newOrientation = (currentOrientation - 90 + 360) % 360;
    dispatch({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: newOrientation } });
  }, [dispatch, currentOrientation]);

  const handleRotateRight = useCallback(() => {
    // Rotate right = clockwise = add 90 degrees
    const newOrientation = incrementOrientationBy90(currentOrientation);
    dispatch({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: newOrientation } });
  }, [dispatch, currentOrientation]);

  const handleFitGraph = useCallback(() => {
    if (!cy) return;
    console.log('Fitting graph...');
    
    // Use Cytoscape's built-in fit method with padding (same as CytoscapeGraph component)
    try {
      cy.fit(cy.nodes(), 50); // 50px padding to match CytoscapeGraph behavior
      
      // Update camera info in state
      const cameraInfo = {
        zoom: cy.zoom(),
        position: cy.pan()
      };
      dispatch({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: cameraInfo.zoom } });
      dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: cameraInfo.position } });
    } catch (error) {
      console.error('Error fitting graph:', error);
    }
  }, [cy, dispatch]);

  const handleResetSelection = useCallback(() => {
    if (!cy) return;
    console.log('Resetting selection');
    cy.elements().unselect();
    resetSelectionState?.();
  }, [cy, resetSelectionState]);

  const toggleDebugMode = useCallback(() => {
    // TODO: Add TOGGLE_DEBUG_MODE action type to appStateReducer.js
    // dispatch({ type: ACTION_TYPES.TOGGLE_DEBUG_MODE });
    console.log('Debug mode toggle not yet implemented in reducer');
    if (cy) {
      applyDebugStyles?.(cy);
    }
  }, [cy, applyDebugStyles]);

  const addNode = useCallback((node) => {
    if (!cy) return;
    try {
      cy.add({
        group: 'nodes',
        data: node,
        position: node.position || { x: 0, y: 0 }
      });
      console.log('Node added:', node);
    } catch (error) {
      console.error('Error adding node:', error);
    }
  }, [cy]);

  const addEdge = useCallback((edge) => {
    if (!cy) return;
    try {
      cy.add({
        group: 'edges',
        data: edge
      });
      console.log('Edge added:', edge);
    } catch (error) {
      console.error('Error adding edge:', error);
    }
  }, [cy]);

  const removeElement = useCallback((elementId) => {
    if (!cy) return;
    try {
      const element = cy.getElementById(elementId);
      if (element.length > 0) {
        element.remove();
        console.log('Element removed:', elementId);
      }
    } catch (error) {
      console.error('Error removing element:', error);
    }
  }, [cy]);

  const updateElementData = useCallback((elementId, data) => {
    if (!cy) return;
    try {
      const element = cy.getElementById(elementId);
      if (element.length > 0) {
        element.data(data);
        console.log('Element data updated:', elementId, data);
      }
    } catch (error) {
      console.error('Error updating element data:', error);
    }
  }, [cy]);

  const updateElementPosition = useCallback((elementId, position) => {
    if (!cy) return;
    try {
      const element = cy.getElementById(elementId);
      if (element.length > 0 && element.isNode()) {
        element.position(position);
        console.log('Node position updated:', elementId, position);
      }
    } catch (error) {
      console.error('Error updating node position:', error);
    }
  }, [cy]);

  const selectElement = useCallback((elementId) => {
    if (!cy) return;
    try {
      const element = cy.getElementById(elementId);
      if (element.length > 0) {
        cy.elements().unselect();
        element.select();
        console.log('Element selected:', elementId);
      }
    } catch (error) {
      console.error('Error selecting element:', error);
    }
  }, [cy]);

  const getElementData = useCallback((elementId) => {
    if (!cy) return null;
    try {
      const element = cy.getElementById(elementId);
      return element.length > 0 ? element.data() : null;
    } catch (error) {
      console.error('Error getting element data:', error);
      return null;
    }
  }, [cy]);

  const getAllElements = useCallback(() => {
    if (!cy) return { nodes: [], edges: [] };
    try {
      const nodes = cy.nodes().map(node => ({
        data: node.data(),
        position: node.position()
      }));
      const edges = cy.edges().map(edge => ({
        data: edge.data()
      }));
      return { nodes, edges };
    } catch (error) {
      console.error('Error getting all elements:', error);
      return { nodes: [], edges: [] };
    }
  }, [cy]);

  return {
    handleRotateLeft,
    handleRotateRight,
    handleFitGraph,
    handleResetSelection,
    toggleDebugMode,
    addNode,
    addEdge,
    removeElement,
    updateElementData,
    updateElementPosition,
    selectElement,
    getElementData,
    getAllElements
  };
}
