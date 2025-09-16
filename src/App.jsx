// src/App.jsx

/**
 * Outer Wilds–style Rumor Map — Application Shell
 *
 * REFACTORING STATUS - STEP 2 COMPLETED:
 * ✅ Graph Operations Hook (useGraphOperations) - COMPLETED
 *    - Replaced handleFitToView() with graphOps.handleFitGraph()
 *    - Replaced handleRotateMap() with graphOps.handleRotateRight() 
 *    - Removed rotateCompassOnly import (no longer needed)
 *    - Benefits: Direct Cytoscape manipulation, consistent camera updates
 *    - Note: handleRotateNodesAndMap still uses local implementation (complex node rotation)
 * 
 * ✅ Map Loading Hook (useMapLoading) - COMPLETED
 *    - Replaced large URL monitoring useEffect with modular hook
 *    - Delegates CDN loading to cdnHelpers.js (no duplication)
 *    - Handles URL monitoring, mode logic, background image loading
 *    - Benefits: Cleaner App.jsx, reusable URL monitoring logic
 * 
 * ✅ Modal State Hook and Keyboard Handlers Hook - COMPLETED
 * 🔄 Modal State Hook (useModalState) - Modal open/close state management  
 * 🔄 Keyboard Handlers Hook (useKeyboardHandlers) - Keyboard shortcuts
 *
 * Responsibilities
 * - Owns top-level application state (graph data, UI mode, selections, modals).
 * - Coordinates data flow between domain logic (graph ops), Cytoscape rendering,
 *   background image layer, import/export, and feature flags.
 * - Bootstraps initial map from defaults, URL params, JSON file upload, or CDN.
 *
 * Key Interactions
 * - Renders <CytoscapeGraph/> and wires its callbacks to reducer actions.
 * - Hosts global controls: <UniversalControls/>, <GraphControls/>, modals
 *   (NoteEditor/Viewer, Debug, Share, BgImage).
 * - Uses useCytoscapeInstance() for lifecycle/sizing/fit control and camera info.
 * - Validates loaded maps via loadAndValidateRumorMapFromFile().
 *
 * State & Data Shape
 * - nodes: [{ id, label, x, y, color, image, noteCount, ... }]
 * - edges: [{ id, source, target, ... }]
 * - bgImage: { src, x, y, scale, opacity, included, visible }
 * - selection: { nodeIds: Set, edgeIds: Set }
 * - mode: 'editing' | 'playing'
 *
 * Gotchas
 * - Keep the graph as the single source of truth—Cytoscape does not mutate domain
 *   state directly; all edits flow through reducer actions.
 * - Avoid tight render loops: useMemo/useCallback where appropriate.
 * - URL/query import and JSON import must update BOTH domain state and UI toggles.
 */

import React, { useState, useEffect, useCallback, useRef, useReducer, useMemo } from "react";
import CytoscapeGraph from "./components/CytoscapeGraph.jsx";
import defaultShipLogData from "./default_ship_log.json";
import { loadAndValidateRumorMapFromFile } from "./rumorMapValidation";
import GraphControls from "./components/GraphControls.jsx";
import UniversalControls from "./components/UniversalControls.jsx";
import NoteEditorModal from "./components/NoteEditorModal.jsx";
import NoteViewerModal from "./components/NoteViewerModal.jsx";
import DebugModal from "./components/DebugModal.jsx";
import ShareModal from "./components/ShareModal.jsx";
import CameraInfo from "./components/CameraInfo.jsx";
import ErrorDisplay from "./components/ErrorDisplay.jsx";
import { useCytoscapeInstance } from "./useCytoscapeInstance";
import { appStateReducer, initialAppState, ACTION_TYPES } from "./appStateReducer";
import { ZOOM_TO_SELECTION, DEBUG_LOGGING, DEV_MODE, GRAYSCALE_IMAGES, CAMERA_INFO_HIDDEN } from "./config/features.js";
import { clearQueryParams, handleLoadFromCdn, setCdnBaseUrl, getCdnBaseUrl } from "./utils/cdnHelpers.js"; // getMapUrlFromQuery, 
import BgImageModal from "./components/BgImageModal.jsx";
import BgImageLayer from "./bg/BgImageLayer";
import { useBgImageState } from "./bg/useBgImageState";
import { loadImageWithFallback } from "./utils/imageLoader.js";
import { dataUrlOrBlobToWebpDataUrl } from "./utils/imageUtils.js"
import { serializeGraph } from "./graph/ops.js";

// 🚀 New imports: centralized persistence + edge id helper
import { saveToLocal, loadFromLocal, saveModeToLocal, loadModeFromLocal, saveUndoStateToLocal, loadUndoStateFromLocal, saveMapNameToLocal, loadMapNameFromLocal, loadUniversalMenuCollapsed, loadGraphControlsCollapsed, loadCameraInfoCollapsed, saveUniversalMenuCollapsed, saveGraphControlsCollapsed, saveCameraInfoCollapsed } from "./persistence/index.js";
// Add new persistence imports
import { loadOrientationFromLocal, saveOrientationToLocal, loadCompassVisibleFromLocal, saveCompassVisibleToLocal } from './persistence/index.js';
import { edgeId, renameNode } from "./graph/ops.js";
import { printDebug } from "./utils/debug.js";
import { rotateNodesAndCompass } from './utils/rotation.js';  // REFACTOR STEP 1: Removed rotateCompassOnly - now using graphOps.handleRotateRight
import { getCanEditFromQuery, hasAnyQueryParams } from "./utils/mapHelpers.js";

// REFACTOR STEP 1: Import graph operations hook
import { useGraphOperations } from "./hooks/useGraphOperations.js";

// REFACTOR STEP 2: Import map loading hook for URL monitoring  
import { useMapLoading } from "./hooks/useMapLoading.js";

// REFACTOR STEP 3: Modal state + keyboard hooks
import { useModalState } from "./hooks/useModalState.js";
import { useKeyboardHandlers } from "./hooks/useKeyboardHandlers.js";

// camera hook (live viewport + debounced commits)
import { useCamera } from "./hooks/useCamera.js";

// Add CSS for spinner animation
const SPINNER_CSS = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`;

/** ---------- helpers & migration ---------- **/

// ensure every node has size/color/x/y; every edge has id & direction
function normalizeGraphData(data) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  const notes = data?.notes && typeof data.notes === "object" ? data.notes : {};
  const mode = typeof data?.mode === "string" ? data.mode : "editing";
  const mapName = typeof data?.mapName === "string" ? data.mapName : "default_map";
  const cdnBaseUrl = typeof data?.cdnBaseUrl === "string" ? data.cdnBaseUrl : "";
  // New: preserve orientation & compassVisible from imported/exported JSON
  const orientation = Number.isFinite(data?.orientation) ? ((data.orientation % 360) + 360) % 360 : 0;
  const compassVisible = typeof data?.compassVisible === 'boolean' ? data.compassVisible : true;

  const bgImage =
    data && typeof data.bgImage === 'object' && data.bgImage !== null
      ? data.bgImage
      : { included: false, imageUrl: "", x: 0, y: 0, scale: 100, opacity: 100, visible: false };

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

  return { nodes: normNodes, edges: normEdges, notes, mode, mapName, cdnBaseUrl, orientation, compassVisible, bgImage };
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
  
  // previously editingEnabled, getEditingEnabledFromQuery
  const canEdit = getCanEditFromQuery() || !hasAnyQueryParams();

  const fileInputRef = useRef(null);
  // Guard to prevent multiple simultaneous close operations (avoids multi animation)
  const isClosingNoteViewRef = useRef(false);
  // Ref to track current CDN loading operation
  const currentCdnLoadRef = useRef(null);
  const isSwitchingTargetsRef = useRef(false);
  const pendingViewTargetRef = useRef(null);

  // Use the Cytoscape instance management hook
  const {
    setCytoscapeInstance,
    getCytoscapeInstance,
    updateNodeInPlace,
    clearCytoscapeSelections,
    // fitToView,
    getViewportCenter,
    exportNodePositions,
    // Camera state management for zoom-to-selection
    saveOriginalCamera, // eslint-disable-line no-unused-vars
    restoreOriginalCamera,
    fitToSelection,
    hasOriginalCamera
  } = useCytoscapeInstance();

  // ---------- Background image (encapsulated) ----------
  const {
    bgImage,
    setBgImage,
    bgImageModalOpen,
    openBgImageModal,
    closeBgImageModal,
    changeBgImage,
    loadImageFile,
    deleteImage,
    toggleVisible: toggleBgImageVisible,
    calibration: bgCalibration
  } = useBgImageState();

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
      // If canEdit is false → hard-read-only
      if (!canEdit) return 'playing';
      // Prefer persisted mode to preserve across refresh; else fallback to stored graph or default
      const saved = loadFromLocal();
      if (saved && typeof saved.mode === 'string') return saved.mode;
      return loadModeFromLocal();
    })(),
    mapName: (() => {
      const saved = loadFromLocal();
      if (saved && typeof saved.mapName === 'string') {
        return saved.mapName;
      }
      return loadMapNameFromLocal();
    })(),
    cdnBaseUrl: (() => {
      const saved = loadFromLocal();
      if (saved && typeof saved.cdnBaseUrl === 'string') {
        return saved.cdnBaseUrl;
      }
      return getCdnBaseUrl();
    })(),
    orientation: loadOrientationFromLocal(),
    ui: {
      shouldFitOnNextRender: false,
      loadError: null,
      universalMenuCollapsed: !canEdit ? true : loadUniversalMenuCollapsed(),
      graphControlsCollapsed: !canEdit ? true : loadGraphControlsCollapsed(),
      cameraInfoCollapsed: !canEdit ? true : loadCameraInfoCollapsed(),
      compassVisible: loadCompassVisibleFromLocal()
    },
    undo: {
      lastGraphState: loadUndoStateFromLocal()
    },
    lastLoadedMapUrl: localStorage.getItem('shipLogLastLoadedMapUrl') || '' // Track last loaded map URL for CDN
  });

  // Extract frequently used state for easier access
  const { selections, camera, ui, mode, mapName, cdnBaseUrl, undo, orientation } = appState;
  const compassVisible = ui.compassVisible;
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
  const universalMenuCollapsed = ui.universalMenuCollapsed;
  const graphControlsCollapsed = ui.graphControlsCollapsed;
  const cameraInfoCollapsed = ui.cameraInfoCollapsed;

  // Local UI state (not yet in reducer): note count overlay
  const [showNoteCountOverlay, setShowNoteCountOverlay] = useState(() => {
    try { return JSON.parse(localStorage.getItem('shipLogNoteCountOverlay')) || false; } catch { return false; }
  });
  const handleToggleNoteCountOverlay = useCallback(() => {
    setShowNoteCountOverlay(v => !v);
  }, []);

  // Share modal state
  // Centralized modal helpers (note editor/viewer/debug via reducer, share via local)
  const modalOps = useModalState(dispatchAppState, appState, {
    openBgImageModal,
    closeBgImageModal
  });

  // CDN loading state
  // const [currentMapUrl, setCurrentMapUrl] = useState(null); // Initialize as null to force initial check
  
  const [cdnLoadingState, setCdnLoadingState] = useState({ 
    isLoading: false, 
    error: null 
  });
  const [isLoadingFromCDN, setIsLoadingFromCDN] = useState(false); // Flag to prevent persistence conflicts

  // REFACTOR STEP 1: Initialize graph operations hook
  // This replaces individual handleFitToView, handleRotateMap, etc. functions
  const graphOps = useGraphOperations(
    getCytoscapeInstance(), 
    dispatchAppState, 
    clearCytoscapeSelections, 
    null, // applyDebugStyles - can be added later
    orientation // current orientation for rotation functions
  );

  // Helper to clear undo state (for new/load operations) - defined early because it's used in effects
  const clearUndoState = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.CLEAR_UNDO_STATE });
  }, []);

  // REFACTOR STEP 2: Initialize map loading hook for URL monitoring
  // This replaces the large URL monitoring useEffect in App.jsx
  useMapLoading({
    appState,
    dispatchAppState,
    defaultShipLogData,
    setGraphData,
    setBgImage,
    setCdnLoadingState,
    setIsLoadingFromCDN,
    clearCytoscapeSelections,
    clearUndoState,
    saveModeToLocal,
    loadModeFromLocal,
    currentCdnLoadRef,
    cdnBaseUrl,
    ACTION_TYPES
  });

  // Collapse toggles mapped to reducer-backed state
  const toggleUniversalMenu = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_UNIVERSAL_MENU_COLLAPSED, payload: { collapsed: !universalMenuCollapsed } });
  }, [universalMenuCollapsed]);
  const toggleGraphControls = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_GRAPH_CONTROLS_COLLAPSED, payload: { collapsed: !graphControlsCollapsed } });
  }, [graphControlsCollapsed]);
  const toggleCameraInfo = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_INFO_COLLAPSED, payload: { collapsed: !cameraInfoCollapsed } });
  }, [cameraInfoCollapsed]);

  // ---------- debug taps ----------
  // useEffect(() => { printDebug('🏠 App: zoomLevel changed to:', zoomLevel); }, [zoomLevel]);
  // useEffect(() => { printDebug('🏠 App: cameraPosition changed to:', cameraPosition); }, [cameraPosition]);
  // useEffect(() => { printDebug('🏠 App: shouldFitOnNextRender changed to:', shouldFitOnNextRender); }, [shouldFitOnNextRender]);
  // useEffect(() => { printDebug('🎮 App: mode changed to:', mode); }, [mode]);
  // useEffect(() => { 
  //   printDebug('📊 App: graphData changed - nodes:', graphData.nodes.length, 'edges:', graphData.edges.length, 'mapName:', graphData.mapName || 'default'); 
  //   printDebug('📊 [App] graphData changed:', { 
  //     nodeCount: graphData.nodes.length, 
  //     edgeCount: graphData.edges.length, 
  //     mapName: graphData.mapName || 'default',
  //     firstNode: graphData.nodes[0] ? `${graphData.nodes[0].id} (${graphData.nodes[0].title})` : 'none'
  //   });
  // }, [graphData]);

  // Add a special debug effect to track when graphData actually changes
  // useEffect(() => {
  //   printDebug('🔄 [App] graphData state updated! New data:', {
  //     nodeCount: graphData.nodes.length,
  //     edgeCount: graphData.edges.length,
  //     mapName: graphData.mapName,
  //     mode: graphData.mode,
  //     cdnBaseUrl: graphData.cdnBaseUrl,
  //     timestamp: new Date().toISOString()
  //   });
  // }, [graphData]);

  // Add CSS for spinner animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = SPINNER_CSS;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // REFACTOR STEP 2: URL monitoring is now handled by useMapLoading hook
  // Previous large URL monitoring useEffect has been moved to hooks/useMapLoading.js

// ---------- persistence ----------
  useEffect(() => {
    // Don't persist while loading from CDN to avoid overwriting CDN data
    if (isLoadingFromCDN) {
      printDebug('[PERSISTENCE] Skipping persistence during CDN load');
      return;
    }
    
    // persist graph (nodes/edges/notes), mode, map name, and CDN base URL
    const dataWithModeAndName = { ...graphData, mode, mapName, cdnBaseUrl, orientation, bgImage };
    printDebug('[PERSISTENCE] Saving to local:', {
      nodeCount: dataWithModeAndName.nodes.length,
      mapName: dataWithModeAndName.mapName,
      mode: dataWithModeAndName.mode,
      cdnBaseUrl: dataWithModeAndName.cdnBaseUrl,
      orientation: dataWithModeAndName.orientation,
      bgImage: dataWithModeAndName.bgImage
    });
    saveToLocal(dataWithModeAndName);
  }, [graphData, mode, mapName, cdnBaseUrl, orientation, bgImage, isLoadingFromCDN]);

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

  // Save note count overlay state to localStorage
  useEffect(() => {
    localStorage.setItem("shipLogNoteCountOverlay", JSON.stringify(showNoteCountOverlay));
  }, [showNoteCountOverlay]);

  // Persist orientation & compass visibility
  useEffect(() => { saveOrientationToLocal(orientation); }, [orientation]);
  useEffect(() => { saveCompassVisibleToLocal(compassVisible); }, [compassVisible]);

  // Persist collapse states for UI panels
  useEffect(() => { saveUniversalMenuCollapsed(universalMenuCollapsed); }, [universalMenuCollapsed]);
  useEffect(() => { saveGraphControlsCollapsed(graphControlsCollapsed); }, [graphControlsCollapsed]);
  useEffect(() => { saveCameraInfoCollapsed(cameraInfoCollapsed); }, [cameraInfoCollapsed]);

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

  // Handle undo functionality
  const handleUndo = useCallback(() => {
    if (lastUndoState) {
      const prevState = lastUndoState; // capture for closures
      setGraphData(prevState);
      clearUndoState(); // Clear undo after using it
      // Clear selections since they might reference nodes/edges that changed
      dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
      clearCytoscapeSelections();
      // --- NEW: update Cytoscape node positions to match undo state ---
      const cy = getCytoscapeInstance();
      if (cy && prevState.nodes) {
        prevState.nodes.forEach(node => {
          const cyNode = cy.getElementById(node.id);
          if (cyNode && cyNode.length > 0) {
            cyNode.position({ x: node.x, y: node.y });
          }
        });
      }
    }
  }, [lastUndoState, clearUndoState, clearCytoscapeSelections, getCytoscapeInstance]);

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

  // REFACTOR STEP 1: Replace handleFitToView with hook function
  // OLD: const handleFitToView = useCallback(() => { dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } }); }, []);
  // NEW: Use graphOps.handleFitGraph which directly calls cy.fit() with proper padding
  const handleFitToView = useCallback(() => {
    graphOps.handleFitGraph();
  }, [graphOps]);

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
        // Decide effective mode from URL policy
        const search = window.location.search;
        const hasQuery = !!(search && search.length > 1);
        const params = new URLSearchParams(search);
        const canEditNow = (params.get('canedit') === 'true') || !hasQuery;
        const importedMode = (typeof g1.mode === 'string') ? g1.mode : 'editing';
        const effectiveMode = canEditNow ? importedMode : 'playing';
        setGraphData({ ...g2, mode: effectiveMode });
        dispatchAppState({ type: ACTION_TYPES.SET_MODE, payload: { mode: effectiveMode } });

        // Set map name if it's included in the imported data
        if (typeof g1.mapName === 'string') {
          dispatchAppState({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: g1.mapName } });
        }

        // Set CDN base URL if it's included in the imported data (even if empty string)
        if (typeof g1.cdnBaseUrl === 'string') {
          dispatchAppState({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: g1.cdnBaseUrl } });
        }
        if (typeof g1.orientation === 'number') {
          dispatchAppState({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: g1.orientation } });
        }
        if (typeof g1.compassVisible === 'boolean') {
          dispatchAppState({ type: ACTION_TYPES.SET_COMPASS_VISIBLE, payload: { visible: g1.compassVisible } });
        }
        // --- FIX: Load bgImage as data URL if needed ---
      if (typeof g1.bgImage === 'object' && g1.bgImage !== null) {
        let bgImageToSet = { ...g1.bgImage };
        bgImageToSet.included = !!bgImageToSet.imageUrl;
        printDebug(`App.jsx: Attempting to load background image ${ bgImageToSet.imageUrl ? 'from URL' : 'as empty' } for map ${g1.mapName}`);
        if (
          bgImageToSet.included
        ) {
          try {
            printDebug("??? FILE LOAD: Attempting to load BG image:", bgImageToSet.imageUrl);

            // ⬇️ fullSize=true (do not cache, no thumb)
            const rawDataUrl = await loadImageWithFallback(
              bgImageToSet.imageUrl,
              g1.mapName,
              g1.cdnBaseUrl || cdnBaseUrl,
              { fullSize: true }
            );

            // ⬇️ convert heavy PNG/JPEG to WebP, clamp size to 2048px
            const webpDataUrl = await dataUrlOrBlobToWebpDataUrl(rawDataUrl, 2048, 0.82);

            bgImageToSet = { ...bgImageToSet, imageUrl: webpDataUrl, included: true };
            printDebug("FILE LOAD: Loaded BG image dataUrl:", webpDataUrl);
          } catch {
            printDebug("FILE LOAD: Failed to load BG image, setting to empty.");
            bgImageToSet = { ...bgImageToSet, imageUrl: "", included: false };
          }
        } else {
          printDebug('App.jsx: No background image URL provided, setting to empty.');
          bgImageToSet = { ...bgImageToSet, imageUrl: "" };
        }
        setBgImage(bgImageToSet);
        dispatchAppState({ type: ACTION_TYPES.SET_BG_IMAGE, payload: { bgImage: bgImageToSet } });
      } else {
        printDebug('App.jsx: No background image URL provided, skipping load.');
      }

        // Reset camera + fit
        console.log("App: Internally resetting camera due to file load");
        dispatchAppState({ type: ACTION_TYPES.SET_ZOOM_INTERNAL, payload: { zoom: 1 } });
        dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION_INTERNAL, payload: { position: { x: 0, y: 0 } } });
        setTimeout(() => {
          dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });
        }, 150);
        // Clear selections and undo state (loading clears undo)
        clearCytoscapeSelections();
        dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
        clearUndoState();
      } else {
        printDebug('App: File load errors:', result.errors);
        dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: 'Invalid map file: ' + result.errors.join('; ') } });
      }
    } catch (error) {
      console.error('App: Failed to load file:', error);
      dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: 'Failed to load file: ' + error.message } });
    }

    // Clear the input so the same file can be selected again
    event.target.value = '';
  }, [clearCytoscapeSelections, clearUndoState, setBgImage, cdnBaseUrl]);

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

    // Reset background image underlay data
    const emptyBgImage = {
      imageUrl: "",
      x: 0,
      y: 0,
      scale: 100,
      opacity: 100,
      visible: false,
      included: false
    };
    setBgImage(emptyBgImage);
    dispatchAppState({ type: ACTION_TYPES.SET_BG_IMAGE, payload: { bgImage: emptyBgImage } });

    // Camera reset - update both app state and Cytoscape instance
    console.log("App.js handleNewMap: Resetting camera for new map");
    dispatchAppState({ type: ACTION_TYPES.SET_ZOOM_EXTERNAL, payload: { zoom: 1 } });
    dispatchAppState({ type: ACTION_TYPES.SET_CAMERA_POSITION_EXTERNAL, payload: { position: { x: 0, y: 0 } } });
    setTimeout(() => {
      dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });
    }, 150);
    // Clear errors & selections and undo state (new map clears undo)
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
    clearCytoscapeSelections();
    dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
    clearUndoState();
    
    // Clear query params from the browser address bar
    clearQueryParams();
  }, [graphData.nodes.length, mode, clearCytoscapeSelections, clearUndoState, setBgImage]);

  const clearError = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
  }, []);

  const isTransitioningRef = useRef(false);

  // Note viewing handlers - defined early to avoid circular dependencies
// Update handleStartNoteViewing to use the flag
  const handleStartNoteViewing = useCallback((targetId, targetType) => {
    // Check if we're transitioning between nodes
    const isTransitioning = noteViewingTarget && noteViewingTarget !== targetId;
    
    if (isTransitioning) {
      isTransitioningRef.current = true;
      // Clear the flag after the transition
      setTimeout(() => {
        isTransitioningRef.current = false;
      }, 100);
    }

    // Treat clicking another node while already viewing as a "switch", not a close+open
    const switching = !!noteViewingTarget && noteViewingTarget !== targetId;
    isSwitchingTargetsRef.current = switching;
    pendingViewTargetRef.current = targetId;

    // Zoom to selection if feature is enabled and we're in playing mode
    if (ZOOM_TO_SELECTION && targetId) {
      // Only save the "original camera" once, on the first zoom-in. For switches, reuse it.
      const shouldSaveCamera = !hasOriginalCamera();
      fitToSelection([targetId], {
        animate: true,
        padding: 80,
        targetHalf: 'top',
        saveCamera: shouldSaveCamera,
        zoomLevel: 'close'
      });
    }

    // Open (or switch) the viewer
    dispatchAppState({
      type: ACTION_TYPES.START_NOTE_VIEWING,
      payload: { targetId, targetType }
    });

    // Clear the "switching" guard on the next macrotask
    setTimeout(() => {
      isSwitchingTargetsRef.current = false;
      pendingViewTargetRef.current = null;
    }, 0);
  }, [fitToSelection, noteViewingTarget, hasOriginalCamera]);

  // Update handleCloseNoteViewing to check the transition flag
  const handleCloseNoteViewing = useCallback(() => {
    // Prevent duplicate execution and transitions
    if (isClosingNoteViewRef.current || isTransitioningRef.current) {
      printDebug('🚫 [App] handleCloseNoteViewing skipped (already in progress or transitioning)');
      return;
    }
    isClosingNoteViewRef.current = true;

    try {
      // Restore original camera if feature is enabled and we have a saved camera state
      // If we are switching to another target, DO NOT zoom_out now.
      if (!(isSwitchingTargetsRef.current)) {
        // Actual close: background click, Escape, or re-click same selected node
        if (ZOOM_TO_SELECTION && mode === 'playing' && hasOriginalCamera()) {
          printDebug('🎥 [App] Restoring original camera (note viewer close)');
          restoreOriginalCamera(true);
        }
      } else {
        printDebug('⏭️ [App] Suppressing camera restore (target switch in progress)');
      }
      dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_VIEWING });
    } finally {
      // Release flag on next tick to allow future closes
      setTimeout(() => { 
        isClosingNoteViewRef.current = false;
      }, 0);
      // We are done with any pending switch intent once a close has run.
      pendingViewTargetRef.current = null;
    }
  }, [mode, restoreOriginalCamera, hasOriginalCamera]);

  // Debug modal open/close now via modalOps

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
    
  }, [nodeSelectionOrder]);

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
      uniqueId = 'untitled' + counter;
      uniqueTitle = 'untitled' + counter;
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

    // --- Fix: Only export filename for bgImage ---
    let exportedBgImage = { ...bgImage };
    if (exportedBgImage.imageUrl && exportedBgImage.imageUrl.startsWith("data:image/jpeg")) {
      exportedBgImage.imageUrl = "underlay.jpeg";
    } else if (exportedBgImage.imageUrl && exportedBgImage.imageUrl.startsWith("data:image/jpg")) {
      exportedBgImage.imageUrl = "underlay.jpg";
    } else if (exportedBgImage.imageUrl && exportedBgImage.imageUrl.startsWith("data:image/png")) {
      exportedBgImage.imageUrl = "underlay.png";
    } else if (exportedBgImage.imageUrl && exportedBgImage.imageUrl.startsWith("data:image/webp")) {
      exportedBgImage.imageUrl = "underlay.webp";
    } else {
      printDebug("⚠️ App: Background image is not a recognized data URL, exporting anyway");
      printDebug(`exportedBgImage.imageUrl: ${exportedBgImage.imageUrl}`);
      exportedBgImage = { ...exportedBgImage, included: false, imageUrl: "" };
    }

    const updatedGraph = {
      ...graphData,
      nodes: updatedNodes,
      mode,
      mapName,
      cdnBaseUrl,
      orientation,
      compassVisible,
      bgImage: exportedBgImage
    };

    // Generate filename from map name: lowercase, spaces to underscores
    const sanitizedMapName = mapName
      .toLowerCase()
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/[^a-z0-9_-]/g, '') // Remove any non-alphanumeric characters except underscores and hyphens
      || 'untitled_map'; // fallback if map name is empty or becomes empty after sanitization
    
    const filename = sanitizedMapName + '.json';

    const json = serializeGraph(updatedGraph);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [graphData, exportNodePositions, mode, mapName, cdnBaseUrl, orientation, compassVisible, bgImage]);

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

  // 🔴 Live camera values (smooth BG), plus debounced reducer commits
  const {
    livePan,
    liveZoom,
    onViewportChange,
  } = useCamera(dispatchAppState, appState);

  // REFACTOR STEP 1: Replace handleRotateMap with hook function  
  // OLD: const handleRotateMap = useCallback(() => { const next = rotateCompassOnly(orientation); dispatchAppState({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: next } }); }, [orientation]);
  // NEW: Use graphOps.handleRotateRight which handles the same 90° clockwise rotation
  const handleRotateMap = useCallback(() => {
    graphOps.handleRotateRight();
  }, [graphOps]);
  
  // New: rotate all nodes AND compass (graph controls button)
  const handleRotateNodesAndMap = useCallback(() => {
    // Save undo first
    saveUndoState();
    
    // Get the Cytoscape instance for direct manipulation
    const cy = getCytoscapeInstance();
    
    setGraphData(prev => {
      const { nodes: rotated } = rotateNodesAndCompass(prev.nodes, orientation);
      printDebug('🌀 App: Rotated nodes data updated, triggering re-render:', { 
        nodeCount: rotated.length, 
        firstNodeBefore: prev.nodes[0] ? `(${prev.nodes[0].x}, ${prev.nodes[0].y})` : 'none',
        firstNodeAfter: rotated[0] ? `(${rotated[0].x}, ${rotated[0].y})` : 'none'
      });
      
      // If Cytoscape is available, immediately update positions for instant visual feedback
      if (cy) {
        printDebug('🔄 App: Forcing immediate position update in Cytoscape after rotation');
        rotated.forEach(node => {
          const cyNode = cy.getElementById(node.id);
          if (cyNode.length > 0) {
            cyNode.position({ x: node.x, y: node.y });
          }
        });
        // Force a layout refresh to ensure everything is properly positioned
        //// TODO: troubleshoot performance with fit calls
        //// printDebug("Forcing Cytoscape layout refresh after map rotation");
        cy.fit(cy.nodes(), 50);
      }
      
      return { ...prev, nodes: rotated };
    });
    const next = ((orientation + 90) % 360 + 360) % 360; // keep normalization consistent
    dispatchAppState({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: next } });
  }, [orientation, saveUndoState, getCytoscapeInstance]);

  const handleToggleCompass = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_COMPASS_VISIBLE, payload: { visible: !compassVisible } });
  }, [compassVisible]);

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
    // If we're already viewing a note and clicking on a different node,
    // transition directly without zooming out first
    if (noteViewingTarget && noteViewingTarget !== nodeId) {
      // Direct transition to new node - only zoom in to new target
      if (ZOOM_TO_SELECTION) {
        fitToSelection([nodeId], {
          animate: true,
          padding: 80,
          targetHalf: 'top',
          saveCamera: false, // Don't save camera since we're transitioning
          zoomLevel: 'close'
        });
      }
      
      // Update note viewing target directly without closing first
      dispatchAppState({
        type: ACTION_TYPES.START_NOTE_VIEWING,
        payload: { targetId: nodeId, targetType: "node" }
      });
    } else if (noteViewingTarget === nodeId) {
      // Clicking on the same node - close the note viewer (zoom out)
      handleCloseNoteViewing();
    } else {
      // No note currently viewing - open new one (zoom in)
      handleStartNoteViewing(nodeId, "node");
    }
  }
  // In editing mode, clicking does nothing (selection is handled by Cytoscape)
}, [mode, noteViewingTarget, handleStartNoteViewing, handleCloseNoteViewing, fitToSelection]);

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
    
    // Close note editing modal if open
    if (noteEditingTarget) {
      handleCloseNoteEditing();
    }
    // Close note viewing modal if open
    else if (noteViewingTarget) {
      handleCloseNoteViewing();
    }
    // Only restore camera if no modals are open (modals handle their own camera restoration)
    else if (mode === 'playing' && ZOOM_TO_SELECTION && hasOriginalCamera()) {
      restoreOriginalCamera(true);
    }
  }, [mode, noteEditingTarget, noteViewingTarget, handleCloseNoteEditing, handleCloseNoteViewing, clearCytoscapeSelections, hasOriginalCamera, restoreOriginalCamera]);

  const areNodesConnected = useCallback((sourceId, targetId) => {
    return graphData.edges.some(e =>
      (e.source === sourceId && e.target === targetId) ||
      (e.source === targetId && e.target === sourceId)
    );
  }, [graphData.edges]);

  // ---------- keyboard shortcuts (moved to hook) ----------
  useKeyboardHandlers({
    mode,
    getSelections: () => ({ selectedNodeIds, selectedEdgeIds }),
    onDeleteSelectedNodes: handleDeleteSelectedNodes,
    onDeleteSelectedEdges: handleDeleteSelectedEdges,
    graphOps,
    modalOps,
    onResetSelection: () => {
      dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
      clearCytoscapeSelections();
    }
  });

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
        DEV_MODE
      }
    };
  }, [
    exportNodePositions, graphData, mode, zoomLevel, cameraPosition, 
    selectedNodeIds, nodeSelectionOrder, selectedEdgeIds, shouldFitOnNextRender, 
    loadError, noteEditingTarget, noteEditingType, noteViewingTarget, debugModalOpen,
    lastUndoState
  ]);

  // Memoize props for CytoscapeGraph
  const memoNodes = useMemo(() => graphData.nodes, [graphData.nodes]);
  const memoEdges = useMemo(() => graphData.edges, [graphData.edges]);
  const memoSelectedNodeIds = useMemo(() => selectedNodeIds, [selectedNodeIds]);
  const memoSelectedEdgeIds = useMemo(() => selectedEdgeIds, [selectedEdgeIds]);
  const memoCameraPosition = useMemo(() => cameraPosition, [cameraPosition]);
  const memoNotes = useMemo(() => graphData.notes, [graphData.notes]);

  const handleLoadFromCdnButton = useCallback((cdnBaseUrlArg) => {
  handleLoadFromCdn({
      cdnBaseUrl: cdnBaseUrlArg,
      mapName,
      setCdnLoadingState,
      setIsLoadingFromCDN,
      currentCdnLoadRef,
      normalizeGraphData,
      hydrateCoordsIfMissing,
      setGraphData,
      dispatchAppState,
      clearCytoscapeSelections,
      clearUndoState,
      defaultShipLogData,
      ACTION_TYPES,
      setBgImage
    });
  }, [
    setCdnLoadingState,
    setIsLoadingFromCDN,
    currentCdnLoadRef,
    setGraphData,
    dispatchAppState,
    clearCytoscapeSelections,
    clearUndoState,
    mapName,
    setBgImage
  ]);

  useEffect(() => {
  // Listen for TRIGGER_GRAPH_UPDATE action
  // You can use a ref or a flag in appState if you want to avoid repeated triggers
  // Here, we'll just listen for changes in appState and graphData
  if (appState.lastActionType === ACTION_TYPES.TRIGGER_GRAPH_UPDATE) {
    const cy = getCytoscapeInstance();
    if (cy && graphData.nodes) {
      printDebug('🔄 App: Forcing immediate position update in Cytoscape after loading from CDN');
      graphData.nodes.forEach(node => {
        const cyNode = cy.getElementById(node.id);
        if (cyNode.length > 0) {
          cyNode.position({ x: node.x, y: node.y });
        }
      });
    }
  }
}, [appState.lastActionType, graphData.nodes, getCytoscapeInstance]);


useEffect(() => {
  if (appState.lastLoadedMapUrl) {
    localStorage.setItem('shipLogLastLoadedMapUrl', appState.lastLoadedMapUrl);
  }
}, [appState.lastLoadedMapUrl]);

  /** ---------- render ---------- **/
  return (
    <div className="App">
      {/* Background image underlay */}
      {bgImage.imageUrl && bgImage.visible && (
        <BgImageLayer
          url={bgImage.imageUrl}
          visible={bgImage.visible}
          opacity={bgImage.opacity}
          pan={livePan}              // 🔴 live pan (every frame)
          zoom={liveZoom}            // 🔴 live zoom (every frame)
          calibration={ bgCalibration
            // keep your existing semantics: scale is a percentage
            // tx: bgImage.x,                  // world offset X (same units as node positions)
            // ty: bgImage.y,                  // world offset Y
            // s: (bgImage.scale ?? 100) / 100 // world units per image pixel
          }
        />
      )}

      {canEdit && (
        <GraphControls
          selectedNodes={selectedNodeIds}
          selectedEdges={selectedEdgeIds}
          onCreateNode={handleCreateNode}
          onDeleteSelectedNodes={handleDeleteSelectedNodes}
          onDeleteSelectedEdges={handleDeleteSelectedEdges}
          onEditSelected={handleEditSelected}
          onConnectNodes={handleConnectSelectedNodes}
          onExportMap={exportMap}
          onNewMap={handleNewMap}
          onNodeColorChange={handleNodeColorChange}
          areNodesConnected={areNodesConnected}
          mode={mode}
          collapsed={graphControlsCollapsed}
          onToggleCollapsed={toggleGraphControls}
          onOpenDebugModal={DEV_MODE ? modalOps.openDebugModal : undefined}
          onOpenShareModal={modalOps.openShareModal}
          onUndo={handleUndo}
          canUndo={!!lastUndoState}
          onRotateCompass={handleRotateMap}
          onOpenBgImageModal={openBgImageModal}
        />
      )}

      <UniversalControls
        fileInputRef={fileInputRef}
        onImportFile={handleFileSelect}
        onFitToView={handleFitToView}
        onModeToggle={canEdit ? handleModeToggle : undefined}
        mode={mode}
        showNoteCountOverlay={showNoteCountOverlay}
        onToggleNoteCountOverlay={handleToggleNoteCountOverlay}
        onRotateNodesAndCompass={handleRotateNodesAndMap}
        orientation={orientation}
        compassVisible={compassVisible}
        onToggleCompass={handleToggleCompass}
        collapsed={universalMenuCollapsed}
        onToggleCollapsed={toggleUniversalMenu}
        cdnBaseUrl={cdnBaseUrl}
        onLoadFromCdn={handleLoadFromCdnButton}
        bgImage={bgImage}
        onToggleBgImageVisible={toggleBgImageVisible}
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
          onClose={modalOps.closeDebugModal}
          debugData={getDebugData()}
          getCytoscapeInstance={getCytoscapeInstance}
        />
      )}

      <ShareModal
        isOpen={modalOps.isShareModalOpen}
        onClose={modalOps.closeShareModal}
        mapName={mapName}
        cdnBaseUrl={cdnBaseUrl}
      />

      {(!CAMERA_INFO_HIDDEN && canEdit) && (
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
          collapsed={cameraInfoCollapsed}
          onToggleCollapsed={toggleCameraInfo}
        />
      )}

      <ErrorDisplay error={loadError} onClearError={clearError} />

      {/* CDN Loading Indicator */}
      {cdnLoadingState.isLoading && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#fff',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '2px solid #fff',
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          Loading map from CDN...
        </div>
      )}

      {/* CDN Error Display */}
      {cdnLoadingState.error && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#d32f2f',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '6px',
          zIndex: 9999,
          maxWidth: '500px',
          textAlign: 'center'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>CDN Loading Error</div>
          <div style={{ fontSize: '14px', marginBottom: '12px' }}>{cdnLoadingState.error}</div>
          <button
            onClick={() => setCdnLoadingState({ isLoading: false, error: null })}
            style={{
              background: '#fff',
              color: '#d32f2f',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <CytoscapeGraph
        key={`graph-${cdnBaseUrl || 'none'}`}
        nodes={memoNodes}
        edges={memoEdges}
        mode={mode}
        mapName={mapName}
        cdnBaseUrl={cdnBaseUrl}
        selectedNodeIds={memoSelectedNodeIds}
        selectedEdgeIds={memoSelectedEdgeIds}
        onNodeMove={handleNodeMove}
        onViewportChange={onViewportChange} // 🔴 every-frame stream for BG
        initialZoom={zoomLevel}
        initialCameraPosition={memoCameraPosition}
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
        showNoteCountOverlay={showNoteCountOverlay}
        notes={memoNotes}
      />

      {compassVisible && (
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 900, width: '60px', height: '60px', pointerEvents: 'none', opacity: 0.9 }}>
          <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: `rotate(${orientation}deg)` }}>
            <circle cx="50" cy="50" r="48" fill="rgba(0,0,0,0.4)" stroke="#fff" strokeWidth="2" />
            <polygon points="50,15 60,50 50,45 40,50" fill="#ff5252" />
            <polygon points="50,85 40,50 50,55 60,50" fill="#fff" />
            <text x="50" y="20" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="sans-serif">N</text>
            <text x="50" y="95" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="sans-serif">S</text>
            <text x="15" y="55" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="sans-serif">W</text>
            <text x="85" y="55" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="sans-serif">E</text>
          </svg>
        </div>
      )}

      <BgImageModal
        isOpen={bgImageModalOpen}
        onClose={closeBgImageModal}
        bgImage={bgImage}
        onChange={changeBgImage}
        onLoadImage={loadImageFile}
        onDeleteImage={deleteImage}
      />
    </div>
  );
}

export default App;
