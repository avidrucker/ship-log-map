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
 *    - Note: graphOps.handleRotateNodesAndMap still uses local implementation (complex node rotation)
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
import GraphControls from "./components/GraphControls.jsx";
import UniversalControls from "./components/UniversalControls.jsx";
import NoteEditorModal from "./components/NoteEditorModal.jsx";
import NoteViewerModal from "./components/NoteViewerModal.jsx";
import DebugModal from "./components/DebugModal.jsx";
import ShareModal from "./components/ShareModal.jsx";
import ReadingModal from "./components/ReadingModal.jsx";
import CameraInfo from "./components/CameraInfo.jsx";
import ErrorDisplay from "./components/ErrorDisplay.jsx";
import { useCytoscapeInstance } from "./useCytoscapeInstance";
import { appStateReducer, initialAppState, ACTION_TYPES } from "./appStateReducer";
import { ZOOM_TO_SELECTION, DEBUG_LOGGING, DEV_MODE, GRAYSCALE_IMAGES, CAMERA_INFO_HIDDEN } from "./config/features.js";
import { handleLoadFromCdn, setCdnBaseUrl, getCdnBaseUrl } from "./utils/cdnHelpers.js"; // getMapUrlFromQuery, clearQueryParams
import BgImageModal from "./components/BgImageModal.jsx";
import { useBgImageState } from "./bg/useBgImageState";
// import { loadImageWithFallback } from "./utils/imageLoader.js";
// import { dataUrlOrBlobToWebpDataUrl } from "./utils/imageUtils.js"
// import { serializeGraph } from "./graph/ops.js";
import { normalizeGraphData, hydrateCoordsIfMissing } from "./utils/mapHelpers.js";

// 🚀 New imports: centralized persistence + edge id helper
import { saveToLocal, loadFromLocal, saveModeToLocal, loadModeFromLocal, saveUndoStateToLocal, loadUndoStateFromLocal, saveMapNameToLocal, loadMapNameFromLocal, loadUniversalMenuCollapsed, loadGraphControlsCollapsed, loadCameraInfoCollapsed, saveUniversalMenuCollapsed, saveGraphControlsCollapsed, saveCameraInfoCollapsed } from "./persistence/index.js";
// Add new persistence imports
import { loadOrientationFromLocal, saveOrientationToLocal, loadCompassVisibleFromLocal, saveCompassVisibleToLocal } from './persistence/index.js';
import { renameNode } from "./graph/ops.js"; // edgeId
import { printDebug, printWarn } from "./utils/debug.js";
// import { rotateNodesAndCompass } from './utils/rotation.js';  // REFACTOR STEP 1: Removed rotateCompassOnly - now using graphOps.handleRotateRight
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

import { useUndo } from "./hooks/useUndo.js";

import { useImportExport } from "./hooks/useImportExport.js";

import { SearchUIProvider, useSearchUI } from './search/SearchUIContext';

import HashtagSearchBar from './search/HashtagSearchBar.jsx';

import { useGlobalSearchHotkeys } from './search/useGlobalSearchHotkeys.js';

import MobileSearchButton from './search/MobileSearchButton.jsx';

import useVisited from './hooks/useVisited.js';
import { makeVisitedLookup } from './utils/visitedLookup.js';

import HelpModal from "./components/HelpModal.jsx";

import { cacheGraphImages } from './swRegistration';

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function hashList(urls) {
  // tiny DJB2 string hash
  let h = 5381;
  for (let i = 0; i < urls.length; i++) {
    const s = urls[i];
    for (let j = 0; j < s.length; j++) {
      h = ((h << 5) + h) ^ s.charCodeAt(j);
    }
  }
  // stringify as base36 so it’s short
  return (h >>> 0).toString(36);
}

/** ---------- helpers & migration ---------- **/
// Memoize the notes object itself to prevent unnecessary re-renders
const createGetNodeNotes = (notes) => (node) => {
  const nodeNotes = notes?.[node.id];
  return Array.isArray(nodeNotes) ? nodeNotes : [];
};

const createGetEdgeNotes = (notes) => (edge) => {
  const edgeNotes = notes?.[edge.id];
  return Array.isArray(edgeNotes) ? edgeNotes : [];
};

// Add this helper at the top of App.jsx or in a separate utils file
// Replace the buildFullImageUrl function with this improved version:
// Normalizes a CDN base + image path so the map segment appears exactly once
function buildFullImageUrl(imageUrl, cdnBaseUrl, mapName) {
  // 1) keep data URLs as-is
  if (!imageUrl || imageUrl.startsWith('data:')) return imageUrl;

  // 2) absolute URLs: return as-is
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;

  if (!cdnBaseUrl) return imageUrl;

  // Normalize pieces
  const baseNoTrail = cdnBaseUrl.replace(/\/+$/, '');   // remove trailing slash(es)
  let pathNoLead   = imageUrl.replace(/^\/+/, '');      // remove leading slash(es)

  // Detect both encoded and decoded mapName at the beginning of the path
  const mapNameDecoded = mapName || '';
  const mapNameEncoded = encodeURIComponent(mapNameDecoded);

  const startsWithDecoded = pathNoLead.startsWith(mapNameDecoded + '/');
  const startsWithEncoded = pathNoLead.startsWith(mapNameEncoded + '/');

  // If the path already starts with the map name (decoded or encoded), strip it once
  if (startsWithDecoded) {
    pathNoLead = pathNoLead.slice((mapNameDecoded + '/').length);
  } else if (startsWithEncoded) {
    pathNoLead = pathNoLead.slice((mapNameEncoded + '/').length);
  }

  // Now ensure the base ends with exactly one map segment.
  // If base already ends with the map name (encoded or decoded), keep it;
  // otherwise append the ENCODED map name (safe for URLs).
  const baseEndsWithDecoded = baseNoTrail.endsWith('/' + mapNameDecoded);
  const baseEndsWithEncoded = baseNoTrail.endsWith('/' + mapNameEncoded);

  const baseWithMap = (baseEndsWithDecoded || baseEndsWithEncoded)
    ? baseNoTrail
    : `${baseNoTrail}/${mapNameEncoded}`;

  // Join
  return `${baseWithMap}/${pathNoLead}`;
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
  // Suppress "empty selection" close while we're switching/opening a target
  const suppressEmptyCloseRef = useRef(false);

  // Use the Cytoscape instance management hook
  const {
    setCytoscapeInstance,
    getCytoscapeInstance,
    updateNodeInPlace,
    clearCytoscapeSelections,
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

  // Get search UI context for opening the search bar
  const { open: openSearchBar, isOpen } = useSearchUI();

  // Set up global hotkeys for search (Ctrl+F to open, Escape is handled by the search bar itself)
  useGlobalSearchHotkeys(openSearchBar);

  // ---------- graph (nodes/edges/notes/mode) ----------
  const [graphData, setGraphData] = useState(() => {
    // Try new persistence; fall back to default
    const saved = loadFromLocal();
    if (saved) {
      return saved;
    }
    // default data normalized
    return defaultShipLogData;
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

  // Reading modal state
  const [readingModalOpen, setReadingModalOpen] = useState(false);
  const openReadingModal = useCallback(() => setReadingModalOpen(true), []);
  const closeReadingModal = useCallback(() => setReadingModalOpen(false), []);

  // Share modal state
  // Centralized modal helpers (note editor/viewer/debug via reducer, share via local)
  const modalOps = useModalState(dispatchAppState, appState, {
    openBgImageModal,
    closeBgImageModal,
    bgImageModalOpen
  });

  // Initialize undo hook
  const { clearUndoState, saveUndoCheckpoint, applyUndoIfAvailable, canUndo } = useUndo(
    appState, 
    dispatchAppState, 
    getCytoscapeInstance, 
    clearCytoscapeSelections
  );

  // Initialize import/export hook // openShareModalWithCurrentState
  const { handleFileSelect, handleNewMap, exportGraphToJson } = useImportExport({
    dispatch: dispatchAppState,
    graph: {
      nodes: graphData.nodes,
      edges: graphData.edges,
      notes: graphData.notes,
      mode: mode,
      mapName: mapName,
      cdnBaseUrl: cdnBaseUrl,
      orientation: orientation,
      compassVisible: compassVisible,
      bgImage: bgImage
    },
    setBgImage,
    clearUndoState,
    onOpenShareModal: modalOps.openShareModal,
    setGraphData,
    clearCytoscapeSelections,
    defaultShipLogData,
    getCanEditFromQuery,
    hasAnyQueryParams
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
  const graphOps = useGraphOperations({
    cy: getCytoscapeInstance(),
    dispatch: dispatchAppState,
    graph: {
      nodes: graphData.nodes,
      edges: graphData.edges,
      notes: graphData.notes,
      orientation: orientation
    },
    selections: {
      selectedNodeIds,
      nodeSelectionOrder,
      selectedEdgeIds
    },
    saveUndoCheckpoint,
    setGraphData,
    clearCytoscapeSelections,
    updateNodeInPlace,
    getViewportCenter
  });

  // REFACTOR STEP 2: Initialize map loading hook for URL monitoring
  // This replaces the large URL monitoring useEffect in App.jsx
  useMapLoading({
    appState,
    dispatchAppState,
    defaultShipLogData,
    setGraphData,
    setBgImage,
    clearUndoState,
    setCdnLoadingState,
    setIsLoadingFromCDN,
    clearCytoscapeSelections,
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

  // 🔴 Live camera values (smooth BG), plus debounced reducer commits
  const {
    livePan,
    liveZoom,
    onViewportChange,
  } = useCamera(dispatchAppState, appState);

  // ✅ ADD: Save immediately on page unload (no debounce)
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem("shipLogCamera", JSON.stringify({
          zoom: liveZoom,
          position: livePan
        }));
        printDebug('[CAMERA] Saved final camera state on unload:', { zoom: liveZoom, position: livePan });
      } catch (e) {
        printWarn('Failed to save camera on unload:', e);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Also save when component unmounts
      handleBeforeUnload();
    };
  }, [liveZoom, livePan]);

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

  const saveUndoState = useCallback(() => {
    saveUndoCheckpoint(graphData);
  }, [saveUndoCheckpoint, graphData]);

  const handleUndo = useCallback(() => {
    applyUndoIfAvailable(setGraphData);
  }, [applyUndoIfAvailable]);

  // Per-map visited state (persists to localStorage, never in domain JSON)
  const {
    visited,
    markNodeVisited,
    markEdgeVisited,
    clearForMap: clearVisitedForMap
  } = useVisited(mapName);

  const handleClearVisited = useCallback(() => {
    const confirmed = window.confirm(
      `Are you sure you want to clear all reading history for "${mapName}"?\n\n` +
      'This will mark all nodes and edges as unvisited (unseen). This action cannot be undone.'
    );
    
    if (confirmed) {
      clearVisitedForMap();
    }
  }, [clearVisitedForMap, mapName]);

  // Typewriter control: opens viewer immediately but delays typewriter until zoom completes
  const [typewriterEnabled, setTypewriterEnabled] = useState(false);
  const [shouldMountTypewriter, setShouldMountTypewriter] = useState(false); // NEW: Controls if TypewriterText component should mount at all
  const typewriterRef = useRef(false);
  // Track the latest zoom start to ignore stale completions
  const latestZoomTokenRef = useRef(null);

  // Track App renders (for debugging if needed)
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  // Memoized visited lookup: isUnseen(id) -> boolean
  const isUnseen = useMemo(
    () => makeVisitedLookup({ nodes: graphData.nodes, edges: graphData.edges, visited }),
    [graphData.nodes, graphData.edges, visited]
  );

  // ✅ ADD THIS RIGHT AFTER THE HOOK DECLARATIONS
  console.log('🏁 [App] Component rendered with:', { cdnBaseUrl, mapName, nodeCount: graphData.nodes.length, firstNodeImage: graphData.nodes[0]?.imageUrl });

  /** ---------- handlers ---------- **/

  // REFACTOR STEP 1: Replace handleFitToView with hook function
  // OLD: const handleFitToView = useCallback(() => { dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } }); }, []);
  // NEW: Use graphOps.handleFitGraph which directly calls cy.fit() with proper padding

  const handleFitCompleted = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: false } });
  }, []);

  const clearError = useCallback(() => {
    dispatchAppState({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
  }, []);

// Warm the SW image cache ONCE per image set (and when it changes).
// Fires only when: SW is available, CDN load is done, we’re online, and the URL list changed.
const didWarmRef = useRef(false);
useEffect(() => {
  if (!('serviceWorker' in navigator)) return;
  if (isLoadingFromCDN) return; // wait until CDN load completes
  // Build absolute image URLs from the current graph
  const raw = (graphData.nodes || [])
    .map(n => n.imageUrl)
    .filter(u => u && u !== 'unspecified');
  const full = uniqueSorted(raw.map(u => buildFullImageUrl(u, cdnBaseUrl, mapName)));
  if (full.length === 0) return;
  const hash = hashList(full);
  const key = `shipLog:imageListHash:${mapName || 'default'}`;
  const prev = localStorage.getItem(key);
  // Only warm if new set or first time this session
  if (prev === hash && didWarmRef.current) return;
  // If offline, retry once we’re online
  const doWarm = () => {
    cacheGraphImages(full);               // handles SW-ready & controller internally
    localStorage.setItem(key, hash);      // remember this set
    didWarmRef.current = true;
  };
  if (navigator.onLine) {
    doWarm();
  } else {
    const once = () => { window.removeEventListener('online', once); doWarm(); };
    window.addEventListener('online', once, { once: true });
  }
}, [isLoadingFromCDN, graphData.nodes, cdnBaseUrl, mapName]);

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
    // While opening/switching, suppress any empty-selection close from Cytoscape
    suppressEmptyCloseRef.current = true;

    // ---- Compute first-open flag for typewriter logic ----
    // Only typewriter the first time we open a given id (and only if there's content)
    const hasContent =
      (Array.isArray(graphData?.notes?.[targetId]) ? graphData.notes[targetId].join('\n\n') : (graphData?.notes?.[targetId] || '')).trim().length > 0;
    const unseenNow = isUnseen(targetId);
    typewriterRef.current = Boolean(unseenNow && hasContent);

    // Open the viewer immediately, but don't mount TypewriterText yet.
    // We'll mount it after the zoom animation completes.
    setTypewriterEnabled(false);
    setShouldMountTypewriter(false); // Don't mount TypewriterText during animation

    // Zoom to selection if feature is enabled and we're in playing mode
    if (ZOOM_TO_SELECTION && targetId) {
      printDebug("📹 [StartNoteViewing] Beginning zoom sequence for:", targetId);
      
      // Only save the "original camera" once, on the first zoom-in. For switches, reuse it.
      const shouldSaveCamera = !hasOriginalCamera();
      const zoomStartTime = performance.now();
      
      const zoomPromise = fitToSelection([targetId], {
        animate: true,
        padding: 80,
        targetHalf: 'top',
        saveCamera: shouldSaveCamera,
        zoomLevel: 'close'
      });

      // Mount TypewriterText and enable it only when zoom completes AND we're still viewing this same target
      const token = Symbol('zoom-token');
      latestZoomTokenRef.current = token;
      zoomPromise.finally(() => {
        const zoomEndTime = performance.now();
        const totalZoomTime = zoomEndTime - zoomStartTime;
        
        if (latestZoomTokenRef.current === token) {
          printDebug("✅ [StartNoteViewing] Zoom complete, adding small delay before mounting typewriter:", {
            targetId,
            totalTime: totalZoomTime.toFixed(2) + 'ms',
            willTypewriter: typewriterRef.current
          });
          
          // Add a small delay to ensure viewport streaming has fully resumed
          // and any pending renders have completed before mounting TypewriterText
          setTimeout(() => {
            if (latestZoomTokenRef.current === token) {
              printDebug("⌨️ [StartNoteViewing] Mounting and enabling typewriter now");
              setShouldMountTypewriter(true); // Mount the component
              setTypewriterEnabled(true); // Enable animation
            } else {
              printDebug("⚠️ [StartNoteViewing] Token changed during delay - NOT enabling typewriter");
            }
          }, 100); // 100ms grace period for rendering to settle
        } else {
          printDebug("⚠️ [StartNoteViewing] Zoom complete but token mismatch - NOT enabling typewriter");
        }
      });
    } else {
      printDebug("📹 [StartNoteViewing] No zoom needed, mounting and enabling typewriter immediately");
      // No zoom → mount and enable typewriter immediately
      setShouldMountTypewriter(true);
      setTypewriterEnabled(true);
    }

    // Open (or switch) the viewer
    dispatchAppState({
      type: ACTION_TYPES.START_NOTE_VIEWING,
      payload: { targetId, targetType }
    });

    // Mark as visited
    if (targetType === 'node') markNodeVisited(targetId);
    else if (targetType === 'edge') markEdgeVisited(targetId);

    // NOTE: we now clear the guards when the new selection actually lands
    // (see handleNodeSelectionChange).
  }, [fitToSelection, noteViewingTarget, hasOriginalCamera, graphData, isUnseen, markNodeVisited, markEdgeVisited]);

  // Update handleCloseNoteViewing to check the transition flag
  const handleCloseNoteViewing = useCallback(() => {
    // Disable and unmount typewriter immediately on close
    setTypewriterEnabled(false);
    setShouldMountTypewriter(false); // Unmount TypewriterText component
    latestZoomTokenRef.current = null; // invalidate any pending completion

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
          // Optionally await to ensure smoothness before other UI changes
          restoreOriginalCamera(true);
        }
      } else {
        printDebug('⏭️ [App] Suppressing camera restore (target switch in progress)');
      }
      dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_VIEWING });
      // Ensure selection is cleared on true close so 'selected' class doesn't linger
      if (mode === 'playing' && !isSwitchingTargetsRef.current) {
        dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
        clearCytoscapeSelections();
      }
    } finally {
      // Release flag on next tick to allow future closes
      setTimeout(() => { 
        isClosingNoteViewRef.current = false;
      }, 0);
      // We are done with any pending switch intent once a close has run.
      pendingViewTargetRef.current = null;
      isSwitchingTargetsRef.current = false;
    }
  }, [mode, restoreOriginalCamera, hasOriginalCamera, clearCytoscapeSelections]);

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

  const handleNodeSelectionChange = useCallback((nodeIds) => {
    printDebug('🏠 App: Node selection changed to:', nodeIds);

    // -------- selection bookkeeping (unchanged semantics) --------
    const newSelectionOrder = [...nodeSelectionOrder];
    const filteredOrder = newSelectionOrder.filter(id => nodeIds.includes(id));
    const newNodes = nodeIds.filter(id => !newSelectionOrder.includes(id));
    const updatedOrder = [...filteredOrder, ...newNodes];

    dispatchAppState({
      type: ACTION_TYPES.SET_NODE_SELECTION,
      payload: { nodeIds, selectionOrder: updatedOrder }
    });

    // Clear guards when we have a selection
    if (nodeIds.length > 0) {
      suppressEmptyCloseRef.current = false;
      // If we were switching targets and the new selection has landed,
      // drop the switch flag so a subsequent close can restore camera.
      if (pendingViewTargetRef.current && nodeIds.length === 1 && nodeIds[0] === pendingViewTargetRef.current) {
        isSwitchingTargetsRef.current = false;
        pendingViewTargetRef.current = null;
      }
    }
  }, [nodeSelectionOrder, dispatchAppState]);

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

    graphOps.handleNodeSizeChange(nodeId, nextSize);
  }, [graphData.nodes, graphOps]);

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

    graphOps.handleEdgeDirectionChange(edgeId, nextDirection);
  }, [graphData.edges, graphOps]);

  // REFACTOR STEP 1: Replace handleRotateMap with hook function  
  // OLD: const handleRotateMap = useCallback(() => { const next = rotateCompassOnly(orientation); dispatchAppState({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: next } }); }, [orientation]);
  // NEW: Use graphOps.handleRotateRight which handles the same 90° clockwise rotation

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
    printDebug('👆 node tap:', { nodeId, mode, noteViewingTarget });
    if (mode !== 'playing') return;

    // Click same node → close (zoom-out)
    if (noteViewingTarget === nodeId) {
      printDebug('🔻 same-node clicked -> toggle close');
      // This is an explicit close, not a switch — clear ALL guards
      isSwitchingTargetsRef.current = false;
      pendingViewTargetRef.current = null;
      suppressEmptyCloseRef.current = false;
      isTransitioningRef.current = false; // Clear this flag too
      isClosingNoteViewRef.current = false; // Clear the closing guard
      
      // Guard against empty-selection auto-close races while we explicitly close
      suppressEmptyCloseRef.current = true;
      // Treat this as an explicit close, not a switch
      isSwitchingTargetsRef.current = false;
      pendingViewTargetRef.current = null;
      isTransitioningRef.current = false;
      isClosingNoteViewRef.current = false;
      
      // Close viewer (this will restore camera immediately)
      handleCloseNoteViewing();
      // Explicitly clear selection so the node is truly deselected
      dispatchAppState({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
      clearCytoscapeSelections();
      // Release the guard on next tick
      setTimeout(() => { suppressEmptyCloseRef.current = false; }, 0);
      return;
    } else {
      printDebug('🔺 different node clicked -> open/switch');
    }

    // Open OR switch always goes through handleStartNoteViewing.
    handleStartNoteViewing(nodeId, 'node');
  }, [mode, noteViewingTarget, handleStartNoteViewing, handleCloseNoteViewing, clearCytoscapeSelections]);
      
  const handleEdgeClick = useCallback((edgeId) => {
    if (mode === 'playing') {
      // In playing mode, clicking an edge opens the note viewer
      handleStartNoteViewing(edgeId, "edge");
    }
    // In editing mode, clicking does nothing (selection is handled by Cytoscape)
  }, [mode, handleStartNoteViewing]);

  const handleBackgroundClick = useCallback(() => {
    // Set guard to prevent handleNodeSelectionChange from also closing
    suppressEmptyCloseRef.current = true;

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

    // Clear the guard after a short delay to allow future empty selection closes
    setTimeout(() => {
      suppressEmptyCloseRef.current = false;
    }, 100);
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
    onDeleteSelectedNodes: graphOps.handleDeleteSelectedNodes,
    onDeleteSelectedEdges: graphOps.handleDeleteSelectedEdges,
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
  
  // Memoize background image object to prevent infinite re-renders
  const memoBgImage = useMemo(() => {
    if (!bgImage.imageUrl) return null;
    return {
      imageUrl: bgImage.imageUrl,
      visible: bgImage.visible,
      opacity: bgImage.opacity,
      calibration: bgCalibration
    };
  }, [bgImage.imageUrl, bgImage.visible, bgImage.opacity, bgCalibration]);

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
  else {
    localStorage.removeItem('shipLogLastLoadedMapUrl');
  }
}, [appState.lastLoadedMapUrl]);

  const getNodeNotes = useMemo(() => createGetNodeNotes(graphData.notes), [graphData.notes]);
  const getEdgeNotes = useMemo(() => createGetEdgeNotes(graphData.notes), [graphData.notes]);

  /** ---------- render ---------- **/
  return (
      <div className="App">
        <HashtagSearchBar
          nodes={graphData.nodes}  // ✅ Use graphData.nodes
          edges={graphData.edges}  // ✅ Use graphData.edges
          getNodeNotes={getNodeNotes}  // ✅ Extract notes for nodes
          getEdgeNotes={getEdgeNotes}  // ✅ Extract notes for edges
          getCy={getCytoscapeInstance}  // ✅ Use the existing hook function
        />

        {/* Mobile Search Button - only visible on mobile, top center */}
        <div className={`fixed top-0 left-0 right-0 z-999 pa2 dn-m dn-l tc w-100 ${isOpen ? 'dn' : ''}`}>
            <div className="dib">
              <MobileSearchButton />
            </div>
        </div>

        {/* Background image underlay - DISABLED: Now integrated into Cytoscape canvas */}
        {/* Background now renders as a Cytoscape node for perfect sync with pan/zoom */}
        {/* See CytoscapeGraph bgImage prop and bgNodeAdapter.js */}

        {canEdit && (
          <GraphControls
            selectedNodes={selectedNodeIds}
            selectedEdges={selectedEdgeIds}
            onCreateNode={graphOps.handleCreateNode}
            onDeleteSelectedNodes={graphOps.handleDeleteSelectedNodes}
            onDeleteSelectedEdges={graphOps.handleDeleteSelectedEdges}
            onEditSelected={handleEditSelected}
            onConnectNodes={graphOps.handleConnectSelectedNodes}
            onExportMap={() => exportGraphToJson(exportNodePositions)}
            onNewMap={handleNewMap}
            onNodeColorChange={graphOps.handleNodeColorChange}
            areNodesConnected={areNodesConnected}
            mode={mode}
            collapsed={graphControlsCollapsed}
            onToggleCollapsed={toggleGraphControls}
            onOpenDebugModal={DEV_MODE ? modalOps.openDebugModal : undefined}
            onOpenShareModal={modalOps.openShareModal}
            onUndo={handleUndo}
            canUndo={canUndo}
            onRotateCompass={graphOps.handleRotateRight}
            onOpenBgImageModal={openBgImageModal}
          />
        )}

        <UniversalControls
          fileInputRef={fileInputRef}
          onImportFile={handleFileSelect}
          onFitToView={graphOps.handleFitGraph}
          onModeToggle={canEdit ? handleModeToggle : undefined}
          mode={mode}
          showNoteCountOverlay={showNoteCountOverlay}
          onToggleNoteCountOverlay={handleToggleNoteCountOverlay}
          onRotateNodesAndCompass={graphOps.handleRotateNodesAndMap}
          orientation={orientation}
          compassVisible={compassVisible}
          onToggleCompass={handleToggleCompass}
          collapsed={universalMenuCollapsed}
          onToggleCollapsed={toggleUniversalMenu}
          cdnBaseUrl={cdnBaseUrl}
          onLoadFromCdn={handleLoadFromCdnButton}
          bgImage={bgImage}
          onToggleBgImageVisible={toggleBgImageVisible}
          onClearVisited={handleClearVisited}
          onOpenHelpModal={modalOps.openHelpModal}
          onOpenReadingModal={openReadingModal}
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
          shouldTypewriter={typewriterEnabled && typewriterRef.current}
          shouldShowText={!typewriterRef.current || typewriterEnabled}
          shouldMountTypewriter={shouldMountTypewriter}
        />

        <HelpModal
          isOpen={modalOps.isHelpOpen}
          onClose={modalOps.closeHelpModal}
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

        <ReadingModal
          isOpen={readingModalOpen}
          onClose={closeReadingModal}
          nodes={graphData.nodes}
          notes={graphData.notes}
          cdnBaseUrl={cdnBaseUrl}
          mapName={mapName}
          getCy={getCytoscapeInstance}
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
            <div 
              className="spinner"
              style={{
                width: '20px',
                height: '20px',
                border: '2px solid #fff',
                borderTop: '2px solid transparent',
              borderRadius: '50%',
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
          onNodeMove={graphOps.handleNodeMove}
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
          onEdgeDirectionChange={graphOps.handleEdgeDirectionChange}
          onDeleteSelectedNodes={graphOps.handleDeleteSelectedNodes}
          onDeleteSelectedEdges={graphOps.handleDeleteSelectedEdges}
          onNodeSizeChange={graphOps.handleNodeSizeChange}
          onNodeColorChange={graphOps.handleNodeColorChange}
          onBackgroundClick={handleBackgroundClick}
          onCytoscapeInstanceReady={setCytoscapeInstance}
          showNoteCountOverlay={showNoteCountOverlay}
          notes={memoNotes}
          visited={visited} /* pass visited to drive unseen badges */
          bgImage={memoBgImage}
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