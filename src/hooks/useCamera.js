// src/hooks/useCamera.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_TYPES } from '../appStateReducer';
import { printDebug } from '../utils/debug';

/**
 * useCamera — real-time camera streaming + debounced reducer commits.
 * 
 * - livePan/liveZoom: reactive state that updates when camera moves
 * - onZoomChange/onCameraMove: debounced commits to reducer (no thrash).
 * - onViewportChange: debounced stream receiver from CytoscapeGraph.
 */
export function useCamera(dispatch, appState, { commitDelay = 300 } = {}) {
  const { camera } = appState;

  // ✅ FIX: Use reactive state instead of refs for live values
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

  // ✅ FIX: Debounced viewport stream (from CytoscapeGraph)
  const updateTimeoutRef = useRef(null);
  
  const onViewportChange = useCallback(({ pan, zoom }) => {
    // Clear any pending update
    clearTimeout(updateTimeoutRef.current);
    
    // Debounce the state update to reduce React renders
    updateTimeoutRef.current = setTimeout(() => {
      // Update reactive state (triggers React renders and useEffect dependencies)
      setLiveZoom(zoom);
      setLivePan({ x: pan.x, y: pan.y });
      
      // Also commit to reducer for persistence (debounced)
      commitZoom(zoom);
      commitPan({ x: pan.x, y: pan.y });
    }, 100); // 100ms debounce - only update after user stops panning/zooming
  }, [commitZoom, commitPan]);

  // Cleanup
  useEffect(() => () => {
    clearTimeout(zoomT.current);
    clearTimeout(panT.current);
    clearTimeout(updateTimeoutRef.current);
  }, []);

  // ✅ FIX: Return reactive state values, not getters
  return {
    livePan,      // Reactive state - triggers useEffect dependencies
    liveZoom,     // Reactive state - triggers useEffect dependencies
    onViewportChange
  };
}