// src/App.jsx
import React, { useState, useEffect, useCallback, useRef, useReducer } from "react";
import CytoscapeGraph from "./CytoscapeGraph";
import defaultShipLogData from "./default_ship_log.json";
import { loadAndValidateRumorMapFromFile } from "./rumorMapValidation";
import GraphControls from "./GraphControls";
import NoteEditorModal from "./NoteEditorModal";
import NoteViewerModal from "./NoteViewerModal";
import DebugModal from "./DebugModal";
import CameraInfo from "./CameraInfo";
import ErrorDisplay from "./ErrorDisplay";
import { TEST_ICON_SVG } from "./constants/testAssets.js";
import { useCytoscapeInstance } from "./useCytoscapeInstance";
import { appStateReducer, initialAppState, ACTION_TYPES } from "./appStateReducer";
import { ZOOM_TO_SELECTION, DEBUG_LOGGING, MODE_TOGGLE, DEV_MODE, GRAYSCALE_IMAGES } from "./config/features.js";

// 🚀 New imports: centralized persistence + edge id helper
import { saveToLocal, loadFromLocal, saveModeToLocal, loadModeFromLocal, saveUndoStateToLocal, loadUndoStateFromLocal, saveMapNameToLocal, loadMapNameFromLocal } from "./persistence/index.js";
import { edgeId, renameNode } from "./graph/ops.js";
import { setCdnBaseUrl, getCdnBaseUrl } from "./utils/imageLoader.js";
import { printDebug } from "./utils/debug.js";

/** ---------- helpers & migration ---------- **/

// ensure every node has size/color/x/y; every edge has id & direction
function normalizeGraphData(data) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  const notes = data?.notes && typeof data.notes === "object" ? data.notes : {};
  const mode = typeof data?.mode === "string" ? data.mode : "editing";
  const mapName = typeof data?.mapName === "string" ? data.mapName : "default_map";
  const cdnBaseUrl = typeof data?.cdnBaseUrl === "string" ? data.cdnBaseUrl : "";

  const normNodes = nodes.map(n => {
    const imageUrl = n.imageUrl || "unspecified";
    return {
      id: n.id,
      title: n.title ?? n.label ?? "",
      size: n.size ?? "regular",
      color: n.color ?? "gray",
      x: typeof n.x === "number" ? n.x : 0,
      y: typeof n.y === "number" ? n.y : 0,
      imageUrl: imageUrl,
      // Preserve originalImageUrl for comparison consistency
      originalImageUrl: n.originalImageUrl || imageUrl
    };
  });

  const normEdges = edges.map(e => ({
    id: e.id || edgeId(e.source, e.target),
    source: e.source,
    target: e.target,
    direction: e.direction ?? "forward"
  }));

  return { nodes: normNodes, edges: normEdges, notes, mode, mapName, cdnBaseUrl };
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
  // Guard to prevent multiple simultaneous close operations (avoids multi animation)
  const isClosingNoteViewRef = useRef(false);

  // Use the Cytoscape instance management hook
  const {
    setCytoscapeInstance,
    getCytoscapeInstance,
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
      if (saved && typeof saved.mode === 'string') {
        return saved.mode;
      }
      return loadModeFromLocal();
    })(),
    mapName: (() => {
      // Try to get map name from loaded graph data first, then from localStorage
      const saved = loadFromLocal();
      if (saved && typeof saved.mapName === 'string') {
        return saved.mapName;
      }
      return loadMapNameFromLocal();
    })(),
    cdnBaseUrl: (() => {
      // Try to get CDN base URL from loaded graph data first, then from imageLoader
      const saved = loadFromLocal();
      if (saved && typeof saved.cdnBaseUrl === 'string') {
        return saved.cdnBaseUrl;
      }
      // Get from imageLoader localStorage
      return getCdnBaseUrl();
    })(),
    undo: {
      lastGraphState: loadUndoStateFromLocal()
    }
  });

  // Extract frequently used state for easier access
  const { selections, camera, ui, mode, mapName, cdnBaseUrl, undo } = appState;
  const selectedNodeIds = selections.nodes.ids;
  const nodeSelectionOrder = selections.nodes.order;
  const selectedEdgeIds = selections.edges.ids;
  const noteEditingTarget = selections.noteEditing.targetId;
  const noteEditingType = selections.noteEditing.targetType;
  const noteViewingTarget = selections.noteViewing.targetId;
  const debugModalOpen = selections.debugModal.isOpen;
  const zoomLevel = camera.zoom;
  const cameraPosition = camera.position;
  const shouldFitOnNextRender = ui.shouldFitOnNextRender;
  const loadError = ui.loadError;
  const lastUndoState = undo.lastGraphState;

  // ---------- debug taps ----------
  useEffect(() => { printDebug('🏠 App: zoomLevel changed to:', zoomLevel); }, [zoomLevel]);
  useEffect(() => { printDebug('🏠 App: cameraPosition changed to:', cameraPosition); }, [cameraPosition]);
  useEffect(() => { printDebug('🏠 App: shouldFitOnNextRender changed to:', shouldFitOnNextRender); }, [shouldFitOnNextRender]);
  useEffect(() => { printDebug('🎮 App: mode changed to:', mode); }, [mode]);

  // ---------- persistence ----------
  useEffect(() => {
    // persist graph (nodes/edges/notes), mode, map name, and CDN base URL
    const dataWithModeAndName = { ...graphData, mode, mapName, cdnBaseUrl };
    saveToLocal(dataWithModeAndName);
  }, [graphData, mode, mapName, cdnBaseUrl]);

  // Save CDN base URL to imageLoader storage
  useEffect(() => {
    setCdnBaseUrl(cdnBaseUrl);
  }, [cdnBaseUrl]);

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

  // Save map name to localStorage
  useEffect(() => {
    saveMapNameToLocal(mapName);
  }, [mapName]);

  // Save undo state to localStorage
  useEffect(() => {
    saveUndoStateToLocal(lastUndoState);
  }, [lastUndoState]);

  // Manage grayscale cache based on feature flag
  useEffect(() => {
    // Clear grayscale cache if feature is disabled
    if (!GRAYSCALE_IMAGES) {
      import('./graph/cyAdapter.js').then(({ clearGrayscaleCache }) => {
        clearGrayscaleCache();
      });
    }
  }, []); // Run once on mount

  /** ---------- helpers ---------- **/

  // Helper to save current graph state before making undoable changes
  const saveUndoState = useCallback(() => {
    dispatchAppState({
      type: ACTION_TYPES.SET_UNDO_STATE,
      payload: { graphState: graphData }
    });
  }, [graphData]);

  // Helper to clear undo state (for new/load operations)
  const clearUndoState = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.CLEAR_UNDO_STATE });
  }, []);

  // Handle undo functionality
  const handleUndo = useCallback(() => {
    if (lastUndoState) {
      setGraphData(lastUndoState);
      clearUndoState(); // Clear undo after using it
      
      // Clear selections since they might reference nodes/edges that changed
      dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
      clearCytoscapeSelections();
    }
  }, [lastUndoState, clearUndoState, clearCytoscapeSelections]);

  /** ---------- handlers ---------- **/

  // (changed signature) receives position object {x, y}
  const handleNodeMove = useCallback((nodeId, pos) => {
    const { x: newX, y: newY } = pos;
    printDebug('🏠 App: handleNodeMove', nodeId, newX, newY);
    
    // Save undo state before moving node
    saveUndoState();
    
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (n.id === nodeId ? { ...n, x: newX, y: newY } : n))
    }));
  }, [saveUndoState]);

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
        if (typeof g1.mode === 'string') {
          dispatchAppState({ type: ACTION_TYPES.SET_MODE, payload: { mode: g1.mode } });
        }

        // Set map name if it's included in the imported data
        if (typeof g1.mapName === 'string') {
          dispatchAppState({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: g1.mapName } });
        }

        // Set CDN base URL if it's included in the imported data (even if empty string)
        if (typeof g1.cdnBaseUrl === 'string') {
          dispatchAppState({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: g1.cdnBaseUrl } });
        }

        // Reset camera + fit
        dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: 1 } });
        dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: { x: 0, y: 0 } } });
        dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });

        // Clear selections and undo state (loading clears undo)
        clearCytoscapeSelections();
        dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
        clearUndoState();
      } else {
        dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: `Invalid map file: ${result.errors.join('; ')}` } });
      }
    } catch (error) {
      dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: `Failed to load file: ${error.message}` } });
    }

    // Clear the input so the same file can be selected again
    event.target.value = '';
  }, [clearCytoscapeSelections, clearUndoState]);

  const handleResetToInitial = useCallback(() => {
    // Show confirmation dialog
    const confirmed = window.confirm("Are you sure you want to reset the map to its initial state? This will replace your current map with the default map.");
    if (!confirmed) {
      return; // User cancelled
    }

    // Reset to project defaults, normalized
    const normalizedDefault = normalizeGraphData(defaultShipLogData);
    setGraphData(normalizedDefault);

    // Reset mode, map name, and CDN URL to default values
    if (typeof normalizedDefault.mode === 'string') {
      dispatchAppState({ type: ACTION_TYPES.SET_MODE, payload: { mode: normalizedDefault.mode } });
    }
    if (typeof normalizedDefault.mapName === 'string') {
      dispatchAppState({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: normalizedDefault.mapName } });
    }
    if (typeof normalizedDefault.cdnBaseUrl === 'string') {
      dispatchAppState({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: normalizedDefault.cdnBaseUrl } });
    }

    // Camera reset
    dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: 1 } });
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: { x: 0, y: 0 } } });
    dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });

    // Clear errors & selections and undo state (reset clears undo)
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
    clearCytoscapeSelections();
    dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
    clearUndoState();
  }, [clearCytoscapeSelections, clearUndoState]);

  const handleNewMap = useCallback(() => {
    // Check if there are any nodes in the current map
    if (graphData.nodes.length > 0) {
      // Show confirmation dialog
      const confirmed = window.confirm("Are you sure you want to delete this map and start a new one?");
      if (!confirmed) {
        return; // User cancelled
      }
    }

    // Create a completely empty map
    setGraphData({
      nodes: [],
      edges: [],
      notes: {},
      mode: mode // preserve current mode
    });

    // Reset map name and CDN URL for new map
    dispatchAppState({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: 'default_map' } });
    dispatchAppState({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: '' } });

    // Camera reset - update both app state and Cytoscape instance
    dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: 1 } });
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: { x: 0, y: 0 } } });
    
    // Apply camera reset to Cytoscape instance immediately
    const cy = getCytoscapeInstance();
    if (cy) {
      cy.zoom(1);
      cy.pan({ x: 0, y: 0 });
    }
    
    dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });

    // Clear errors & selections and undo state (new map clears undo)
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
    clearCytoscapeSelections();
    dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
    clearUndoState();
  }, [graphData.nodes.length, mode, getCytoscapeInstance, clearCytoscapeSelections, clearUndoState]);

  const clearError = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
  }, []);

  // Note viewing handlers - defined early to avoid circular dependencies
  const handleStartNoteViewing = useCallback((targetId, targetType) => {
    // Zoom to selection if feature is enabled and we're in playing mode
    if (ZOOM_TO_SELECTION && targetId) {
      fitToSelection([targetId], {
        animate: true,
        padding: 80,
        targetHalf: 'top',
        saveCamera: true,
        zoomLevel: 'close' // Zoom in close for viewing
      });
    }
    
    dispatchAppState({
      type: ACTION_TYPES.START_NOTE_VIEWING,
      payload: { targetId, targetType }
    });
  }, [fitToSelection]);

  const handleCloseNoteViewing = useCallback(() => {
    // Prevent duplicate execution (can be triggered via selection change + background click)
    if (isClosingNoteViewRef.current) {
      printDebug('🚫 [App] handleCloseNoteViewing skipped (already in progress)');
      return;
    }
    isClosingNoteViewRef.current = true;

    try {
      // Restore original camera if feature is enabled and we have a saved camera state
      if (ZOOM_TO_SELECTION && mode === 'playing' && hasOriginalCamera()) {
        printDebug('🎥 [App] Restoring original camera (note viewer close)');
        restoreOriginalCamera(true);
      }
      dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_VIEWING });
    } finally {
      // Release flag on next tick to allow future closes
      setTimeout(() => { isClosingNoteViewRef.current = false; }, 0);
    }
  }, [mode, restoreOriginalCamera, hasOriginalCamera]);

  // Debug modal handlers
  const handleOpenDebugModal = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.OPEN_DEBUG_MODAL });
  }, []);

  const handleCloseDebugModal = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.CLOSE_DEBUG_MODAL });
  }, []);

  const handleEdgeSelectionChange = useCallback((edgeIds) => {
    printDebug('🏠 App: Edge selection changed:', edgeIds);
    dispatchAppState({
      type: ACTION_TYPES.SET_EDGE_SELECTION,
      payload: { edgeIds }
    });

    // In playing mode, close note viewer if no edges are selected
    if (mode === 'playing' && edgeIds.length === 0 && noteViewingTarget) {
      handleCloseNoteViewing();
    }
  }, [mode, noteViewingTarget, handleCloseNoteViewing]);

  // Now deletes by actual edge.id (not index)
  const handleDeleteSelectedEdges = useCallback((edgeIds) => {
    printDebug('🏠 App: Deleting edges by id:', edgeIds);
    
    // Save undo state before deleting edges
    saveUndoState();
    
    setGraphData(prev => ({
      ...prev,
      edges: prev.edges.filter(e => !edgeIds.includes(e.id))
    }));

    clearCytoscapeSelections();
    dispatchAppState({
      type: ACTION_TYPES.SET_EDGE_SELECTION,
      payload: { edgeIds: [] }
    });
  }, [clearCytoscapeSelections, saveUndoState]);

  const handleDeleteSelectedNodes = useCallback((nodeIds) => {
    printDebug('🏠 App: Deleting nodes:', nodeIds);

    // Save undo state before deleting nodes
    saveUndoState();
    
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
  }, [clearCytoscapeSelections, saveUndoState]);

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

    // In playing mode, close note viewer if no nodes are selected
    if (mode === 'playing' && nodeIds.length === 0 && noteViewingTarget) {
      handleCloseNoteViewing();
    }
  }, [nodeSelectionOrder, mode, noteViewingTarget, handleCloseNoteViewing]);

  const handleConnectSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 2 && nodeSelectionOrder.length === 2) {
      const [sourceId, targetId] = nodeSelectionOrder;
      printDebug('🏠 App: Connecting (ordered):', sourceId, '->', targetId);

      // Save undo state before connecting nodes
      saveUndoState();

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
  }, [selectedNodeIds, nodeSelectionOrder, clearCytoscapeSelections, saveUndoState]);

  // Change direction by edge.id
  const handleEdgeDirectionChange = useCallback((edgeIdArg, newDirection) => {
    printDebug('🏠 App: Changing edge direction:', edgeIdArg, '->', newDirection);
    
    // Save undo state before changing direction
    saveUndoState();
    
    setGraphData(prev => ({
      ...prev,
      edges: prev.edges.map(e => (e.id === edgeIdArg ? { ...e, direction: newDirection } : e))
    }));
  }, [saveUndoState]);

  const handleNodeSizeChange = useCallback((nodeId, newSize) => {
    printDebug('🏠 App: Changing node size:', nodeId, '->', newSize);

    // Save undo state before changing size
    saveUndoState();

    // instant visual
    updateNodeInPlace(nodeId, { size: newSize });

    // persist
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (n.id === nodeId ? { ...n, size: newSize } : n))
    }));
  }, [updateNodeInPlace, saveUndoState]);

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
      imageUrl: "unspecified" // Use "unspecified" for nodes without custom images
    };

    // Save undo state before creating node
    saveUndoState();
    setGraphData(prev => ({ ...prev, nodes: [...prev.nodes, newNode] }));
  }, [graphData, getViewportCenter, saveUndoState]);

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
      mode, // Include current mode in export
      mapName, // Include current map name in export
      cdnBaseUrl // Include current CDN base URL in export
    };

    // Generate filename from map name: lowercase, spaces to underscores
    const sanitizedMapName = mapName
      .toLowerCase()
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/[^a-z0-9_-]/g, '') // Remove any non-alphanumeric characters except underscores and hyphens
      || 'untitled_map'; // fallback if map name is empty or becomes empty after sanitization
    
    const filename = `${sanitizedMapName}.json`;

    const blob = new Blob([JSON.stringify(updatedGraph, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [graphData, exportNodePositions, mode, mapName, cdnBaseUrl]);

  const handleNodeColorChange = useCallback((nodeIds, newColor) => {
    printDebug('🏠 App: Change color:', nodeIds, '->', newColor);

    // Save undo state before changing color
    saveUndoState();

    nodeIds.forEach(id => updateNodeInPlace(id, { color: newColor }));

    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (nodeIds.includes(n.id) ? { ...n, color: newColor } : n))
    }));
  }, [updateNodeInPlace, saveUndoState]);
  // camera
  // camera
  const setZoomLevel = useCallback((zoom) => {
    printDebug(`🏠 App: setZoomLevel called with: ${zoom}`);
    dispatchAppState({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom } });
  }, []);
  const setCameraPosition = useCallback((position) => {
    printDebug(`🏠 App: setCameraPosition called with: (${Math.round(position.x)}, ${Math.round(position.y)})`);
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position } });
  }, []);

  // map name
  const setMapName = useCallback((newMapName) => {
    dispatchAppState({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: newMapName } });
  }, []);

  // CDN base URL
  const setCdnBaseUrlHandler = useCallback((newCdnBaseUrl) => {
    dispatchAppState({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: newCdnBaseUrl } });
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

  const handleModeToggle = useCallback(() => {
    const newMode = mode === 'editing' ? 'playing' : 'editing';
    printDebug(`🎮 [App] Mode toggle initiated: ${mode} -> ${newMode}`);
    
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
    
    printDebug(`✅ [App] Mode toggle completed: now in ${newMode} mode`);
  }, [mode, noteEditingTarget, noteViewingTarget, clearCytoscapeSelections, handleCloseNoteEditing, handleCloseNoteViewing]);

  const handleUpdateNotes = useCallback((targetId, newNotes) => {
    setGraphData(prev => ({
      ...prev,
      notes: { ...(prev.notes || {}), [targetId]: newNotes }
    }));
  }, []);

  const handleUpdateTitle = useCallback((targetId, targetType, newTitle) => {
    if (targetType === "node") {
      // Save undo state before renaming node
      saveUndoState();
      
      setGraphData(prev => {
        // Use the renameNode function to handle ID updates and cascading changes
        const updatedGraph = renameNode(prev, targetId, newTitle);
        
        // Check if the node ID actually changed
        const oldNode = prev.nodes.find(n => n.id === targetId);
        const newNode = updatedGraph.nodes.find(n => n.title === newTitle);
        
        if (oldNode && newNode && oldNode.id !== newNode.id) {
          // Node ID changed, update selections if this node is selected
          if (selectedNodeIds.includes(targetId)) {
            const newSelectedIds = selectedNodeIds.map(id => id === targetId ? newNode.id : id);
            const newSelectionOrder = nodeSelectionOrder.map(id => id === targetId ? newNode.id : id);
            
            dispatchAppState({
              type: ACTION_TYPES.SET_NODE_SELECTION,
              payload: { nodeIds: newSelectedIds, selectionOrder: newSelectionOrder }
            });
            
            // Update Cytoscape selection to match
            const cy = getCytoscapeInstance();
            if (cy) {
              // Use setTimeout to ensure the DOM has updated with the new node ID
              setTimeout(() => {
                cy.nodes().unselect();
                newSelectedIds.forEach(nodeId => {
                  const node = cy.getElementById(nodeId);
                  if (node.length > 0) {
                    node.select();
                  }
                });
              }, 0);
            }
          }
          
          // Update note editing target if it's the renamed node
          if (noteEditingTarget === targetId) {
            dispatchAppState({
              type: ACTION_TYPES.START_NOTE_EDITING,
              payload: { targetId: newNode.id, targetType: 'node' }
            });
          }
          
          // Update note viewing target if it's the renamed node
          if (noteViewingTarget === targetId) {
            dispatchAppState({
              type: ACTION_TYPES.START_NOTE_VIEWING,
              payload: { targetId: newNode.id }
            });
          }
        }
        
        return updatedGraph;
      });
    } else if (targetType === "edge") {
      // For edges, we could store title in a custom property or handle differently
      // For now, let's assume edges don't have editable titles, but we'll keep the interface
      console.warn("Edge title editing not yet implemented");
    }
  }, [selectedNodeIds, nodeSelectionOrder, noteEditingTarget, noteViewingTarget, saveUndoState, getCytoscapeInstance]);

  const handleUpdateImage = useCallback((nodeId, imagePath, immediateImageUrl = null) => {
    // Save undo state before updating image
    saveUndoState();
    
    // Update graph data
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => 
        n.id === nodeId 
          ? { ...n, imageUrl: imagePath }
          : n
      )
    }));

    // Force immediate visual update in Cytoscape
    // Import the function dynamically to avoid circular imports
    import('./graph/cyAdapter.js').then(({ forceNodeImageUpdate }) => {
      forceNodeImageUpdate(nodeId, imagePath, mapName, cdnBaseUrl, immediateImageUrl)
        .then(success => {
          if (success) {
            printDebug(`✅ [App] Successfully forced image update for node ${nodeId}`);
          } else {
            printDebug(`⚠️ [App] Failed to force image update for node ${nodeId}, will update on next sync`);
          }
        })
        .catch(error => {
          printDebug(`❌ [App] Error forcing image update for node ${nodeId}:`, error);
        });
    });
  }, [saveUndoState, mapName, cdnBaseUrl]);

  const handleNodeClick = useCallback((nodeId) => {
    if (mode === 'playing') {
      // In playing mode, clicking a node opens the note viewer
      handleStartNoteViewing(nodeId, "node");
    }
    // In editing mode, clicking does nothing (selection is handled by Cytoscape)
  }, [mode, handleStartNoteViewing]);

  const handleEdgeClick = useCallback((edgeId) => {
    if (mode === 'playing') {
      // In playing mode, clicking an edge opens the note viewer
      handleStartNoteViewing(edgeId, "edge");
    }
    // In editing mode, clicking does nothing (selection is handled by Cytoscape)
  }, [mode, handleStartNoteViewing]);

  const handleBackgroundClick = useCallback(() => {
    // Clear all selections first
    dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
    clearCytoscapeSelections();

    // NOTE: Do NOT restore camera here directly. Closing the note viewer will handle it once.

    // Close note editing modal if open
    if (noteEditingTarget) {
      handleCloseNoteEditing();
    }
    // Close note viewing modal if open (this will also restore camera once)
    if (noteViewingTarget) {
      handleCloseNoteViewing();
    }
  }, [noteEditingTarget, noteViewingTarget, handleCloseNoteEditing, handleCloseNoteViewing, clearCytoscapeSelections]);

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

  // Prepare debug data for debug modal
  const getDebugData = useCallback(() => {
    const positions = exportNodePositions();
    const updatedNodes = positions.length
      ? positions.map(pos => ({
          ...graphData.nodes.find(n => n.id === pos.id),
          x: pos.x, y: pos.y
        }))
      : graphData.nodes;

    return {
      timestamp: new Date().toISOString(),
      nodes: updatedNodes,
      edges: graphData.edges,
      notes: graphData.notes,
      mode,
      camera: {
        zoom: zoomLevel,
        position: cameraPosition
      },
      selections: {
        nodes: {
          ids: selectedNodeIds,
          order: nodeSelectionOrder
        },
        edges: {
          ids: selectedEdgeIds
        }
      },
      ui: {
        shouldFitOnNextRender,
        loadError,
        noteEditingTarget,
        noteEditingType,
        noteViewingTarget,
        debugModalOpen
      },
      undo: {
        canUndo: !!lastUndoState,
        lastGraphState: lastUndoState
      },
      features: {
        ZOOM_TO_SELECTION,
        DEBUG_LOGGING,
        MODE_TOGGLE,
        DEV_MODE
      }
    };
  }, [
    exportNodePositions, graphData, mode, zoomLevel, cameraPosition, 
    selectedNodeIds, nodeSelectionOrder, selectedEdgeIds, shouldFitOnNextRender, 
    loadError, noteEditingTarget, noteEditingType, noteViewingTarget, debugModalOpen,
    lastUndoState
  ]);

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
        onNewMap={handleNewMap}
        onFitToView={handleFitToView}
        fileInputRef={fileInputRef}
        onNodeColorChange={handleNodeColorChange}
        areNodesConnected={areNodesConnected}
        mode={mode}
        onModeToggle={MODE_TOGGLE ? handleModeToggle : undefined}
        onOpenDebugModal={DEV_MODE ? handleOpenDebugModal : undefined}
        onUndo={handleUndo}
        canUndo={!!lastUndoState}
      />

      <NoteEditorModal
        targetId={noteEditingTarget}
        targetType={noteEditingType}
        currentTitle={noteEditingTarget ? (noteEditingType === "node" 
          ? graphData.nodes.find(n => n.id === noteEditingTarget)?.title || ""
          : noteEditingTarget) : ""}
        currentImageUrl={noteEditingTarget && noteEditingType === "node" 
          ? graphData.nodes.find(n => n.id === noteEditingTarget)?.imageUrl || ""
          : ""}
        notes={noteEditingTarget ? (graphData.notes?.[noteEditingTarget] || []) : []}
        mapName={mapName}
        onUpdateNotes={handleUpdateNotes}
        onUpdateTitle={handleUpdateTitle}
        onUpdateImage={handleUpdateImage}
        onClose={handleCloseNoteEditing}
      />

      <NoteViewerModal
        targetId={noteViewingTarget}
        notes={noteViewingTarget ? (graphData.notes?.[noteViewingTarget] || []) : []}
        onClose={handleCloseNoteViewing}
      />

      {DEV_MODE && (
        <DebugModal
          isOpen={debugModalOpen}
          onClose={handleCloseDebugModal}
          debugData={getDebugData()}
        />
      )}

      <CameraInfo
        zoom={zoomLevel}
        pan={cameraPosition}
        selectedNodeIds={selectedNodeIds}
        selectedEdgeIds={selectedEdgeIds}
        mode={mode}
        mapName={mapName}
        onMapNameChange={setMapName}
        cdnBaseUrl={cdnBaseUrl}
        onCdnBaseUrlChange={setCdnBaseUrlHandler}
      />

      <ErrorDisplay error={loadError} onClearError={clearError} />

      <CytoscapeGraph
        // 🔁 pass nodes/edges (not graphData)
        nodes={graphData.nodes}
        edges={graphData.edges}
        mode={mode}
        mapName={mapName}
        cdnBaseUrl={cdnBaseUrl}

        // Selection state for synchronization
        selectedNodeIds={selectedNodeIds}
        selectedEdgeIds={selectedEdgeIds}

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
