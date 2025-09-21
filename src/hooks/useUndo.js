// src/hooks/useUndo.js
import { useCallback } from 'react';
import { ACTION_TYPES } from '../appStateReducer';
import { printDebug } from '../utils/debug';

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