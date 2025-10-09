// src/hooks/useCamera.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_TYPES } from '../appStateReducer';
import { printDebug } from '../utils/debug';

/**
 * useCamera — real-time camera streaming + debounced reducer commits.
 * 
 * - livePan/liveZoom: immediate updates for any consumers that need current camera state
 * - onZoomChange/onCameraMove: debounced commits to reducer (no thrash)
 * - onViewportChange: immediate stream receiver from CytoscapeGraph
 */
export function useCamera(dispatch, appState, { commitDelay = 0 } = {}) {
  const { camera } = appState;

  // Current values for any consumers that need camera state
  const [liveZoom, setLiveZoom] = useState(camera.zoom ?? 1);
  const [livePan, setLivePan] = useState({
    x: camera.position?.x ?? 0,
    y: camera.position?.y ?? 0
  });

  // Debounced reducer commits (for persistence & camera info panel only)
  const zoomT = useRef(null);
  const panT = useRef(null);

  // Store commitDelay in ref to avoid recreating callbacks
  const commitDelayRef = useRef(commitDelay);
  commitDelayRef.current = commitDelay;

  const commitZoom = useCallback((z) => {
    clearTimeout(zoomT.current);
    zoomT.current = setTimeout(() => {
      printDebug(`🎥 commit SET_ZOOM_EXTERNAL ${z}`);
      dispatch({ type: ACTION_TYPES.SET_ZOOM_EXTERNAL, payload: { zoom: z } });
    }, commitDelayRef.current);
  }, [dispatch]);

  const commitPan = useCallback((p) => {
    clearTimeout(panT.current);
    const clone = { x: p.x, y: p.y };
    panT.current = setTimeout(() => {
      printDebug(`🎥 commit SET_CAMERA_POSITION_EXTERNAL (${Math.round(clone.x)}, ${Math.round(clone.y)})`);
      dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION_EXTERNAL, payload: { position: clone } });
    }, commitDelayRef.current);
  }, [dispatch]);

  // Immediate viewport stream (from CytoscapeGraph) - NO MORE RAF
  const latest = useRef({ pan: { x: livePan.x, y: livePan.y }, zoom: liveZoom });
  
  const onViewportChange = useCallback(({ pan, zoom }) => {
    // Check for meaningful changes before doing anything
    const ZOOM_THRESHOLD = 0.0001;
    const PAN_THRESHOLD = 0.1;
    
    const currentZoom = latest.current.zoom;
    const currentPan = latest.current.pan;
    
    const zoomChanged = Math.abs(currentZoom - zoom) > ZOOM_THRESHOLD;
    const panChanged = Math.abs(currentPan.x - pan.x) > PAN_THRESHOLD || 
                      Math.abs(currentPan.y - pan.y) > PAN_THRESHOLD;
    
    if (!zoomChanged && !panChanged) {
      // No meaningful change - don't update anything
      printDebug(`🎥 Ignoring viewport event - no meaningful change (zoom Δ=${Math.abs(currentZoom - zoom).toFixed(6)}, pan Δ=${Math.abs(currentPan.x - pan.x).toFixed(2)},${Math.abs(currentPan.y - pan.y).toFixed(2)})`);
      return;
    }
    
    printDebug(`🎥 Meaningful camera change detected - zoom Δ=${Math.abs(currentZoom - zoom).toFixed(6)}, pan Δ=${Math.abs(currentPan.x - pan.x).toFixed(2)},${Math.abs(currentPan.y - pan.y).toFixed(2)}`);
    
    // Store latest values (clone pan since Cytoscape returns mutable object)
    latest.current = { zoom, pan: { x: pan.x, y: pan.y } };

    // *** REMOVED RAF - Update state immediately ***
    setLiveZoom(zoom);
    setLivePan({ x: pan.x, y: pan.y });
    
    // Commit to reducer for persistence (still debounced)
    commitZoom(zoom);
    commitPan({ x: pan.x, y: pan.y });
  }, [commitZoom, commitPan]);

  // Cleanup
  useEffect(() => () => {
    clearTimeout(zoomT.current);
    clearTimeout(panT.current);
  }, []);

  return {
    livePan,
    liveZoom,
    onViewportChange  // main interface
  };
}