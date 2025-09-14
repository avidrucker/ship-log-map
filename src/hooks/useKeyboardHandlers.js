// src/hooks/useKeyboardHandlers.js

import { useCallback, useEffect } from 'react';

/**
 * Custom hook for keyboard event handling
 * @param {Object} graphOps - Graph operations from useGraphOperations
 * @param {Object} modalOps - Modal operations from useModalState
 * @param {Object} mapOps - Map operations from useMapLoading
 * @param {Object} state - Current app state
 * @returns {Object} Keyboard handling functions
 */
export function useKeyboardHandlers(graphOps, modalOps, mapOps, state) {
  const handleKeyPress = useCallback((event) => {
    // Don't handle keyboard shortcuts when typing in inputs or modals are open
    if (
      event.target.tagName === 'INPUT' ||
      event.target.tagName === 'TEXTAREA' ||
      event.target.contentEditable === 'true' ||
      modalOps.isAnyModalOpen()
    ) {
      return;
    }

    // Handle key combinations with modifiers
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault();
          // Save functionality could be added here
          console.log('Save shortcut triggered');
          break;
        case 'o':
          event.preventDefault();
          mapOps.handleMapLoadFromUrl();
          break;
        case 'r':
          event.preventDefault();
          if (state.currentMapUrl) {
            mapOps.reloadCurrentMap(state.currentMapUrl);
          }
          break;
        case 'a':
          event.preventDefault();
          // Select all functionality could be added here
          console.log('Select all shortcut triggered');
          break;
        default:
          break;
      }
      return;
    }

    // Handle single key shortcuts
    switch (event.key.toLowerCase()) {
      case 'escape':
        if (modalOps.isAnyModalOpen()) {
          modalOps.closeAllModals();
        } else {
          graphOps.handleResetSelection();
        }
        break;
      case 'f':
        graphOps.handleFitGraph();
        break;
      case 'r':
        if (event.shiftKey) {
          graphOps.handleRotateLeft();
        } else {
          graphOps.handleRotateRight();
        }
        break;
      case 'd':
        graphOps.toggleDebugMode();
        break;
      case 'b':
        modalOps.toggleModal('bgImage');
        break;
      case 's':
        modalOps.toggleModal('share');
        break;
      case 'h':
      case '?':
        // Help modal could be added here
        console.log('Help shortcut triggered');
        break;
      case ' ':
        event.preventDefault();
        graphOps.handleResetSelection();
        break;
      case 'arrowleft':
        if (event.shiftKey) {
          graphOps.handleRotateLeft();
        }
        break;
      case 'arrowright':
        if (event.shiftKey) {
          graphOps.handleRotateRight();
        }
        break;
      default:
        break;
    }
  }, [graphOps, modalOps, mapOps, state]);

  const handleKeyDown = useCallback((event) => {
    // Handle special key down events that need immediate response
    switch (event.key) {
      case 'Tab':
        // Tab navigation could be enhanced here
        break;
      case 'Enter':
        // Enter handling could be added here
        break;
      default:
        break;
    }
  }, []);

  const handleKeyUp = useCallback((event) => {
    // Handle key up events if needed
    switch (event.key) {
      default:
        break;
    }
  }, []);

  // Set up keyboard event listeners
  useEffect(() => {
    const handleKeyPressEvent = (event) => handleKeyPress(event);
    const handleKeyDownEvent = (event) => handleKeyDown(event);
    const handleKeyUpEvent = (event) => handleKeyUp(event);

    document.addEventListener('keydown', handleKeyPressEvent);
    document.addEventListener('keydown', handleKeyDownEvent);
    document.addEventListener('keyup', handleKeyUpEvent);

    return () => {
      document.removeEventListener('keydown', handleKeyPressEvent);
      document.removeEventListener('keydown', handleKeyDownEvent);
      document.removeEventListener('keyup', handleKeyUpEvent);
    };
  }, [handleKeyPress, handleKeyDown, handleKeyUp]);

  // Keyboard shortcut help text
  const getKeyboardShortcuts = useCallback(() => {
    return {
      'Navigation': {
        'F': 'Fit graph to view',
        'R': 'Rotate graph right',
        'Shift + R': 'Rotate graph left',
        'Space': 'Reset selection',
        'Escape': 'Close modals or reset selection'
      },
      'File Operations': {
        'Ctrl + O': 'Open map from URL',
        'Ctrl + R': 'Reload current map',
        'Ctrl + S': 'Save (placeholder)'
      },
      'Modals': {
        'B': 'Toggle background image modal',
        'S': 'Toggle share modal',
        'D': 'Toggle debug mode'
      },
      'General': {
        'H or ?': 'Show help (placeholder)',
        'Arrow Keys + Shift': 'Rotate graph'
      }
    };
  }, []);

  return {
    handleKeyPress,
    handleKeyDown,
    handleKeyUp,
    getKeyboardShortcuts
  };
}
