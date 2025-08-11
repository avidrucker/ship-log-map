// src/App.jsx
import React, { useState, useEffect, useCallback, useRef, useReducer } from "react";
import CytoscapeGraph from "./CytoscapeGraph";
import defaultShipLogData from "./default_ship_log.json";
import { loadAndValidateRumorMapFromFile } from "./rumorMapValidation";
import GraphControls from "./GraphControls";
import NoteEditorModal from "./NoteEditorModal";
import NoteViewerModal from "./NoteViewerModal";
import CameraInfo from "./CameraInfo";
import ErrorDisplay from "./ErrorDisplay";
import { TEST_ICON_SVG } from "./constants/testAssets.js";
import { useCytoscapeInstance } from "./useCytoscapeInstance";
import { appStateReducer, initialAppState, ACTION_TYPES } from "./appStateReducer";
import { ZOOM_TO_SELECTION, DEBUG_LOGGING, MODE_TOGGLE } from "./config/features.js";

// 🚀 New imports: centralized persistence + edge id helper
import { saveToLocal, loadFromLocal, saveModeToLocal, loadModeFromLocal } from "./persistence/index.js";
import { edgeId } from "./graph/ops.js";

// Debug flag - controlled by feature config
const DEBUG = DEBUG_LOGGING;
const printDebug = (...args) => {
  if (DEBUG) console.log(...args);
};

/** ---------- helpers & migration ---------- **/

// ensure every node has size/color/x/y; every edge has id & direction
function normalizeGraphData(data) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  const notes = data?.notes && typeof data.notes === "object" ? data.notes : {};
  const mode = typeof data?.mode === "string" ? data.mode : "editing";

  const normNodes = nodes.map(n => ({
    id: n.id,
    title: n.title ?? n.label ?? "",
    size: n.size ?? "regular",
    color: n.color ?? "gray",
    x: typeof n.x === "number" ? n.x : 0,
    y: typeof n.y === "number" ? n.y : 0,
    imageUrl: n.imageUrl || TEST_ICON_SVG
  }));

  const normEdges = edges.map(e => ({
    id: e.id || edgeId(e.source, e.target),
    source: e.source,
    target: e.target,
    direction: e.direction ?? "forward"
  }));

  return { nodes: normNodes, edges: normEdges, notes, mode };
}

// if any node lacks coords, hydrate from default by id
function hydrateCoordsIfMissing(graph, defaultGraph) {
  const hasAllCoords = graph.nodes.every(n => typeof n.x === "number" && typeof n.y === "number");
  if (hasAllCoords) return graph;

  const defMap = new Map(defaultGraph.nodes.map(n => [n.id, n]));
  return {
    ...graph,
    nodes: graph.nodes.map(n => {
      if (typeof n.x === "number" && typeof n.y === "number") return n;
      const d = defMap.get(n.id);
      return { ...n, x: d?.x ?? 0, y: d?.y ?? 0 };
    })
  };
}

function App() {
  const fileInputRef = useRef(null);

  // Use the Cytoscape instance management hook
  const {
    setCytoscapeInstance,
    updateNodeInPlace,
    clearCytoscapeSelections,
    fitToView,
    getViewportCenter,
    exportNodePositions,
    // Camera state management for zoom-to-selection
    saveOriginalCamera, // eslint-disable-line no-unused-vars
    restoreOriginalCamera,
    fitToSelection,
    hasOriginalCamera
  } = useCytoscapeInstance();

  // ---------- graph (nodes/edges/notes/mode) ----------
  const [graphData, setGraphData] = useState(() => {
    // Try new persistence; fall back to default
    const saved = loadFromLocal();
    if (saved) {
      // normalize and hydrate coords from default if needed
      const g1 = normalizeGraphData(saved);
      const g2 = hydrateCoordsIfMissing(g1, defaultShipLogData);
      return g2;
    }
    // default data normalized
    return normalizeGraphData(defaultShipLogData);
  });

  // ---------- reducer state (camera, selections, ui) ----------
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
    },
    mode: (() => {
      // Try to get mode from loaded graph data first, then from localStorage
      const saved = loadFromLocal();
      if (saved && saved.mode) {
        return saved.mode;
      }
      return loadModeFromLocal();
    })()
  });

  // Extract frequently used state for easier access
  const { selections, camera, ui, mode } = appState;
  const selectedNodeIds = selections.nodes.ids;
  const nodeSelectionOrder = selections.nodes.order;
  const selectedEdgeIds = selections.edges.ids;
  const noteEditingTarget = selections.noteEditing.targetId;
  const noteEditingType = selections.noteEditing.targetType;
  const noteViewingTarget = selections.noteViewing.targetId;
  const zoomLevel = camera.zoom;
  const cameraPosition = camera.position;
  const shouldFitOnNextRender = ui.shouldFitOnNextRender;
  const loadError = ui.loadError;

  // ---------- debug taps ----------
  useEffect(() => { printDebug('🏠 App: zoomLevel changed to:', zoomLevel); }, [zoomLevel]);
  useEffect(() => { printDebug('🏠 App: cameraPosition changed to:', cameraPosition); }, [cameraPosition]);
  useEffect(() => { printDebug('🏠 App: shouldFitOnNextRender changed to:', shouldFitOnNextRender); }, [shouldFitOnNextRender]);

  // ---------- persistence ----------
  useEffect(() => {
    // persist graph (nodes/edges/notes) and mode
    const dataWithMode = { ...graphData, mode };
    saveToLocal(dataWithMode);
  }, [graphData, mode]);

  // Save camera state to localStorage (kept as-is)
  useEffect(() => {
    localStorage.setItem("shipLogCamera", JSON.stringify({
      zoom: zoomLevel,
      position: cameraPosition
    }));
  }, [zoomLevel, cameraPosition]);

  // Save mode to localStorage
  useEffect(() => {
    saveModeToLocal(mode);
  }, [mode]);

  /** ---------- handlers ---------- **/

  // (changed signature) receives position object {x, y}
  const handleNodeMove = useCallback((nodeId, pos) => {
    const { x: newX, y: newY } = pos;
    printDebug('🏠 App: handleNodeMove', nodeId, newX, newY);
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (n.id === nodeId ? { ...n, x: newX, y: newY } : n))
    }));
  }, []);

  const handleFitToView = useCallback(() => {
    fitToView(50);
  }, [fitToView]);

  const handleFitCompleted = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: false } });
  }, []);

  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });

    try {
      const result = await loadAndValidateRumorMapFromFile(file);
      if (result.isValid) {
        // normalize, hydrate coords, persist
        const g1 = normalizeGraphData(result.data);
        const g2 = hydrateCoordsIfMissing(g1, defaultShipLogData);
        setGraphData(g2);

        // Set mode if it's included in the imported data
        if (g1.mode) {
          dispatchAppState({ type: ACTION_TYPES.SET_MODE, payload: { mode: g1.mode } });
        }

        // Reset camera + fit
        dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: 1 } });
        dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: { x: 0, y: 0 } } });
        dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });

        // Clear selections
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
    // Reset to project defaults, normalized
    setGraphData(normalizeGraphData(defaultShipLogData));

    // Camera reset
    dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: 1 } });
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: { x: 0, y: 0 } } });
    dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });

    // Clear errors & selections
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
    clearCytoscapeSelections();
    dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
  }, [clearCytoscapeSelections]);

  const clearError = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
  }, []);

  const handleEdgeSelectionChange = useCallback((edgeIds) => {
    printDebug('🏠 App: Edge selection changed:', edgeIds);
    dispatchAppState({
      type: ACTION_TYPES.SET_EDGE_SELECTION,
      payload: { edgeIds }
    });
  }, []);

  // Now deletes by actual edge.id (not index)
  const handleDeleteSelectedEdges = useCallback((edgeIds) => {
    printDebug('🏠 App: Deleting edges by id:', edgeIds);
    setGraphData(prev => ({
      ...prev,
      edges: prev.edges.filter(e => !edgeIds.includes(e.id))
    }));

    clearCytoscapeSelections();
    dispatchAppState({
      type: ACTION_TYPES.SET_EDGE_SELECTION,
      payload: { edgeIds: [] }
    });
  }, [clearCytoscapeSelections]);

  const handleDeleteSelectedNodes = useCallback((nodeIds) => {
    printDebug('🏠 App: Deleting nodes:', nodeIds);

    setGraphData(prev => {
      const nodes = prev.nodes.filter(n => !nodeIds.includes(n.id));
      const edges = prev.edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));
      return { ...prev, nodes, edges };
    });

    clearCytoscapeSelections();
    dispatchAppState({
      type: ACTION_TYPES.SET_NODE_SELECTION,
      payload: { nodeIds: [], selectionOrder: [] }
    });
  }, [clearCytoscapeSelections]);

  // We now set selection order == ids from adapter; if you later emit order, it will still work
  const handleNodeSelectionChange = useCallback((nodeIds) => {
    printDebug('🏠 App: Node selection changed to:', nodeIds);
    
    // Maintain proper selection order by comparing with previous selection
    const newSelectionOrder = [...nodeSelectionOrder];
    
    // Remove nodes that are no longer selected
    const filteredOrder = newSelectionOrder.filter(id => nodeIds.includes(id));
    
    // Add newly selected nodes to the end
    const newNodes = nodeIds.filter(id => !newSelectionOrder.includes(id));
    const updatedOrder = [...filteredOrder, ...newNodes];
    
    dispatchAppState({
      type: ACTION_TYPES.SET_NODE_SELECTION,
      payload: { nodeIds, selectionOrder: updatedOrder }
    });
  }, [nodeSelectionOrder]);

  const handleConnectSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 2 && nodeSelectionOrder.length === 2) {
      const [sourceId, targetId] = nodeSelectionOrder;
      printDebug('🏠 App: Connecting (ordered):', sourceId, '->', targetId);

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
      dispatchAppState({
        type: ACTION_TYPES.SET_NODE_SELECTION,
        payload: { nodeIds: [], selectionOrder: [] }
      });
    }
  }, [selectedNodeIds, nodeSelectionOrder, clearCytoscapeSelections]);

  // Change direction by edge.id
  const handleEdgeDirectionChange = useCallback((edgeIdArg, newDirection) => {
    printDebug('🏠 App: Changing edge direction:', edgeIdArg, '->', newDirection);
    setGraphData(prev => ({
      ...prev,
      edges: prev.edges.map(e => (e.id === edgeIdArg ? { ...e, direction: newDirection } : e))
    }));
  }, []);

  const handleNodeSizeChange = useCallback((nodeId, newSize) => {
    printDebug('🏠 App: Changing node size:', nodeId, '->', newSize);

    // instant visual
    updateNodeInPlace(nodeId, { size: newSize });

    // persist
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (n.id === nodeId ? { ...n, size: newSize } : n))
    }));
  }, [updateNodeInPlace]);

  const handleNodeDoubleClick = useCallback((nodeId) => {
    printDebug('🏠 App: Node double-clicked:', nodeId);
    
    // Find the current node
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Cycle through sizes: regular -> double -> half -> regular
    let nextSize;
    switch (node.size) {
      case "regular":
        nextSize = "double";
        break;
      case "double":
        nextSize = "half";
        break;
      case "half":
        nextSize = "regular";
        break;
      default:
        nextSize = "regular";
        break;
    }

    handleNodeSizeChange(nodeId, nextSize);
  }, [graphData.nodes, handleNodeSizeChange]);

  const handleEdgeDoubleClick = useCallback((edgeId) => {
    printDebug('🏠 App: Edge double-clicked:', edgeId);
    
    // Find the current edge
    const edge = graphData.edges.find(e => e.id === edgeId);
    if (!edge) return;

    // Cycle through directions: forward -> backward -> bidirectional -> forward
    let nextDirection;
    switch (edge.direction) {
      case "forward":
        nextDirection = "backward";
        break;
      case "backward":
        nextDirection = "bidirectional";
        break;
      case "bidirectional":
        nextDirection = "forward";
        break;
      default:
        nextDirection = "forward";
        break;
    }

    handleEdgeDirectionChange(edgeId, nextDirection);
  }, [graphData.edges, handleEdgeDirectionChange]);

  const handleCreateNode = useCallback(() => {
    printDebug('🏠 App: Create node');

    // unique id/title
    let counter = 1, uniqueId, uniqueTitle;
    do {
      uniqueId = `untitled${counter}`;
      uniqueTitle = `untitled${counter}`;
      counter++;
    } while (graphData.nodes.some(n => n.id === uniqueId || n.title === uniqueTitle));

    const { x: centerX, y: centerY } = getViewportCenter();

    const newNode = {
      id: uniqueId,
      title: uniqueTitle,
      size: "regular",
      color: "gray",
      x: Math.round(centerX),
      y: Math.round(centerY),
      imageUrl: TEST_ICON_SVG // Use the test icon SVG as the default image
    };

    setGraphData(prev => ({ ...prev, nodes: [...prev.nodes, newNode] }));
  }, [graphData, getViewportCenter]);

  const exportMap = useCallback(() => {
    // latest positions from cy (if available)
    const positions = exportNodePositions();
    const updatedNodes = positions.length
      ? positions.map(pos => ({
          ...graphData.nodes.find(n => n.id === pos.id),
          x: pos.x, y: pos.y
        }))
      : graphData.nodes;

    const updatedGraph = {
      ...graphData,
      nodes: updatedNodes,
      mode // Include current mode in export
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
  }, [graphData, exportNodePositions, mode]);

  const handleNodeColorChange = useCallback((nodeIds, newColor) => {
    printDebug('🏠 App: Change color:', nodeIds, '->', newColor);

    nodeIds.forEach(id => updateNodeInPlace(id, { color: newColor }));

    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (nodeIds.includes(n.id) ? { ...n, color: newColor } : n))
    }));
  }, [updateNodeInPlace]);
  // camera
  const setZoomLevel = useCallback((zoom) => {
    dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom } });
  }, []);
  const setCameraPosition = useCallback((position) => {
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position } });
  }, []);

  // notes — now stored in graphData.notes
  const handleStartNoteEditing = useCallback((targetId, targetType) => {
    // Zoom to selection if feature is enabled
    if (ZOOM_TO_SELECTION && targetId) {
      fitToSelection([targetId], {
        animate: true,
        padding: 80,
        targetHalf: 'top',
        saveCamera: true,
        zoomLevel: 'close' // Zoom in close for single element editing
      });
    }
    
    dispatchAppState({
      type: ACTION_TYPES.START_NOTE_EDITING,
      payload: { targetId, targetType }
    });
  }, [fitToSelection]);

  const handleEditSelected = useCallback(() => {
    // Edit the first selected node or edge
    if (selectedNodeIds.length > 0) {
      handleStartNoteEditing(selectedNodeIds[0], "node");
    } else if (selectedEdgeIds.length > 0) {
      handleStartNoteEditing(selectedEdgeIds[0], "edge");
    }
  }, [selectedNodeIds, selectedEdgeIds, handleStartNoteEditing]);

  const handleCloseNoteEditing = useCallback(() => {
    // Restore original camera if feature is enabled and we have a saved camera state
    if (ZOOM_TO_SELECTION && hasOriginalCamera()) {
      restoreOriginalCamera(true);
    }
    
    dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_EDITING });
  }, [restoreOriginalCamera, hasOriginalCamera]);

  const handleStartNoteViewing = useCallback((targetId) => {
    dispatchAppState({
      type: ACTION_TYPES.START_NOTE_VIEWING,
      payload: { targetId }
    });
  }, []);

  const handleCloseNoteViewing = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_VIEWING });
  }, []);

  const handleModeToggle = useCallback(() => {
    const newMode = mode === 'editing' ? 'playing' : 'editing';
    dispatchAppState({
      type: ACTION_TYPES.SET_MODE,
      payload: { mode: newMode }
    });
    
    // Clear selections when switching modes
    clearCytoscapeSelections();
    dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
    
    // Close any open modals
    if (noteEditingTarget) {
      handleCloseNoteEditing();
    }
    if (noteViewingTarget) {
      handleCloseNoteViewing();
    }
  }, [mode, noteEditingTarget, noteViewingTarget, clearCytoscapeSelections, handleCloseNoteEditing, handleCloseNoteViewing]);

  const handleUpdateNotes = useCallback((targetId, newNotes) => {
    setGraphData(prev => ({
      ...prev,
      notes: { ...(prev.notes || {}), [targetId]: newNotes }
    }));
  }, []);

  const handleUpdateTitle = useCallback((targetId, targetType, newTitle) => {
    if (targetType === "node") {
      setGraphData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => (n.id === targetId ? { ...n, title: newTitle } : n))
      }));
    } else if (targetType === "edge") {
      // For edges, we could store title in a custom property or handle differently
      // For now, let's assume edges don't have editable titles, but we'll keep the interface
      console.warn("Edge title editing not yet implemented");
    }
  }, []);

  const handleNodeClick = useCallback((nodeId) => {
    if (mode === 'playing') {
      // In playing mode, clicking a node opens the note viewer
      handleStartNoteViewing(nodeId);
    }
    // In editing mode, clicking does nothing (selection is handled by Cytoscape)
  }, [mode, handleStartNoteViewing]);

  const handleEdgeClick = useCallback((edgeId) => {
    if (mode === 'playing') {
      // In playing mode, clicking an edge opens the note viewer
      handleStartNoteViewing(edgeId);
    }
    // In editing mode, clicking does nothing (selection is handled by Cytoscape)
  }, [mode, handleStartNoteViewing]);

  const handleBackgroundClick = useCallback(() => {
    // Close note editing modal if open
    if (noteEditingTarget) {
      handleCloseNoteEditing();
    }
    // Close note viewing modal if open
    if (noteViewingTarget) {
      handleCloseNoteViewing();
    }
  }, [noteEditingTarget, noteViewingTarget, handleCloseNoteEditing, handleCloseNoteViewing]);

  const areNodesConnected = useCallback((sourceId, targetId) => {
    return graphData.edges.some(e =>
      (e.source === sourceId && e.target === targetId) ||
      (e.source === targetId && e.target === sourceId)
    );
  }, [graphData.edges]);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Only handle Delete key in editing mode
      if (mode !== 'editing') return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      
      // Don't handle if user is typing in an input/textarea
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
      
      // Prevent default behavior
      event.preventDefault();
      
      printDebug('🏠 App: Delete key pressed, selected nodes:', selectedNodeIds, 'selected edges:', selectedEdgeIds);
      
      // Delete selected nodes first (they have priority), then edges
      if (selectedNodeIds.length > 0) {
        handleDeleteSelectedNodes(selectedNodeIds);
      } else if (selectedEdgeIds.length > 0) {
        handleDeleteSelectedEdges(selectedEdgeIds);
      }
    };

    // Add event listener to document
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, selectedNodeIds, selectedEdgeIds, handleDeleteSelectedNodes, handleDeleteSelectedEdges]);

  /** ---------- render ---------- **/
  return (
    <div
      style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", overflow: "hidden" }}
    >
      <GraphControls
        selectedNodes={selectedNodeIds}
        selectedEdges={selectedEdgeIds}
        onCreateNode={handleCreateNode}
        onDeleteSelectedNodes={handleDeleteSelectedNodes}
        onDeleteSelectedEdges={handleDeleteSelectedEdges}
        onEditSelected={handleEditSelected}
        onConnectNodes={handleConnectSelectedNodes}
        onExportMap={exportMap}
        onImportFile={handleFileSelect}
        onResetMap={handleResetToInitial}
        onFitToView={handleFitToView}
        fileInputRef={fileInputRef}
        onNodeColorChange={handleNodeColorChange}
        areNodesConnected={areNodesConnected}
        mode={mode}
        onModeToggle={MODE_TOGGLE ? handleModeToggle : undefined}
      />

      <NoteEditorModal
        targetId={noteEditingTarget}
        targetType={noteEditingType}
        currentTitle={noteEditingTarget ? (noteEditingType === "node" 
          ? graphData.nodes.find(n => n.id === noteEditingTarget)?.title || ""
          : noteEditingTarget) : ""}
        notes={noteEditingTarget ? (graphData.notes?.[noteEditingTarget] || []) : []}
        onUpdateNotes={handleUpdateNotes}
        onUpdateTitle={handleUpdateTitle}
        onClose={handleCloseNoteEditing}
      />

      <NoteViewerModal
        targetId={noteViewingTarget}
        notes={noteViewingTarget ? (graphData.notes?.[noteViewingTarget] || []) : []}
        onClose={handleCloseNoteViewing}
      />

      <CameraInfo
        zoom={zoomLevel}
        pan={cameraPosition}
        selectedNodeIds={selectedNodeIds}
        selectedEdgeIds={selectedEdgeIds}
        mode={mode}
      />

      <ErrorDisplay error={loadError} onClearError={clearError} />

      <CytoscapeGraph
        // 🔁 pass nodes/edges (not graphData)
        nodes={graphData.nodes}
        edges={graphData.edges}
        mode={mode}

        onNodeMove={handleNodeMove}
        onZoomChange={setZoomLevel}
        onCameraMove={setCameraPosition}
        initialZoom={zoomLevel}
        initialCameraPosition={cameraPosition}
        shouldFitOnNextRender={shouldFitOnNextRender}
        onFitCompleted={handleFitCompleted}

        onEdgeSelectionChange={handleEdgeSelectionChange}
        onNodeSelectionChange={handleNodeSelectionChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onEdgeDirectionChange={handleEdgeDirectionChange}
        onDeleteSelectedNodes={handleDeleteSelectedNodes}
        onDeleteSelectedEdges={handleDeleteSelectedEdges}
        onNodeSizeChange={handleNodeSizeChange}
        onNodeColorChange={handleNodeColorChange}

        onBackgroundClick={handleBackgroundClick}

        onCytoscapeInstanceReady={setCytoscapeInstance}
      />
    </div>
  );
}

export default App;
