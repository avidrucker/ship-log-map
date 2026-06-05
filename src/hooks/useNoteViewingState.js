import { useState, useCallback, useRef } from 'react';
import { ACTION_TYPES } from '../appStateReducer.js';

// State machine for the note-viewer lifecycle.
//
// open(nodeId)  — opens or switches target. If already open, it's a switch:
//                 fitToNode fires, camera is NOT restored, flag clears after zoom.
// close()       — genuine close: restores camera, clears selections. No-op if
//                 already closed, closing, or a switch is mid-transition.
// forceReset()  — hard-clears all flags (use on same-node re-tap, escape, etc.)
//
// Callbacks give callers hooks into transitions without coupling the machine to
// App-specific concerns (visited state, typewriter sessions, mode checks):
//   onBeforeOpen(nodeId, sessionId, targetType, switching)
//   onZoomComplete(nodeId, sessionId)
//   onClose(nodeId)
//
// fitToNode may return a Promise (async zoom) or void (sync / no-op).
// When sync, the switching flag clears immediately so a subsequent close()
// correctly restores camera.

export function useNoteViewingState({
  dispatchAppState,
  fitToNode,
  restoreCamera,
  clearSelections = () => {},
  onBeforeOpen = null,
  onZoomComplete = null,
  onClose = null,
}) {
  const [activeNodeId, setActiveNodeId] = useState(null);
  const isSwitchingRef = useRef(false);
  const isClosingRef = useRef(false);
  const isTransitioningRef = useRef(false);

  const open = useCallback((nodeId, targetType) => {
    const switching = activeNodeId !== null && activeNodeId !== nodeId;
    const sessionId = Symbol('view-session');

    if (onBeforeOpen) onBeforeOpen(nodeId, sessionId, targetType, switching);

    setActiveNodeId(nodeId);
    dispatchAppState({ type: ACTION_TYPES.START_NOTE_VIEWING, payload: { targetId: nodeId, targetType } });

    const result = fitToNode(nodeId);
    const isAsync = result != null && typeof result.finally === 'function';

    if (switching) {
      isSwitchingRef.current = true;
      // Only guard close() with the transition flag for async zoom — if fitToNode
      // is sync (or void), there is no animation race to protect against.
      if (isAsync) {
        isTransitioningRef.current = true;
        setTimeout(() => { isTransitioningRef.current = false; }, 100);
      }
    }

    const afterZoom = () => {
      if (onZoomComplete) onZoomComplete(nodeId, sessionId);
      if (switching) isSwitchingRef.current = false;
    };

    if (isAsync) {
      result.finally(() => setTimeout(afterZoom, 100));
    } else {
      afterZoom();
    }
  }, [activeNodeId, dispatchAppState, fitToNode, onBeforeOpen, onZoomComplete]);

  const close = useCallback(() => {
    if (activeNodeId === null) return;
    if (isClosingRef.current || isTransitioningRef.current) return;
    isClosingRef.current = true;

    const wasTarget = activeNodeId;
    try {
      if (!isSwitchingRef.current) {
        restoreCamera();
        clearSelections();
      }
      dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_VIEWING });
      if (onClose) onClose(wasTarget);
      setActiveNodeId(null);
    } finally {
      setTimeout(() => { isClosingRef.current = false; }, 0);
      isSwitchingRef.current = false;
    }
  }, [activeNodeId, restoreCamera, clearSelections, dispatchAppState, onClose]);

  const forceReset = useCallback(() => {
    isSwitchingRef.current = false;
    isClosingRef.current = false;
    isTransitioningRef.current = false;
  }, []);

  return {
    open,
    close,
    forceReset,
    isOpen: activeNodeId !== null,
    activeNodeId,
  };
}
