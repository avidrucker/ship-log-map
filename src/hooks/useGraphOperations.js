// src/hooks/useGraphOperations.js
import { useCallback } from 'react';
import { incrementOrientationBy90 } from '../utils/rotation';
import { rotateNodesAndCompass } from '../utils/rotation.js';
import { edgeId } from '../graph/ops.js';
import { printDebug } from '../utils/debug.js';
import { ACTION_TYPES } from '../appStateReducer';

/**
 * Custom hook for graph operations
 * @param {Object} params - Parameters object
 * @param {Object} params.cy - Cytoscape instance function
 * @param {Function} params.dispatch - State dispatch function
 * @param {Object} params.graph - Graph data (nodes, edges, notes, orientation)
 * @param {Object} params.selections - Current selections
 * @param {Function} params.saveUndoCheckpoint - Function to save undo state
 * @param {Function} params.setGraphData - Function to update graph data
 * @param {Function} params.clearCytoscapeSelections - Function to clear Cytoscape selections
 * @param {Function} params.updateNodeInPlace - Function to update node in Cytoscape
 * @param {Function} params.getViewportCenter - Function to get viewport center
 * @returns {Object} Graph operation functions
 */
export function useGraphOperations({
  cy,
  dispatch,
  graph,
  selections,
  saveUndoCheckpoint,
  setGraphData,
  clearCytoscapeSelections,
  updateNodeInPlace,
  getViewportCenter
}) {
  const { nodes, edges, notes, orientation } = graph;
  const { selectedNodeIds, nodeSelectionOrder } = selections; // selectedEdgeIds

  // Existing operations
  const handleRotateLeft = useCallback(() => {
    const newOrientation = (orientation - 90 + 360) % 360;
    dispatch({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: newOrientation } });
  }, [dispatch, orientation]);

  const handleRotateRight = useCallback(() => {
    const newOrientation = incrementOrientationBy90(orientation);
    dispatch({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: newOrientation } });
  }, [dispatch, orientation]);

  const handleFitGraph = useCallback(() => {
    const cyInstance = typeof cy === 'function' ? cy() : cy;
    if (!cyInstance) return;

    printDebug('🎥 GraphOps: handleFitGraph called');
    
    // Get all nodes for fitting
    const allNodes = cyInstance.nodes();
    
    try {
      
      if (allNodes.length === 0) {
        printDebug('🎥 GraphOps: No nodes to fit, centering view');
        // No nodes to fit to, animate to center
        cyInstance.animate({
          pan: { x: 0, y: 0 },
          zoom: 1
        }, {
          duration: 400,
          easing: 'ease-in-out',
          complete: () => {
            dispatch({ type: ACTION_TYPES.SET_ZOOM_INTERNAL, payload: { zoom: 1 } });
            dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION_INTERNAL, payload: { position: { x: 0, y: 0 } } });
          }
        });
        return;
      }

      printDebug('🎥 GraphOps: Animating fit to all nodes');

      // Use animate with fit option for smooth transition
      cyInstance.animate({
        fit: {
          eles: allNodes,
          padding: 50
        }
      }, {
        duration: 400,
        easing: 'ease-in-out',
        complete: () => {
          // Update app state with the new camera position after animation
          const finalZoom = cyInstance.zoom();
          const finalPan = cyInstance.pan();
          
          printDebug('🎥 GraphOps: Fit animation complete', { zoom: finalZoom, pan: finalPan });
          
          dispatch({ type: ACTION_TYPES.SET_ZOOM_INTERNAL, payload: { zoom: finalZoom } });
          dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION_INTERNAL, payload: { position: finalPan } });
        }
      });
    } catch (error) {
      console.error('Error animating fit to graph:', error);
      // Fallback to instant fit if animation fails
      try {
        cyInstance.fit(allNodes || cyInstance.nodes(), 50);
        
        const cameraInfo = {
          zoom: cyInstance.zoom(),
          position: cyInstance.pan()
        };
        dispatch({ type: ACTION_TYPES.SET_ZOOM_INTERNAL, payload: { zoom: cameraInfo.zoom } });
        dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION_INTERNAL, payload: { position: cameraInfo.position } });
      } catch (fallbackError) {
        console.error('Error with fallback fit:', fallbackError);
      }
    }
  }, [cy, dispatch]);

  // New mutation operations
  const handleNodeMove = useCallback((nodeId, pos) => {
    const { x: newX, y: newY } = pos;
    printDebug('🏠 GraphOps: handleNodeMove', nodeId, newX, newY);
    
    saveUndoCheckpoint({ nodes, edges, notes, orientation });
    
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (n.id === nodeId ? { ...n, x: newX, y: newY } : n))
    }));
  }, [saveUndoCheckpoint, setGraphData, nodes, edges, notes, orientation]);

  const handleCreateNode = useCallback(() => {
    printDebug('🏠 GraphOps: Create node');

    let counter = 1, uniqueId, uniqueTitle;
    do {
      uniqueId = 'untitled' + counter;
      uniqueTitle = 'untitled' + counter;
      counter++;
    } while (nodes.some(n => n.id === uniqueId || n.title === uniqueTitle));

    const { x: centerX, y: centerY } = getViewportCenter();

    const newNode = {
      id: uniqueId,
      title: uniqueTitle,
      size: "regular",
      color: "gray",
      x: Math.round(centerX),
      y: Math.round(centerY),
      imageUrl: "unspecified"
    };

    saveUndoCheckpoint({ nodes, edges, notes, orientation });
    setGraphData(prev => ({ ...prev, nodes: [...prev.nodes, newNode] }));
  }, [nodes, edges, notes, orientation, getViewportCenter, saveUndoCheckpoint, setGraphData]);

  const handleDeleteSelectedNodes = useCallback((nodeIds) => {
    printDebug('🏠 GraphOps: Deleting nodes:', nodeIds);

    saveUndoCheckpoint({ nodes, edges, notes, orientation });
    
    setGraphData(prev => {
      const filteredNodes = prev.nodes.filter(n => !nodeIds.includes(n.id));
      const filteredEdges = prev.edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));
      return { ...prev, nodes: filteredNodes, edges: filteredEdges };
    });

    clearCytoscapeSelections();
    dispatch({
      type: ACTION_TYPES.SET_NODE_SELECTION,
      payload: { nodeIds: [], selectionOrder: [] }
    });
  }, [nodes, edges, notes, orientation, saveUndoCheckpoint, setGraphData, clearCytoscapeSelections, dispatch]);

  const handleDeleteSelectedEdges = useCallback((edgeIds) => {
    printDebug('🏠 GraphOps: Deleting edges by id:', edgeIds);
    
    saveUndoCheckpoint({ nodes, edges, notes, orientation });
    
    setGraphData(prev => ({
      ...prev,
      edges: prev.edges.filter(e => !edgeIds.includes(e.id))
    }));

    clearCytoscapeSelections();
    dispatch({
      type: ACTION_TYPES.SET_EDGE_SELECTION,
      payload: { edgeIds: [] }
    });
  }, [nodes, edges, notes, orientation, saveUndoCheckpoint, setGraphData, clearCytoscapeSelections, dispatch]);

  const handleConnectSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 2 && nodeSelectionOrder.length === 2) {
      const [sourceId, targetId] = nodeSelectionOrder;
      printDebug('🏠 GraphOps: Connecting (ordered):', sourceId, '->', targetId);

      saveUndoCheckpoint({ nodes, edges, notes, orientation });

      setGraphData(prev => {
        const exists = prev.edges.some(e => e.source === sourceId && e.target === targetId);
        if (exists) return prev;
        const newEdge = {
          id: edgeId(sourceId, targetId),
          source: sourceId,
          target: targetId,
          direction: "forward"
        };
        return { ...prev, edges: [...prev.edges, newEdge] };
      });

      clearCytoscapeSelections();
      dispatch({
        type: ACTION_TYPES.SET_NODE_SELECTION,
        payload: { nodeIds: [], selectionOrder: [] }
      });
    }
  }, [selectedNodeIds, nodeSelectionOrder, nodes, edges, notes, orientation, saveUndoCheckpoint, setGraphData, clearCytoscapeSelections, dispatch]);

  const handleEdgeDirectionChange = useCallback((edgeIdArg, newDirection) => {
    printDebug('🏠 GraphOps: Changing edge direction:', edgeIdArg, '->', newDirection);
    
    saveUndoCheckpoint({ nodes, edges, notes, orientation });
    
    setGraphData(prev => ({
      ...prev,
      edges: prev.edges.map(e => (e.id === edgeIdArg ? { ...e, direction: newDirection } : e))
    }));
  }, [nodes, edges, notes, orientation, saveUndoCheckpoint, setGraphData]);

  const handleNodeSizeChange = useCallback((nodeId, newSize) => {
    printDebug('🏠 GraphOps: Changing node size:', nodeId, '->', newSize);

    saveUndoCheckpoint({ nodes, edges, notes, orientation });

    updateNodeInPlace(nodeId, { size: newSize });

    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (n.id === nodeId ? { ...n, size: newSize } : n))
    }));
  }, [nodes, edges, notes, orientation, saveUndoCheckpoint, updateNodeInPlace, setGraphData]);

  const handleNodeColorChange = useCallback((nodeIds, newColor) => {
    printDebug('🏠 GraphOps: Change color:', nodeIds, '->', newColor);

    saveUndoCheckpoint({ nodes, edges, notes, orientation });

    nodeIds.forEach(id => updateNodeInPlace(id, { color: newColor }));

    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (nodeIds.includes(n.id) ? { ...n, color: newColor } : n))
    }));
  }, [nodes, edges, notes, orientation, saveUndoCheckpoint, updateNodeInPlace, setGraphData]);

  const handleRotateNodesAndMap = useCallback(() => {
    const cyInstance = typeof cy === 'function' ? cy() : cy;
    
    saveUndoCheckpoint({ nodes, edges, notes, orientation });
    
    setGraphData(prev => {
      const { nodes: rotated } = rotateNodesAndCompass(prev.nodes, orientation);
      printDebug('🌀 GraphOps: Rotated nodes data updated, triggering re-render:', { 
        nodeCount: rotated.length, 
        firstNodeBefore: prev.nodes[0] ? `(${prev.nodes[0].x}, ${prev.nodes[0].y})` : 'none',
        firstNodeAfter: rotated[0] ? `(${rotated[0].x}, ${rotated[0].y})` : 'none'
      });
      
      if (cyInstance) {
        printDebug('🔄 GraphOps: Forcing immediate position update in Cytoscape after rotation');
        rotated.forEach(node => {
          const cyNode = cyInstance.getElementById(node.id);
          if (cyNode.length > 0) {
            cyNode.position({ x: node.x, y: node.y });
          }
        });
        cyInstance.fit(cyInstance.nodes(), 50);
      }
      
      return { ...prev, nodes: rotated };
    });
    
    const next = ((orientation + 90) % 360 + 360) % 360;
    dispatch({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: next } });
  }, [orientation, nodes, edges, notes, saveUndoCheckpoint, setGraphData, cy, dispatch]);

  // Legacy operations for backward compatibility
  const handleResetSelection = useCallback(() => {
    const cyInstance = typeof cy === 'function' ? cy() : cy;
    if (!cyInstance) return;
    cyInstance.elements().unselect();
    clearCytoscapeSelections?.();
  }, [cy, clearCytoscapeSelections]);

  return {
    // Existing operations
    handleRotateLeft,
    handleRotateRight,
    handleFitGraph,
    handleResetSelection,
    
    // New mutation operations
    handleNodeMove,
    handleCreateNode,
    handleDeleteSelectedNodes,
    handleDeleteSelectedEdges,
    handleConnectSelectedNodes,
    handleEdgeDirectionChange,
    handleNodeSizeChange,
    handleNodeColorChange,
    handleRotateNodesAndMap
  };
}