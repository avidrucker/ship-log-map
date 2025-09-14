// src/hooks/useKeyboardHandlers.js

import { useCallback, useEffect } from 'react';
import { printDebug } from '../utils/debug';

/**
 * Keyboard handler hook (preserves App's previous behavior + adds useful ones)
 *
 * @param {Object} params
 * @param {'editing'|'playing'} params.mode
 * @param {Function} params.getSelections - () => ({ selectedNodeIds, selectedEdgeIds })
 * @param {Function} params.onDeleteSelectedNodes - (ids: string[]) => void
 * @param {Function} params.onDeleteSelectedEdges - (ids: string[]) => void
 * @param {Object} params.graphOps - from useGraphOperations()
 * @param {Object} params.modalOps - from useModalState()
 * @param {Function} [params.onResetSelection] - optional fallback if no modal open on Escape/Space
 */
export function useKeyboardHandlers({
  mode,
  getSelections,
  onDeleteSelectedNodes,
  onDeleteSelectedEdges,
  graphOps,
  modalOps,
  onResetSelection,
}) {
  const handleKeyDown = useCallback(
    (event) => {
      const tag = event.target?.tagName;
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        event.target?.contentEditable === 'true';

      // ---------------------------
      // DELETE/BACKSPACE (existing behavior)
      // ---------------------------
      if (!isTyping && mode === 'editing' && (event.key === 'Delete' || event.key === 'Backspace')) {
        const { selectedNodeIds = [], selectedEdgeIds = [] } = getSelections() || {};
        if (!selectedNodeIds.length && !selectedEdgeIds.length) return;
        event.preventDefault();
        printDebug('⌨️ Delete pressed:', { selectedNodeIds, selectedEdgeIds });
        if (selectedNodeIds.length > 0) {
          onDeleteSelectedNodes(selectedNodeIds);
        } else if (selectedEdgeIds.length > 0) {
          onDeleteSelectedEdges(selectedEdgeIds);
        }
        return;
      }

      // Ignore other shortcuts while typing
      if (isTyping) return;

      const key = event.key.toLowerCase();

      // ---------------------------
      // GENERAL SHORTCUTS
      // ---------------------------
      if (key === 'escape') {
        if (modalOps?.isAnyModalOpen()) {
          modalOps.closeAllModals();
        } else if (graphOps?.handleResetSelection) {
          graphOps.handleResetSelection();
        } else if (onResetSelection) {
          onResetSelection();
        }
        return;
      }

      if (key === ' ') {
        event.preventDefault();
        if (graphOps?.handleResetSelection) graphOps.handleResetSelection();
        else if (onResetSelection) onResetSelection();
        return;
      }

      // Fit (F)
      if (key === 'f') {
        graphOps?.handleFitGraph?.();
        return;
      }

      // Rotate (R / Shift+R)
      if (key === 'r') {
        if (event.shiftKey) graphOps?.handleRotateLeft?.();
        else graphOps?.handleRotateRight?.();
        return;
      }

      // Toggle BG modal (B)
      if (key === 'b') {
        modalOps?.toggleBgImageModal?.();
        return;
      }

      // Toggle Share modal (S)
      if (key === 's') {
        modalOps?.isShareModalOpen ? modalOps.closeShareModal() : modalOps.openShareModal();
        return;
      }
    },
    [
      mode,
      getSelections,
      onDeleteSelectedNodes,
      onDeleteSelectedEdges,
      graphOps,
      modalOps,
      onResetSelection,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}