import { useCallback } from 'react';

/**
 * Custom hook for managing modal states
 * @param {Function} dispatch - State dispatch function
 * @param {Object} state - Current app state
 * @returns {Object} Modal state management functions
 */
export function useModalState(dispatch, state) {
  const openNoteEditor = useCallback((elementId, elementType) => {
    dispatch({
      type: 'OPEN_NOTE_EDITOR',
      payload: { elementId, elementType }
    });
  }, [dispatch]);

  const closeNoteEditor = useCallback(() => {
    dispatch({ type: 'CLOSE_NOTE_EDITOR' });
  }, [dispatch]);

  const openNoteViewer = useCallback((elementId, elementType) => {
    dispatch({
      type: 'OPEN_NOTE_VIEWER',
      payload: { elementId, elementType }
    });
  }, [dispatch]);

  const closeNoteViewer = useCallback(() => {
    dispatch({ type: 'CLOSE_NOTE_VIEWER' });
  }, [dispatch]);

  const openBgImageModal = useCallback(() => {
    dispatch({ type: 'OPEN_BG_IMAGE_MODAL' });
  }, [dispatch]);

  const closeBgImageModal = useCallback(() => {
    dispatch({ type: 'CLOSE_BG_IMAGE_MODAL' });
  }, [dispatch]);

  const openShareModal = useCallback(() => {
    dispatch({ type: 'OPEN_SHARE_MODAL' });
  }, [dispatch]);

  const closeShareModal = useCallback(() => {
    dispatch({ type: 'CLOSE_SHARE_MODAL' });
  }, [dispatch]);

  const openDebugModal = useCallback(() => {
    dispatch({ type: 'OPEN_DEBUG_MODAL' });
  }, [dispatch]);

  const closeDebugModal = useCallback(() => {
    dispatch({ type: 'CLOSE_DEBUG_MODAL' });
  }, [dispatch]);

  const closeAllModals = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_MODALS' });
  }, [dispatch]);

  const toggleModal = useCallback((modalType) => {
    const modalStateMap = {
      'noteEditor': state?.noteEditor?.isOpen,
      'noteViewer': state?.noteViewer?.isOpen,
      'bgImage': state?.bgImageModal?.isOpen,
      'share': state?.shareModal?.isOpen,
      'debug': state?.debugModal?.isOpen
    };

    const isOpen = modalStateMap[modalType];
    
    switch (modalType) {
      case 'noteEditor':
        if (isOpen) {
          closeNoteEditor();
        } else {
          openNoteEditor();
        }
        break;
      case 'noteViewer':
        if (isOpen) {
          closeNoteViewer();
        } else {
          openNoteViewer();
        }
        break;
      case 'bgImage':
        if (isOpen) {
          closeBgImageModal();
        } else {
          openBgImageModal();
        }
        break;
      case 'share':
        if (isOpen) {
          closeShareModal();
        } else {
          openShareModal();
        }
        break;
      case 'debug':
        if (isOpen) {
          closeDebugModal();
        } else {
          openDebugModal();
        }
        break;
      default:
        console.warn('Unknown modal type:', modalType);
    }
  }, [
    state,
    openNoteEditor,
    closeNoteEditor,
    openNoteViewer,
    closeNoteViewer,
    openBgImageModal,
    closeBgImageModal,
    openShareModal,
    closeShareModal,
    openDebugModal,
    closeDebugModal
  ]);

  const isAnyModalOpen = useCallback(() => {
    return !!(
      state?.noteEditor?.isOpen ||
      state?.noteViewer?.isOpen ||
      state?.bgImageModal?.isOpen ||
      state?.shareModal?.isOpen ||
      state?.debugModal?.isOpen
    );
  }, [state]);

  const getOpenModalType = useCallback(() => {
    if (state?.noteEditor?.isOpen) return 'noteEditor';
    if (state?.noteViewer?.isOpen) return 'noteViewer';
    if (state?.bgImageModal?.isOpen) return 'bgImage';
    if (state?.shareModal?.isOpen) return 'share';
    if (state?.debugModal?.isOpen) return 'debug';
    return null;
  }, [state]);

  return {
    // Individual modal controls
    openNoteEditor,
    closeNoteEditor,
    openNoteViewer,
    closeNoteViewer,
    openBgImageModal,
    closeBgImageModal,
    openShareModal,
    closeShareModal,
    openDebugModal,
    closeDebugModal,
    
    // Global modal controls
    closeAllModals,
    toggleModal,
    
    // Modal state queries
    isAnyModalOpen,
    getOpenModalType
  };
}
