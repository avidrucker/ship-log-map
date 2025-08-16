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
  DEBUG_LOGGING: true,
  
  // Enable editing/playing mode toggle
  // When enabled, users can switch between editing mode (full functionality) and playing mode (view-only)
  MODE_TOGGLE: true,
  
  // Development mode - shows debug tools and features
  // Set to false in production to hide debug button and modal
  DEV_MODE: true,
  
  // Render all node images in black and white (grayscale)
  // When enabled, overlays a gray square image on top of node background images using multiply blend mode
  // This creates a grayscale effect for images only, without affecting node colors or text
  GRAYSCALE_IMAGES: true,
  
  // Future feature flags can be added here...
};

// Export individual flags for convenience
export const {
  ZOOM_TO_SELECTION,
  DEBUG_LOGGING,
  MODE_TOGGLE,
  DEV_MODE,
  GRAYSCALE_IMAGES
} = FEATURES;
