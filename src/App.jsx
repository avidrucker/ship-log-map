import React, { useState, useEffect, useCallback, useRef, useReducer } from "react";
import CytoscapeGraph from "./CytoscapeGraph";
import defaultShipLogData from "./default_ship_log.json";
import { loadAndValidateRumorMapFromFile } from "./rumorMapValidation";
import GraphControls from "./GraphControls";
import NodeRenameModal from "./NodeRenameModal";
import NoteEditorModal from "./NoteEditorModal";
import CameraInfo from "./CameraInfo";
import ErrorDisplay from "./ErrorDisplay";
import { useCytoscapeInstance } from "./useCytoscapeInstance";
import { appStateReducer, initialAppState, ACTION_TYPES } from "./appStateReducer";

// Debug flag - set to false to disable all debug logging
const DEBUG = false;
const printDebug = (...args) => {
  if (DEBUG) console.log(...args);
};

function App() {
  // Clear localStorage to get fresh data with coordinates (remove after first load)
  // localStorage.removeItem("shipLog");
  
  const fileInputRef = useRef(null);
  
  // Use the Cytoscape instance management hook
  const {
    setCytoscapeInstance,
    updateNodeInPlace,
    clearCytoscapeSelections,
    fitToView,
    getViewportCenter,
    exportNodePositions
  } = useCytoscapeInstance();
  
  const [graphData, setGraphData] = useState(() => {
    const saved = localStorage.getItem("shipLog");
    if (saved) {
      const parsedData = JSON.parse(saved);
      // Check if the saved data has coordinates, if not, merge with initial data
      const hasCoordinates = parsedData.nodes.every(node => 
        typeof node.x === 'number' && typeof node.y === 'number'
      );
      
      // Ensure all nodes have color property
      const migratedNodes = parsedData.nodes.map(node => ({
        ...node,
        color: node.color || "gray"
      }));
      
      if (hasCoordinates) {
        return { ...parsedData, nodes: migratedNodes };
      } else {
        // Merge saved data with initial graph to get coordinates
        const mergedNodes = migratedNodes.map(savedNode => {
          const initialNode = defaultShipLogData.nodes.find(n => n.id === savedNode.id);
          return {
            ...savedNode,
            x: initialNode?.x || 0,
            y: initialNode?.y || 0
          };
        });
        return { ...parsedData, nodes: mergedNodes };
      }
    }
    return defaultShipLogData;
  });

  // Notes data structure: { [targetId]: [note1, note2, ...] }
  const [notesData, setNotesData] = useState(() => {
    const saved = localStorage.getItem("shipLogNotes");
    if (saved) {
      return JSON.parse(saved);
    }
    // If no saved notes, load from default JSON if present
    return defaultShipLogData.notes || {};
  });

  // Use the unified state reducer for selections, camera, and UI state
  const [appState, dispatchAppState] = useReducer(appStateReducer, {
    ...initialAppState,
    camera: {
      zoom: (() => {
        const saved = localStorage.getItem("shipLogCamera");
        return saved ? JSON.parse(saved).zoom || 1 : 1;
      })(),
      position: (() => {
        const saved = localStorage.getItem("shipLogCamera");
        return saved ? JSON.parse(saved).position || { x: 0, y: 0 } : { x: 0, y: 0 };
      })()
    }
  });
  
  // Extract frequently used state for easier access
  const { selections, camera, ui } = appState;
  const selectedNodeIds = selections.nodes.ids;
  const nodeSelectionOrder = selections.nodes.order;
  const selectedEdgeIds = selections.edges.ids;
  const renamingNodeId = selections.renaming.nodeId;
  const renameInputValue = selections.renaming.value;
  const noteEditingTarget = selections.noteEditing.targetId;
  const noteEditingType = selections.noteEditing.targetType;
  const zoomLevel = camera.zoom;
  const cameraPosition = camera.position;
  const shouldFitOnNextRender = ui.shouldFitOnNextRender;
  const loadError = ui.loadError;

  // Add debugging for state changes
  useEffect(() => {
    printDebug('🏠 App: zoomLevel changed to:', zoomLevel);
  }, [zoomLevel]);

  useEffect(() => {
    printDebug('🏠 App: cameraPosition changed to:', cameraPosition);
  }, [cameraPosition]);

  useEffect(() => {
    printDebug('🏠 App: shouldFitOnNextRender changed to:', shouldFitOnNextRender);
  }, [shouldFitOnNextRender]);

  useEffect(() => {
    localStorage.setItem("shipLog", JSON.stringify(graphData));
  }, [graphData]);

  // Save camera state to localStorage
  useEffect(() => {
    localStorage.setItem("shipLogCamera", JSON.stringify({
      zoom: zoomLevel,
      position: cameraPosition
    }));
  }, [zoomLevel, cameraPosition]);

  // Save notes data to localStorage
  useEffect(() => {
    localStorage.setItem("shipLogNotes", JSON.stringify(notesData));
  }, [notesData]);

  const handleNodeMove = useCallback((nodeId, newX, newY) => {
    printDebug('🏠 App: handleNodeMove called for node:', nodeId, 'new position:', newX, newY);
    setGraphData(prevData => {
      printDebug('🏠 App: Updating graphData state');
      return {
        ...prevData,
        nodes: prevData.nodes.map(node => 
          node.id === nodeId 
            ? { ...node, x: newX, y: newY }
            : node
        )
      };
    });
  }, []);

  const handleFitToView = useCallback(() => {
    fitToView(50); // Use the optimized version from the hook
  }, [fitToView]);

  const handleFitCompleted = useCallback(() => {
    printDebug('🏠 App: handleFitCompleted called, setting shouldFitOnNextRender to false');
    dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: false } });
  }, []);

  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
    
    try {
      const result = await loadAndValidateRumorMapFromFile(file);
      
      if (result.isValid) {
        // Load the new map data
        setGraphData(result.data);
        
        // Load notes data if present, or initialize empty notes if not
        const loadedNotes = result.data.notes || {};
        setNotesData(loadedNotes);
        
        // Reset camera to initial state
        dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: 1 } });
        dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: { x: 0, y: 0 } } });
        
        // Trigger fit on next render
        dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });
        
        // Clear selections - both React state and Cytoscape selection
        clearCytoscapeSelections();
        dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
      } else {
        dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: `Invalid map file: ${result.errors.join('; ')}` } });
      }
    } catch (error) {
      dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: `Failed to load file: ${error.message}` } });
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  }, [clearCytoscapeSelections]);

  const handleResetToInitial = useCallback(() => {
    // Reset graph data to initial state
    setGraphData(defaultShipLogData);
    
    // Reset notes data to initial state (load from default if present, or empty if not)
    const initialNotes = defaultShipLogData.notes || {};
    setNotesData(initialNotes);
    
    // Reset camera to initial state (zoom 100%, center position)
    dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: 1 } });
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: { x: 0, y: 0 } } });
    
    // Trigger fit on next render
    dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });
    
    // Clear any load errors and selections - both React state and Cytoscape selection
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
    clearCytoscapeSelections();
    dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
  }, [clearCytoscapeSelections]);

  const clearError = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
  }, []);

  const handleEdgeSelectionChange = useCallback((edgeIds) => {
    printDebug('🏠 App: Edge selection changed to:', edgeIds);
    dispatchAppState({ 
      type: ACTION_TYPES.SET_EDGE_SELECTION, 
      payload: { edgeIds } 
    });
  }, []);

  const handleDeleteSelectedEdges = useCallback((edgeIds) => {
    printDebug('🏠 App: Deleting edges:', edgeIds);
    
    setGraphData(prevData => {
      const updatedEdges = prevData.edges.filter((edge, index) => {
        const edgeId = `edge-${index}`;
        return !edgeIds.includes(edgeId);
      });
      
      return {
        ...prevData,
        edges: updatedEdges
      };
    });
    
    // Clear selection after deletion - use optimized method instead of DOM query
    clearCytoscapeSelections();
    dispatchAppState({ 
      type: ACTION_TYPES.SET_EDGE_SELECTION, 
      payload: { edgeIds: [] } 
    });
  }, [clearCytoscapeSelections]);

  const handleDeleteSelectedNodes = useCallback((nodeIds) => {
    printDebug('🏠 App: Deleting nodes:', nodeIds);
    
    setGraphData(prevData => {
      // Remove the selected nodes
      const updatedNodes = prevData.nodes.filter(node => !nodeIds.includes(node.id));
      
      // Remove all edges that connect to the deleted nodes
      const updatedEdges = prevData.edges.filter(edge => 
        !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)
      );
      
      printDebug('🏠 App: Removed', prevData.nodes.length - updatedNodes.length, 'nodes and', prevData.edges.length - updatedEdges.length, 'edges');
      
      return {
        ...prevData,
        nodes: updatedNodes,
        edges: updatedEdges
      };
    });
    
    // Clear selection after deletion - use optimized method instead of DOM query
    clearCytoscapeSelections();
    dispatchAppState({ 
      type: ACTION_TYPES.SET_NODE_SELECTION, 
      payload: { nodeIds: [], selectionOrder: [] } 
    });
  }, [clearCytoscapeSelections]);

  const handleNodeSelectionChange = useCallback((nodeIds, selectionOrder) => {
    printDebug('🏠 App: Node selection changed to:', nodeIds, 'Order:', selectionOrder);
    dispatchAppState({ 
      type: ACTION_TYPES.SET_NODE_SELECTION, 
      payload: { nodeIds, selectionOrder } 
    });
  }, []);

  const handleConnectSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 2 && nodeSelectionOrder.length === 2) {
      // Use selection order: first selected -> second selected
      const [sourceId, targetId] = nodeSelectionOrder;
      printDebug('🏠 App: Connecting nodes in selection order:', sourceId, '->', targetId);
      
      setGraphData(prevData => {
        // Check if edge already exists
        const edgeExists = prevData.edges.some(edge => 
          edge.source === sourceId && edge.target === targetId
        );
        
        if (!edgeExists) {
          const newEdge = {
            source: sourceId,
            target: targetId,
            direction: "forward"
          };
          
          return {
            ...prevData,
            edges: [...prevData.edges, newEdge]
          };
        }
        
        return prevData; // No change if edge already exists
      });
      
      // Clear node selection after connecting - use optimized method instead of DOM query
      clearCytoscapeSelections();
      dispatchAppState({ 
        type: ACTION_TYPES.SET_NODE_SELECTION, 
        payload: { nodeIds: [], selectionOrder: [] } 
      });
    }
  }, [selectedNodeIds, nodeSelectionOrder, clearCytoscapeSelections]);

  const handleEdgeDirectionChange = useCallback((edgeId, newDirection) => {
    printDebug('🏠 App: Changing edge direction:', edgeId, 'to:', newDirection);
    
    setGraphData(prevData => {
      // Find the edge index from the edge ID
      const edgeIndex = parseInt(edgeId.replace('edge-', ''));
      
      if (edgeIndex >= 0 && edgeIndex < prevData.edges.length) {
        const updatedEdges = [...prevData.edges];
        updatedEdges[edgeIndex] = {
          ...updatedEdges[edgeIndex],
          direction: newDirection
        };
        
        return {
          ...prevData,
          edges: updatedEdges
        };
      }
      
      return prevData; // No change if edge not found
    });
  }, []);

  const handleNodeSizeChange = useCallback((nodeId, newSize) => {
    printDebug('🏠 App: Changing node size:', nodeId, 'to:', newSize);
    
    // Update in place for immediate visual feedback (performance optimization)
    updateNodeInPlace(nodeId, { size: newSize });
    
    // Always update React state for persistence
    setGraphData(prevData => {
      const updatedNodes = prevData.nodes.map(node => 
        node.id === nodeId 
          ? { ...node, size: newSize }
          : node
      );
      
      return {
        ...prevData,
        nodes: updatedNodes
      };
    });
  }, [updateNodeInPlace]);

  const handleStartRename = useCallback((nodeId) => {
    printDebug('🏠 App: Starting rename for node:', nodeId);
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) {        dispatchAppState({ 
          type: ACTION_TYPES.START_RENAME, 
          payload: { nodeId, initialValue: node.title } 
        });
    }
  }, [graphData.nodes]);

  const handleCancelRename = useCallback(() => {
    printDebug('🏠 App: Cancelling rename');
    dispatchAppState({ type: ACTION_TYPES.CANCEL_RENAME });
  }, []);

  // Handle mouse-downs outside the rename modal to cancel renaming
  const handleBackgroundMouseDown = useCallback((event) => {
    // Only cancel if we're currently renaming and the mouse-down is outside the rename modal
    if (renamingNodeId) {
      // Check if the mouse-down target is the canvas or a parent element, not the rename modal
      const renameModal = event.target.closest('[data-rename-modal]');
      if (!renameModal) {
        printDebug('🏠 App: Background mouse-down detected, cancelling rename');
        handleCancelRename();
      }
    }
  }, [renamingNodeId, handleCancelRename]);

  const handleSubmitRename = useCallback(() => {
    if (!renamingNodeId || !renameInputValue.trim()) {
      handleCancelRename();
      return;
    }

    const newTitle = renameInputValue.trim();
    printDebug('🏠 App: Submitting rename for node:', renamingNodeId, 'new title:', newTitle);

    // Find a unique ID based on the new title
    let baseId = newTitle.replace(/[^a-zA-Z0-9]/g, ''); // Remove special characters
    if (!baseId) baseId = 'node'; // Fallback if title has no valid characters
    
    let counter = 1;
    let uniqueId = baseId;
    
    // Keep incrementing until we find a unique ID (excluding the current node being renamed)
    while (graphData.nodes.some(node => node.id === uniqueId && node.id !== renamingNodeId)) {
      uniqueId = `${baseId}${counter}`;
      counter++;
    }
    
    printDebug('🏠 App: Generated unique ID:', uniqueId);

    setGraphData(prevData => {
      const updatedNodes = prevData.nodes.map(node => 
        node.id === renamingNodeId 
          ? { ...node, id: uniqueId, title: newTitle }
          : node
      );
      
      // Also update any edges that reference the old node ID
      const updatedEdges = prevData.edges.map(edge => ({
        ...edge,
        source: edge.source === renamingNodeId ? uniqueId : edge.source,
        target: edge.target === renamingNodeId ? uniqueId : edge.target
      }));
      
      return {
        ...prevData,
        nodes: updatedNodes,
        edges: updatedEdges
      };
    });

    // Clear selections since the node ID changed
    clearCytoscapeSelections();
    dispatchAppState({ 
      type: ACTION_TYPES.SET_NODE_SELECTION, 
      payload: { nodeIds: [], selectionOrder: [] } 
    });
    
    // Clear rename state
    dispatchAppState({ type: ACTION_TYPES.CANCEL_RENAME });
  }, [renamingNodeId, renameInputValue, graphData.nodes, handleCancelRename, clearCytoscapeSelections]);

  const handleCreateNode = useCallback(() => {
    printDebug('🏠 App: Creating new node');
    
    // Find a unique ID and title
    let counter = 1;
    let uniqueId;
    let uniqueTitle;
    
    do {
      uniqueId = `untitled${counter}`;
      uniqueTitle = `untitled${counter}`;
      counter++;
    } while (graphData.nodes.some(node => node.id === uniqueId || node.title === uniqueTitle));
    
    printDebug('🏠 App: Found unique ID/title:', uniqueId);
    
    // Get the current camera center using the optimized method
    const viewportCenter = getViewportCenter();
    const centerX = viewportCenter.x;
    const centerY = viewportCenter.y;
    
    printDebug('🏠 App: Creating node at viewport center:', centerX, centerY);
    
    // Create new node
    const newNode = {
      id: uniqueId,
      title: uniqueTitle,
      size: "regular",
      color: "gray",
      x: Math.round(centerX),
      y: Math.round(centerY)
    };
    
    setGraphData(prevData => ({
      ...prevData,
      nodes: [...prevData.nodes, newNode]
    }));
    
    printDebug('🏠 App: Node created successfully:', newNode);
  }, [graphData, getViewportCenter]);

  const exportMap = useCallback(() => {
    // Use the optimized method from the hook instead of DOM query
    const nodePositions = exportNodePositions();
    
    // If we have node positions from Cytoscape, use them; otherwise fallback to graphData
    let updatedNodes;
    if (nodePositions.length > 0) {
      updatedNodes = nodePositions.map(pos => ({
        ...graphData.nodes.find(node => node.id === pos.id),
        x: pos.x,
        y: pos.y
      }));
    } else {
      // Fallback to current graphData if Cytoscape instance not available
      updatedNodes = graphData.nodes;
    }
    
    // Include notes data in the exported JSON
    const updatedGraph = { 
      ...graphData, 
      nodes: updatedNodes,
      notes: notesData 
    };

    const blob = new Blob([JSON.stringify(updatedGraph, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "ship_log_export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [graphData, exportNodePositions, notesData]);

  const handleNodeColorChange = useCallback((nodeIds, newColor) => {
    printDebug('🏠 App: Changing node color for:', nodeIds, 'to:', newColor);
    
    // Update in place for immediate visual feedback (performance optimization)
    nodeIds.forEach(nodeId => {
      updateNodeInPlace(nodeId, { color: newColor });
    });
    
    // Always update React state for persistence
    setGraphData(prevData => {
      const updatedNodes = prevData.nodes.map(node => 
        nodeIds.includes(node.id)
          ? { ...node, color: newColor }
          : node
      );
      
      return {
        ...prevData,
        nodes: updatedNodes
      };
    });
  }, [updateNodeInPlace]);

  // Helper function to update rename input value
  const setRenameInputValue = useCallback((value) => {
    dispatchAppState({ 
      type: ACTION_TYPES.UPDATE_RENAME_VALUE, 
      payload: { value } 
    });
  }, []);

  // Helper functions to update camera state
  const setZoomLevel = useCallback((zoom) => {
    dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom } });
  }, []);

  const setCameraPosition = useCallback((position) => {
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position } });
  }, []);

  // Note management handlers
  const handleStartNoteEditing = useCallback((targetId, targetType) => {
    dispatchAppState({ 
      type: ACTION_TYPES.START_NOTE_EDITING, 
      payload: { targetId, targetType } 
    });
  }, []);

  const handleCloseNoteEditing = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_EDITING });
  }, []);

  const handleUpdateNotes = useCallback((targetId, newNotes) => {
    setNotesData(prevData => ({
      ...prevData,
      [targetId]: newNotes
    }));
  }, []);

  const areNodesConnected = useCallback((sourceId, targetId) => {
    return graphData.edges.some(edge => 
      (edge.source === sourceId && edge.target === targetId) ||
      (edge.source === targetId && edge.target === sourceId)
    );
  }, [graphData.edges]);

  return (
    <div 
      style={{ 
        position: "fixed", 
        top: 0, 
        left: 0, 
        width: "100%", 
        height: "100%", 
        overflow: "hidden" 
      }}
      onMouseDown={handleBackgroundMouseDown}
    >
      <GraphControls
        selectedNodes={selectedNodeIds}
        selectedEdges={selectedEdgeIds}
        onCreateNode={handleCreateNode}
        onDeleteSelectedNodes={handleDeleteSelectedNodes}
        onDeleteSelectedEdges={handleDeleteSelectedEdges}
        onRenameNode={handleStartRename}
        onConnectNodes={handleConnectSelectedNodes}
        onExportMap={exportMap}
        onImportFile={handleFileSelect}
        onResetMap={handleResetToInitial}
        onFitToView={handleFitToView}
        fileInputRef={fileInputRef}
        onNodeColorChange={handleNodeColorChange}
        areNodesConnected={areNodesConnected}
        renamingNodeId={renamingNodeId}
      />

      <NodeRenameModal
        renamingNodeId={renamingNodeId}
        renameInputValue={renameInputValue}
        setRenameInputValue={setRenameInputValue}
        onSubmitRename={handleSubmitRename}
        onCancelRename={handleCancelRename}
      />

      <NoteEditorModal
        targetId={noteEditingTarget}
        targetType={noteEditingType}
        notes={noteEditingTarget ? (notesData[noteEditingTarget] || []) : []}
        onUpdateNotes={handleUpdateNotes}
        onClose={handleCloseNoteEditing}
      />

      <CameraInfo
        zoom={zoomLevel}
        pan={cameraPosition}
        selectedNodeIds={selectedNodeIds}
        selectedEdgeIds={selectedEdgeIds}
      />

      <ErrorDisplay error={loadError} onClearError={clearError} />

      <CytoscapeGraph 
        graphData={graphData} 
        onNodeMove={handleNodeMove}
        onZoomChange={setZoomLevel}
        onCameraMove={setCameraPosition}
        initialZoom={zoomLevel}
        initialCameraPosition={cameraPosition}
        shouldFitOnNextRender={shouldFitOnNextRender}
        onFitCompleted={handleFitCompleted}
        onEdgeSelectionChange={handleEdgeSelectionChange}
        onDeleteSelectedEdges={handleDeleteSelectedEdges}
        onNodeSelectionChange={handleNodeSelectionChange}
        onEdgeDirectionChange={handleEdgeDirectionChange}
        onDeleteSelectedNodes={handleDeleteSelectedNodes}
        onNodeSizeChange={handleNodeSizeChange}
        onNodeColorChange={handleNodeColorChange}
        onNodeClick={handleStartNoteEditing}
        onEdgeClick={handleStartNoteEditing}
        onBackgroundClick={handleCloseNoteEditing}
        onCytoscapeInstanceReady={setCytoscapeInstance}
      />
    </div>
  );
}

export default App;
