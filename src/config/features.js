// src/config/features.js

/**
 * Feature Flags
 *
 * Responsibilities
 * - Toggle experimental/prototype features (e.g., planned animations).
 * - Central place to flip defaults without touching UI logic.
 */

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
  
  // Development mode - shows debug tools and features
  // Set to false in production to hide debug button and modal
  DEV_MODE: false,
  
  // Render all node images in black and white (grayscale)
  // This creates a grayscale effect for images only, without affecting node colors or text
  GRAYSCALE_IMAGES: false,
  
  // Hide the camera info panel completely when enabled
  // When true, the camera info panel will not render at all
  CAMERA_INFO_HIDDEN: false,
  
  // Future feature flags can be added here...
};

// Export individual flags for convenience
export const {
  ZOOM_TO_SELECTION,
  DEBUG_LOGGING,
  DEV_MODE,
  GRAYSCALE_IMAGES,
  CAMERA_INFO_HIDDEN
} = FEATURES;
