// src/config/features.js

/**
 * Feature flags for the ship log map application
 * Set these to true/false to enable/disable features
 */

export const FEATURES = {
  // Enable zoom-to-selection when editing nodes/edges
  // When enabled, clicking "Edit" will zoom to the selected element in the top half of the screen
  // and restore the original camera position when the editor is closed
  ZOOM_TO_SELECTION: true,
  
  // Debug logging for all app operations
  DEBUG_LOGGING: false,
  
  // Enable editing/playing mode toggle
  // When enabled, users can switch between editing mode (full functionality) and playing mode (view-only)
  MODE_TOGGLE: true,
  
  // Future feature flags can be added here...
};

// Export individual flags for convenience
export const {
  ZOOM_TO_SELECTION,
  DEBUG_LOGGING,
  MODE_TOGGLE
} = FEATURES;
