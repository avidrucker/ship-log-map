// src/hooks/useCamera.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_TYPES } from '../appStateReducer';
import { printDebug } from '../utils/debug';

/**
 * useCamera — real-time camera streaming + debounced reducer commits.
 * 
 * - livePan/liveZoom: update each animation frame for the BG layer.
 * - onZoomChange/onCameraMove: debounced commits to reducer (no thrash).
 * - onViewportChange: rAF stream receiver from CytoscapeGraph.
 */
export function useCamera(dispatch, appState, { commitDelay = 300 } = {}) {
  const { camera } = appState;

  // Per-frame values for BG image (don't go through reducer)
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

  // rAF-per-frame viewport stream (from CytoscapeGraph)
  const rafPending = useRef(false);
  const latest = useRef({ pan: { x: livePan.x, y: livePan.y }, zoom: liveZoom });
  
  const onViewportChange = useCallback(({ pan, zoom }) => {
    // Store latest; clone pan (Cytoscape returns a mutable object)
    latest.current = { zoom, pan: { x: pan.x, y: pan.y } };
    
    // Use rAF to throttle to one update per frame max
    if (rafPending.current) return;
    rafPending.current = true;

    requestAnimationFrame(() => {
      rafPending.current = false;
      const { zoom: z, pan: p } = latest.current;

      // Always update live state immediately - this is the source of truth for smooth visuals
      setLiveZoom(z);
      setLivePan({ x: p.x, y: p.y });
      
      // Commit to reducer for persistence (debounced)
      commitZoom(z);
      commitPan(p);
    });
  }, [commitZoom, commitPan]);

  // Remove the classic debounced commits - viewport stream handles everything now
  // const onZoomChange = useCallback((z) => {
  //   // Deprecated - viewport stream handles this
  //   console.warn('onZoomChange is deprecated - use viewport stream');
  // }, []);

  // const onCameraMove = useCallback((p) => {
  //   // Deprecated - viewport stream handles this
  //   console.warn('onCameraMove is deprecated - use viewport stream');
  // }, []);

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