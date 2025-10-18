import { useEffect } from 'react';
import { printDebug } from '../utils/debug';

export function useGlobalSearchHotkeys(openFn, disabled = false) {
  useEffect(() => {
    // Don't set up the listener if disabled (e.g., when reading modal is open)
    if (disabled) {
      return;
    }

    function onKey(e) {
      const key = e.key?.toLowerCase();
      const mod = e.ctrlKey || e.metaKey; // Ctrl on Win/Linux, Cmd on macOS
      if(!mod) return;

      printDebug('Global keydown:', { key, mod, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
      if (mod && key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Call the open function
        if (openFn) {
          openFn();
        }
      }
      if (key === 'escape') {
        // Let the bar handle closing if it has focus; no global action here
      }
    }
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  }, [openFn, disabled]);
}
