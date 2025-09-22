// src/hooks/useUndo.js
import { useCallback } from 'react';
import { ACTION_TYPES } from '../appStateReducer';
import { printDebug } from '../utils/debug';

/**
 * Custom hook for undo/redo operations in the graph editor
 *
 * Responsibilities
 * - Manages undo state lifecycle (save checkpoints, apply undo, clear state)
 * - Provides centralized undo logic for all graph mutations
 * - Handles Cytoscape position synchronization after undo operations
 * - Clears selections and undo state when undo is applied
 *
 * Key Functions
 * - clearUndoState() - Clears current undo checkpoint
 * - saveUndoCheckpoint(graphState) - Saves a graph state snapshot for undo
 * - applyUndoIfAvailable(setGraphData) - Applies saved undo state if available
 * - canUndo - Boolean indicating if undo operation is possible
 *
 * Usage Pattern
 * ```javascript
 * // Before making changes
 * saveUndoCheckpoint({ nodes, edges, notes, orientation });
 * 
 * // Make graph mutations...
 * 
 * // To undo
 * if (canUndo) {
 *   applyUndoIfAvailable(setGraphData);
 * }
 * ```
 *
 * Contracts
 * - Only stores one level of undo (single checkpoint)
 * - Automatically clears selections after undo to prevent stale references
 * - Syncs Cytoscape node positions with restored graph data
 * - Undo state is cleared after successful application
 *
 * @param {Object} appState - Current application state containing undo data
 * @param {Function} dispatchAppState - State dispatch function for reducer actions
 * @param {Function} getCytoscapeInstance - Function that returns current Cytoscape instance
 * @param {Function} clearCytoscapeSelections - Function to clear Cytoscape visual selections
 * @returns {Object} Undo operation functions and state
 * @returns {Function} returns.clearUndoState - Clears the current undo checkpoint
 * @returns {Function} returns.saveUndoCheckpoint - Saves graph state for undo (graphState) => void
 * @returns {Function} returns.applyUndoIfAvailable - Applies undo if available (setGraphData) => boolean
 * @returns {boolean} returns.canUndo - Whether undo operation is currently possible
 */
export function useUndo(appState, dispatchAppState, getCytoscapeInstance, clearCytoscapeSelections) {
  const { undo } = appState;

  const clearUndoState = useCallback(() => {
    printDebug('🧷 [undo] clearing undo state');
    dispatchAppState({ type: ACTION_TYPES.CLEAR_UNDO_STATE });
  }, [dispatchAppState]);

  const saveUndoCheckpoint = useCallback((graphStateSnapshot) => {
    // snapshot: { nodes, edges, notes, orientation, mode, etc. }
    printDebug('🧷 [undo] saving checkpoint:', {
      nodeCount: graphStateSnapshot?.nodes?.length || 0,
      edgeCount: graphStateSnapshot?.edges?.length || 0,
      orientation: graphStateSnapshot?.orientation
    });
    
    dispatchAppState({
      type: ACTION_TYPES.SET_UNDO_STATE,
      payload: { graphState: graphStateSnapshot }
    });
  }, [dispatchAppState]);

  const applyUndoIfAvailable = useCallback((setGraphData) => {
    if (!undo?.lastGraphState) {
      printDebug('🧷 [undo] no undo state available');
      return false;
    }

    const prevState = undo.lastGraphState;
    printDebug('🧷 [undo] applying undo state:', {
      nodeCount: prevState?.nodes?.length || 0,
      edgeCount: prevState?.edges?.length || 0,
      orientation: prevState?.orientation
    });

    // Apply the undo state to graph data
    setGraphData(prevState);
    
    // Clear undo after using it
    clearUndoState();
    
    // Clear selections since they might reference nodes/edges that changed
    dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
    clearCytoscapeSelections();
    
    // Update Cytoscape node positions to match undo state
    const cy = getCytoscapeInstance();
    if (cy && prevState.nodes) {
      printDebug('🧷 [undo] syncing Cytoscape positions after undo');
      prevState.nodes.forEach(node => {
        const cyNode = cy.getElementById(node.id);
        if (cyNode && cyNode.length > 0) {
          cyNode.position({ x: node.x, y: node.y });
        }
      });
    }

    return true;
  }, [undo, clearUndoState, dispatchAppState, clearCytoscapeSelections, getCytoscapeInstance]);

  return { 
    clearUndoState, 
    saveUndoCheckpoint, 
    applyUndoIfAvailable, 
    canUndo: !!undo?.lastGraphState 
  };
}