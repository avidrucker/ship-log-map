// src/hooks/useCamera.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_TYPES } from '../appStateReducer';
import { printDebug } from '../utils/debug';

/**
 * useCamera — real-time camera streaming + debounced reducer commits
 *
 * - livePan/liveZoom: per-frame values for BgImageLayer (smooth, no jitter).
 * - commitPan/commitZoom: debounced commits into reducer/persistence.
 */
export function useCamera(dispatch, appState, { commitDelay = 60 } = {}) {
  const { camera } = appState;

  // Live state for BG layer (avoid reducer thrash)
  const [liveZoom, setLiveZoom] = useState(camera.zoom);
  const [livePan, setLivePan] = useState({
    x: camera.position?.x ?? 0,
    y: camera.position?.y ?? 0
  });

  // Keep live state in sync if reducer changes (fit, load, etc)
  useEffect(() => { setLiveZoom(camera.zoom); }, [camera.zoom]);
  useEffect(() => { setLivePan({ x: camera.position?.x ?? 0, y: camera.position?.y ?? 0 }); }, [camera.position?.x, camera.position?.y]);

  // --- Debounced commits to reducer (persistence) ---
  const zoomT = useRef(null);
  const panT  = useRef(null);

  const commitZoom = useCallback((z) => {
    clearTimeout(zoomT.current);
    zoomT.current = setTimeout(() => {
      printDebug(`🎥 commit SET_ZOOM ${z}`);
      dispatch({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: z } });
    }, commitDelay);
  }, [dispatch, commitDelay]);

  const commitPan = useCallback((p) => {
    clearTimeout(panT.current);
    const clone = { x: p.x, y: p.y };
    panT.current = setTimeout(() => {
      printDebug(`🎥 commit SET_CAMERA_POSITION (${Math.round(clone.x)}, ${Math.round(clone.y)})`);
      dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: clone } });
    }, commitDelay);
  }, [dispatch, commitDelay]);

  // --- Every-frame viewport stream from CytoscapeGraph ---
  const rafPending = useRef(false);
  const latest = useRef({ pan: { x: livePan.x, y: livePan.y }, zoom: liveZoom });

  const onViewportChange = useCallback(({ pan, zoom }) => {
    // record latest values (pan may be a mutable object from cy, so don't keep it)
    latest.current = { zoom, pan: { x: pan.x, y: pan.y } };

    if (rafPending.current) return;
    rafPending.current = true;

    requestAnimationFrame(() => {
      rafPending.current = false;
      const { zoom: z, pan: p } = latest.current;

      // Only update if changed (avoid redundant renders)
      if (Math.abs(z - liveZoom) > 1e-4) setLiveZoom(z);
      if (p.x !== livePan.x || p.y !== livePan.y) setLivePan({ x: p.x, y: p.y });
    });
  }, [liveZoom, livePan.x, livePan.y]);

  // Optional: also accept “classic” change events (debounced commits)
  const onZoomChange = useCallback((z) => {
    // live update for safety (e.g. if render stream is paused), but guard equality
    if (Math.abs(z - liveZoom) > 1e-4) setLiveZoom(z);
    commitZoom(z);
  }, [commitZoom, liveZoom]);

  const onCameraMove = useCallback((p) => {
    // clone to ensure a new reference for React
    if (p.x !== livePan.x || p.y !== livePan.y) setLivePan({ x: p.x, y: p.y });
    commitPan(p);
  }, [commitPan, livePan.x, livePan.y]);

  // Cleanup
  useEffect(() => () => {
    clearTimeout(zoomT.current);
    clearTimeout(panT.current);
  }, []);

  return {
    livePan,
    liveZoom,
    onZoomChange,      // debounced reducer commit
    onCameraMove,      // debounced reducer commit
    onViewportChange   // per-frame stream (BG uses this)
  };
}
