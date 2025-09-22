// src/hooks/useImportExport.js
import { useCallback } from 'react';
import { loadAndValidateRumorMapFromFile } from '../rumorMapValidation';
import { serializeGraph } from '../graph/ops.js';
import { dataUrlOrBlobToWebpDataUrl } from '../utils/imageUtils.js';
import { loadImageWithFallback } from '../utils/imageLoader.js';
import { ACTION_TYPES } from '../appStateReducer.js';
import { printDebug } from '../utils/debug.js';
import { clearQueryParams } from '../utils/cdnHelpers.js';

/**
 * Custom hook for import/export operations
 * @param {Object} params - Parameters object
 * @param {Function} params.dispatch - State dispatch function
 * @param {Object} params.graph - Current graph data
 * @param {Function} params.setBgImage - Background image setter from useBgImageState
 * @param {Function} params.clearUndoState - Undo state clearer
 * @param {Function} params.onOpenShareModal - Share modal opener from useModalState
 * @param {Function} params.setGraphData - Graph data setter
 * @param {Function} params.clearCytoscapeSelections - Cytoscape selection clearer
 * @param {Object} params.defaultShipLogData - Default map data for coord hydration
 * @param {Function} params.getCanEditFromQuery - Function to check edit permissions
 * @param {Function} params.hasAnyQueryParams - Function to check for query params
 * @returns {Object} Import/export operation functions
 */
export function useImportExport({
  dispatch,
  graph,
  setBgImage,
  clearUndoState,
  onOpenShareModal,
  setGraphData,
  clearCytoscapeSelections,
  defaultShipLogData,
  getCanEditFromQuery,
  hasAnyQueryParams
}) {
  // Helper function to normalize graph data (moved from App.jsx)
  const normalizeGraphData = useCallback((data) => {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = Array.isArray(data?.edges) ? data.edges : [];
    const notes = data?.notes && typeof data.notes === "object" ? data.notes : {};
    const mode = typeof data?.mode === "string" ? data.mode : "editing";
    const mapName = typeof data?.mapName === "string" ? data.mapName : "default_map";
    const cdnBaseUrl = typeof data?.cdnBaseUrl === "string" ? data.cdnBaseUrl : "";
    const orientation = Number.isFinite(data?.orientation) ? ((data.orientation % 360) + 360) % 360 : 0;
    const compassVisible = typeof data?.compassVisible === 'boolean' ? data.compassVisible : true;

    const bgImage = data && typeof data.bgImage === 'object' && data.bgImage !== null
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
        originalImageUrl: n.originalImageUrl || imageUrl
      };
    });

    const normEdges = edges.map(e => ({
      id: e.id || `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      direction: e.direction ?? "forward"
    }));

    return { nodes: normNodes, edges: normEdges, notes, mode, mapName, cdnBaseUrl, orientation, compassVisible, bgImage };
  }, []);

  // Helper function to hydrate coordinates if missing (moved from App.jsx)
  const hydrateCoordsIfMissing = useCallback((graph, defaultGraph) => {
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
  }, []);

  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    dispatch({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });

    try {
      const result = await loadAndValidateRumorMapFromFile(file);
      if (result.isValid) {
        // normalize, hydrate coords, persist
        const g1 = normalizeGraphData(result.data);
        const g2 = hydrateCoordsIfMissing(g1, defaultShipLogData);
        
        // Decide effective mode from URL policy
        const canEditNow = getCanEditFromQuery() || !hasAnyQueryParams();
        const importedMode = (typeof g1.mode === 'string') ? g1.mode : 'editing';
        const effectiveMode = canEditNow ? importedMode : 'playing';
        
        setGraphData({ ...g2, mode: effectiveMode });
        dispatch({ type: ACTION_TYPES.SET_MODE, payload: { mode: effectiveMode } });

        // Set map name if it's included in the imported data
        if (typeof g1.mapName === 'string') {
          dispatch({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: g1.mapName } });
        }

        // Set CDN base URL if it's included in the imported data (even if empty string)
        if (typeof g1.cdnBaseUrl === 'string') {
          dispatch({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: g1.cdnBaseUrl } });
        }
        
        if (typeof g1.orientation === 'number') {
          dispatch({ type: ACTION_TYPES.SET_ORIENTATION, payload: { orientation: g1.orientation } });
        }
        
        if (typeof g1.compassVisible === 'boolean') {
          dispatch({ type: ACTION_TYPES.SET_COMPASS_VISIBLE, payload: { visible: g1.compassVisible } });
        }

        // Load background image if needed
        if (typeof g1.bgImage === 'object' && g1.bgImage !== null) {
          let bgImageToSet = { ...g1.bgImage };
          bgImageToSet.included = !!bgImageToSet.imageUrl;
          
          printDebug(`useImportExport: Attempting to load background image ${bgImageToSet.imageUrl ? 'from URL' : 'as empty'} for map ${g1.mapName}`);
          
          if (bgImageToSet.included) {
            try {
              printDebug("🖼️ FILE LOAD: Attempting to load BG image:", bgImageToSet.imageUrl);

              // Load full size image (no cache, no thumb)
              const rawDataUrl = await loadImageWithFallback(
                bgImageToSet.imageUrl,
                g1.mapName,
                g1.cdnBaseUrl || graph.cdnBaseUrl,
                { fullSize: true }
              );

              // Convert to WebP and clamp size to 2048px
              const webpDataUrl = await dataUrlOrBlobToWebpDataUrl(rawDataUrl, 2048, 0.82);

              bgImageToSet = { ...bgImageToSet, imageUrl: webpDataUrl, included: true };
              printDebug("FILE LOAD: Loaded BG image dataUrl:", webpDataUrl);
            } catch {
              printDebug("FILE LOAD: Failed to load BG image, setting to empty.");
              bgImageToSet = { ...bgImageToSet, imageUrl: "", included: false };
            }
          } else {
            printDebug('useImportExport: No background image URL provided, setting to empty.');
            bgImageToSet = { ...bgImageToSet, imageUrl: "" };
          }
          
          setBgImage(bgImageToSet);
          dispatch({ type: ACTION_TYPES.SET_BG_IMAGE, payload: { bgImage: bgImageToSet } });
        } else {
          printDebug('useImportExport: No background image URL provided, skipping load.');
        }

        // Reset camera + fit
        printDebug("useImportExport: Internally resetting camera due to file load");
        dispatch({ type: ACTION_TYPES.SET_ZOOM_INTERNAL, payload: { zoom: 1 } });
        dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION_INTERNAL, payload: { position: { x: 0, y: 0 } } });
        setTimeout(() => {
          dispatch({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });
        }, 150);
        
        // Clear selections and undo state (loading clears undo)
        clearCytoscapeSelections();
        dispatch({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
        clearUndoState();
      } else {
        printDebug('useImportExport: File load errors:', result.errors);
        dispatch({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: 'Invalid map file: ' + result.errors.join('; ') } });
      }
    } catch (error) {
      console.error('useImportExport: Failed to load file:', error);
      dispatch({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: 'Failed to load file: ' + error.message } });
    }

    // Clear the input so the same file can be selected again
    event.target.value = '';
  }, [
    dispatch, 
    normalizeGraphData, 
    hydrateCoordsIfMissing, 
    defaultShipLogData, 
    getCanEditFromQuery, 
    hasAnyQueryParams, 
    setGraphData, 
    setBgImage, 
    clearCytoscapeSelections, 
    clearUndoState,
    graph.cdnBaseUrl
  ]);

  const handleNewMap = useCallback(() => {
    // Check if there are any nodes in the current map
    if (graph.nodes.length > 0) {
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
      mode: graph.mode // preserve current mode
    });

    // Reset map name and CDN URL for new map
    dispatch({ type: ACTION_TYPES.SET_MAP_NAME, payload: { mapName: 'default_map' } });
    dispatch({ type: ACTION_TYPES.SET_CDN_BASE_URL, payload: { cdnBaseUrl: '' } });

    dispatch({ type: ACTION_TYPES.SET_LAST_LOADED_MAP_URL, payload: { mapUrl: '' } });

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
    dispatch({ type: ACTION_TYPES.SET_BG_IMAGE, payload: { bgImage: emptyBgImage } });

    // Camera reset - update both app state and Cytoscape instance
    printDebug("useImportExport handleNewMap: Resetting camera for new map");
    dispatch({ type: ACTION_TYPES.SET_ZOOM_EXTERNAL, payload: { zoom: 1 } });
    dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION_EXTERNAL, payload: { position: { x: 0, y: 0 } } });
    setTimeout(() => {
      dispatch({ type: ACTION_TYPES.SET_SHOULD_FIT, payload: { shouldFit: true } });
    }, 150);
    
    // Clear errors & selections and undo state (new map clears undo)
    dispatch({ type: ACTION_TYPES.SET_LOAD_ERROR, payload: { error: null } });
    clearCytoscapeSelections();
    dispatch({ type: ACTION_TYPES.CLEAR_ALL_SELECTIONS });
    clearUndoState();
    
    // Clear query params from the browser address bar
    clearQueryParams();
  }, [graph.nodes.length, graph.mode, setGraphData, dispatch, setBgImage, clearCytoscapeSelections, clearUndoState]);

  const exportGraphToJson = useCallback((exportNodePositions) => {
    // Get latest positions from Cytoscape (if available)
    const positions = exportNodePositions ? exportNodePositions() : [];
    const updatedNodes = positions.length
      ? positions.map(pos => ({
          ...graph.nodes.find(n => n.id === pos.id),
          x: pos.x, y: pos.y
        }))
      : graph.nodes;

    // Only export filename for bgImage if it's a data URL
    let exportedBgImage = { ...graph.bgImage };
    if (exportedBgImage.imageUrl && exportedBgImage.imageUrl.startsWith("data:image/")) {
      // Determine extension from data URL
      if (exportedBgImage.imageUrl.startsWith("data:image/jpeg")) {
        exportedBgImage.imageUrl = "underlay.jpeg";
      } else if (exportedBgImage.imageUrl.startsWith("data:image/jpg")) {
        exportedBgImage.imageUrl = "underlay.jpg";
      } else if (exportedBgImage.imageUrl.startsWith("data:image/png")) {
        exportedBgImage.imageUrl = "underlay.png";
      } else if (exportedBgImage.imageUrl.startsWith("data:image/webp")) {
        exportedBgImage.imageUrl = "underlay.webp";
      } else {
        printDebug("⚠️ useImportExport: Background image is not a recognized data URL, exporting anyway");
        printDebug(`exportedBgImage.imageUrl: ${exportedBgImage.imageUrl}`);
        exportedBgImage = { ...exportedBgImage, included: false, imageUrl: "" };
      }
    }

    const updatedGraph = {
      ...graph,
      nodes: updatedNodes,
      bgImage: exportedBgImage
    };

    // Generate filename from map name: lowercase, spaces to underscores
    const sanitizedMapName = graph.mapName
      .toLowerCase()
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/[^a-z0-9_-]/g, '') // Remove any non-alphanumeric characters except underscores and hyphens
      || 'untitled_map'; // fallback if map name is empty or becomes empty after sanitization
    
    const filename = sanitizedMapName + '.json';
    const json = serializeGraph(updatedGraph);
    
    // Trigger download
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return json;
  }, [graph]);

  const openShareModalWithCurrentState = useCallback(() => {
    onOpenShareModal?.(); // Modal reads current serialized URL/state
  }, [onOpenShareModal]);

  return { 
    handleFileSelect, 
    handleNewMap, 
    exportGraphToJson, 
    openShareModalWithCurrentState 
  };
}