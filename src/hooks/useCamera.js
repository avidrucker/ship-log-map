// src/hooks/useCamera.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_TYPES } from '../appStateReducer';
import { printDebug } from '../utils/debug';

/**
 * useCamera — real-time camera streaming + debounced reducer commits
 *
 * - livePan/liveZoom update every frame for BgImageLayer (no blip).
 * - commitPan/commitZoom (debounced) keep appState.camera persisted.
 */
export function useCamera(dispatch, appState, { commitDelay = 60 } = {}) {
  const { camera } = appState;

  // Live state for UI that must update every frame (BgImageLayer).
  const [liveZoom, setLiveZoom] = useState(camera.zoom);
  const [livePan, setLivePan] = useState(camera.position);

  // Track whether the user is actively interacting (wheel/drag). While "hot",
  // we do NOT let reducer commits clobber live state.
  const interactingUntil = useRef(0);
  const markInteracting = useCallback(() => { interactingUntil.current = Date.now() + 160; }, []);
  const isInteracting = () => Date.now() < interactingUntil.current;

  // Keep live in sync if reducer changes (e.g., fit, load) — BUT NOT during interaction.
  useEffect(() => {
    if (!isInteracting()) setLiveZoom(camera.zoom);
  }, [camera.zoom]);
  useEffect(() => {
    if (!isInteracting()) setLivePan(camera.position);
  }, [camera.position]);

  // Debounced commits into reducer (avoid render storms during drag/zoom).
  const zoomT = useRef(null);
  const panT = useRef(null);
  const latest = useRef({ pan: camera.position, zoom: camera.zoom });

  const commitZoom = useCallback((z) => {
    clearTimeout(zoomT.current);
    zoomT.current = setTimeout(() => {
      const val = latest.current.zoom;
      printDebug(`🎥 commit SET_ZOOM ${val}`);
      dispatch({ type: ACTION_TYPES.SET_ZOOM, payload: { zoom: val } });
    }, commitDelay);
  }, [dispatch, commitDelay]);

  const commitPan = useCallback(() => {
    clearTimeout(panT.current);
    panT.current = setTimeout(() => {
      const val = latest.current.pan;
      printDebug(`🎥 commit SET_CAMERA_POSITION (${Math.round(val.x)}, ${Math.round(val.y)})`);
      dispatch({ type: ACTION_TYPES.SET_CAMERA_POSITION, payload: { position: val } });
    }, commitDelay);
  }, [dispatch, commitDelay]);

  // Handlers passed to CytoscapeGraph (existing props)
  const onZoomChange = useCallback((z) => {
    // Coarse event: do NOT set live here; rAF stream owns live values.
    latest.current.zoom = z;
    commitZoom(z);
  }, [commitZoom]);

  const onCameraMove = useCallback((p) => {
    // Coarse event: do NOT set live here; rAF stream owns live values.
    latest.current.pan = p;
    commitPan(p);
  }, [commitPan]);

  // NEW: per-frame (rAF) viewport stream from Cytoscape
  const rafPending = useRef(false);

  const onViewportChange = useCallback(({ pan, zoom }) => {
    latest.current = { pan, zoom };
    markInteracting();
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      // During interaction, rAF drives live state; after it ends, reducer sync kicks in.
      setLiveZoom(prev => (prev === latest.current.zoom ? prev : latest.current.zoom));
      setLivePan(prev =>
        (prev.x === latest.current.pan.x && prev.y === latest.current.pan.y) ? prev : latest.current.pan
      );
    });
  }, [markInteracting]);

  // Cleanup timeouts on unmount
  useEffect(() => () => {
    clearTimeout(zoomT.current);
    clearTimeout(panT.current);
  }, []);

  return {
    livePan,
    liveZoom,
    onZoomChange,
    onCameraMove,
    onViewportChange
  };
}
