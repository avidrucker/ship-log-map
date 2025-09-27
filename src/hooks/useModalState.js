// src/hooks/useModalState.js

import { useCallback, useMemo, useState } from 'react';
import { ACTION_TYPES } from '../appStateReducer';

/**
 * Modal state helper hook
 *
 * Notes
 * - Uses reducer-backed state (note editor/viewer, debug)
 * - Keeps "Share" modal as local state (no reducer changes required)
 * - Optionally integrates background image modal toggles from parent
 *
 * @param {Function} dispatchAppState - reducer dispatch
 * @param {Object} appState - current reducer state
 * @param {Object} [opts]
 * @param {Function} [opts.openBgImageModal] - from useBgImageState()
 * @param {Function} [opts.closeBgImageModal] - from useBgImageState()
 */
export function useModalState(dispatchAppState, appState, opts = {}) {
  const { openBgImageModal, closeBgImageModal, bgImageModalOpen } = opts;

  // Local-only Share modal (no reducer coupling)
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const openShareModal = useCallback(() => setShareModalOpen(true), []);
  const closeShareModal = useCallback(() => setShareModalOpen(false), []);
  const toggleShareModal = useCallback(
    () => setShareModalOpen((v) => !v),
    []
  );

  // Reducer-backed modals
  const openDebugModal = useCallback(
    () => dispatchAppState({ type: ACTION_TYPES.OPEN_DEBUG_MODAL }),
    [dispatchAppState]
  );
  const closeDebugModal = useCallback(
    () => dispatchAppState({ type: ACTION_TYPES.CLOSE_DEBUG_MODAL }),
    [dispatchAppState]
  );

  const openNoteEditor = useCallback(
    (targetId, targetType = 'node') =>
      dispatchAppState({
        type: ACTION_TYPES.START_NOTE_EDITING,
        payload: { targetId, targetType },
      }),
    [dispatchAppState]
  );
  const closeNoteEditor = useCallback(
    () => dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_EDITING }),
    [dispatchAppState]
  );

  const openNoteViewer = useCallback(
    (targetId) =>
      dispatchAppState({
        type: ACTION_TYPES.START_NOTE_VIEWING,
        payload: { targetId },
      }),
    [dispatchAppState]
  );
  const closeNoteViewer = useCallback(
    () => dispatchAppState({ type: ACTION_TYPES.CLOSE_NOTE_VIEWING }),
    [dispatchAppState]
  );

  // Derived state
  const isDebugOpen = !!appState?.selections?.debugModal?.isOpen;
  const isNoteEditorOpen = !!appState?.selections?.noteEditing?.targetId;
  const isNoteViewerOpen = !!appState?.selections?.noteViewing?.targetId;

  const isAnyModalOpen = useMemo(() => {
    const anyReducerModal = isDebugOpen || isNoteEditorOpen || isNoteViewerOpen;
    const bgModalOpen = !!bgImageModalOpen; // Use the passed bg modal state
    return anyReducerModal || bgModalOpen || isShareModalOpen;
  }, [isDebugOpen, isNoteEditorOpen, isNoteViewerOpen, isShareModalOpen, bgImageModalOpen]);

  const closeAllModals = useCallback(() => {
    if (isDebugOpen) closeDebugModal();
    if (isNoteEditorOpen) closeNoteEditor();
    if (isNoteViewerOpen) closeNoteViewer();
    if (isShareModalOpen) closeShareModal();
    if (bgImageModalOpen && typeof closeBgImageModal === 'function') closeBgImageModal();
  }, [
    isDebugOpen,
    isNoteEditorOpen,
    isNoteViewerOpen,
    isShareModalOpen,
    bgImageModalOpen, // Add this dependency
    closeDebugModal,
    closeNoteEditor,
    closeNoteViewer,
    closeShareModal,
    closeBgImageModal,
  ]);

  const toggleBgImageModal = useCallback(() => {
    if (!openBgImageModal || !closeBgImageModal) return;
    // The BG modal open state is owned by useBgImageState; we don't read it here.
    openBgImageModal();
  }, [openBgImageModal, closeBgImageModal]);

  return {
    // share (local)
    isShareModalOpen,
    openShareModal,
    closeShareModal,
    toggleShareModal,

    // debug (reducer)
    isDebugOpen,
    openDebugModal,
    closeDebugModal,

    // note editor/viewer (reducer)
    isNoteEditorOpen,
    isNoteViewerOpen,
    openNoteEditor,
    closeNoteEditor,
    openNoteViewer,
    closeNoteViewer,

    // bg modal (delegated)
    toggleBgImageModal,

    // global helpers
    isAnyModalOpen,
    closeAllModals,
  };
}