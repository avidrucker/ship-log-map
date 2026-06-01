import { useState, useCallback } from 'react';
import { ACTION_TYPES } from '../appStateReducer.js';

export function useReadingModal({ dispatchAppState, universalMenuCollapsed }) {
  const [readingModalOpen, setReadingModalOpen] = useState(false);

  const openReadingModal = useCallback(() => {
    setReadingModalOpen(true);
    // Auto-collapse universal menu when reading modal opens
    if (!universalMenuCollapsed) {
      dispatchAppState({ type: ACTION_TYPES.SET_UNIVERSAL_MENU_COLLAPSED, payload: { collapsed: true } });
    }
  }, [dispatchAppState, universalMenuCollapsed]);

  const closeReadingModal = useCallback(() => setReadingModalOpen(false), []);

  return { readingModalOpen, openReadingModal, closeReadingModal };
}
