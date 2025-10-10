// src/graph/bgNodeAdapter.js

/**
 * Background Image Node Adapter
 *
 * Integrates background image directly into Cytoscape's canvas as a giant background node.
 * This eliminates CSS/Canvas rendering pipeline mismatch and lag during pan/zoom.
 *
 * Key Benefits:
 * - Background moves in perfect sync with nodes (same rendering pipeline)
 * - No CSS transform lag or rAF timing issues
 * - Native Cytoscape rendering handles all transforms
 *
 * Implementation:
 * - Creates a locked, unselectable, giant node at z-index 0
 * - Uses Cytoscape's background-image styling
 * - Positions/sizes based on calibration data
 */

import { printDebug } from '../utils/debug.js';

const BG_NODE_ID = '__background_image_node__';

/**
 * Calculate the position and size for the background node based on calibration
 * 
 * Calibration format:
 * - tx, ty: world offset (translation in Cytoscape coordinates)
 * - s: scale factor (world units per image pixel)
 * 
 * The node will be positioned so that:
 * - Its center is at (tx, ty) in world coordinates
 * - Its size matches the image dimensions scaled by s
 */
function calculateBgNodeGeometry(calibration, imageWidth, imageHeight) {
  const { tx = 0, ty = 0, s = 1 } = calibration;
  
  // Node dimensions in world coordinates
  const width = imageWidth * s;
  const height = imageHeight * s;
  
  // tx, ty represent the top-left corner of the image in world coordinates
  // Cytoscape positions nodes by their CENTER, so we need to offset by half width/height
  // to place the top-left at (tx, ty)
  const position = {
    x: tx + (width / 2),
    y: ty + (height / 2)
  };
  
  return { width, height, position };
}

/**
 * Force Cytoscape to update styles immediately without rAF
 * This is more efficient for background node updates since they happen infrequently
 */
function forceStyleUpdate(cy) {
  if (!cy || cy.destroyed()) return;
  
  // Direct style update - no rAF needed
  cy.style().update();
  
  // Only call resize if absolutely necessary (and without rAF)
  // This should only be needed on initial creation, not updates
}

/**
 * Batch multiple operations to avoid multiple style updates
 */
function batchNodeUpdates(cy, updateFn) {
  if (!cy || cy.destroyed()) return;
  
  cy.startBatch();
  try {
    updateFn();
  } finally {
    cy.endBatch(); // This triggers a single render automatically
  }
}

/**
 * Ensure background node exists with current settings
 * Creates or updates the background image node in Cytoscape
 */
export function ensureBgNode(cy, { imageUrl, visible, opacity = 100, calibration = {} }) {
  if (!cy || cy.destroyed()) {
    printDebug('⚠️ [bgNodeAdapter] Cannot ensure bg node - cy not available');
    return;
  }

  printDebug('🔍 [bgNodeAdapter] ensureBgNode called with:', {
    imageUrl: imageUrl ? `${imageUrl.substring(0, 50)}...` : null,
    visible,
    opacity,
    calibration
  });

  const existingNode = cy.getElementById(BG_NODE_ID);
  
  // Remove if not visible or no image
  if (!visible || !imageUrl) {
    if (existingNode.length > 0) {
      printDebug('🗑️ [bgNodeAdapter] Removing background node (not visible or no image)');
      batchNodeUpdates(cy, () => {
        cy.remove(existingNode);
      });
    }
    return;
  }

  const defaultImageSize = 10000;
  const imageWidth = defaultImageSize;
  const imageHeight = defaultImageSize;
  
  const geometry = calculateBgNodeGeometry(calibration, imageWidth, imageHeight);
  
  // *** FIX: Convert opacity to normalized value once ***
  const normalizedOpacity = opacity / 100; // Convert percentage to decimal once
  
  printDebug('🖼️ [bgNodeAdapter] Background geometry calculated', { 
    calibration, 
    geometry, 
    opacityPercentage: opacity,
    normalizedOpacity: normalizedOpacity, // *** DEBUG: Log both values ***
    imageUrlPreview: imageUrl.substring(0, 50) + '...',
    WARNING: calibration.tx !== 0 || calibration.ty !== 0 
      ? `⚠️ Background offset by tx=${calibration.tx}, ty=${calibration.ty}. Center will be at (${geometry.position.x}, ${geometry.position.y}). If not visible, try tx=0, ty=0 in the background modal.`
      : 'Background centered at origin'
  });
  
  if (existingNode.length > 0) {
    // Update existing node
    printDebug('🔄 [bgNodeAdapter] Updating background node', { 
      oldPosition: existingNode.position(),
      newPosition: geometry.position,
      geometry, 
      opacityPercentage: opacity,
      normalizedOpacity: normalizedOpacity,
      currentDataOpacity: existingNode.data('opacity'), // *** DEBUG: Check current stored opacity ***
      currentStyleOpacity: existingNode.style('opacity') // *** DEBUG: Check current style opacity ***
    });
    
    batchNodeUpdates(cy, () => {
      // Unlock temporarily to reposition
      const wasLocked = existingNode.locked();
      if (wasLocked) existingNode.unlock();
      
      // *** FIX: Store raw percentage in data, use normalized in style ***
      existingNode.data({
        imageUrl,
        opacityPct: opacity,                 // keep for UI if you use it elsewhere
        bgAlpha: normalizedOpacity           // 0..1 consumed by stylesheet
      });
      existingNode.position(geometry.position);
      
      // *** FIX: Use normalized opacity directly in style ***
      existingNode.style({
        'width': geometry.width,
        'height': geometry.height
      });
      
      // Re-lock if it was locked
      if (wasLocked) existingNode.lock();
    });
    
    printDebug('✅ [bgNodeAdapter] Background node updated successfully');
  } else {
    // Create new background node
    printDebug('✨ [bgNodeAdapter] Creating new background node');
    
    batchNodeUpdates(cy, () => {
      const newNode = cy.add({
        group: 'nodes',
        data: {
          id: BG_NODE_ID,
          imageUrl,
          opacityPct: opacity,   // optional, for UI
          bgAlpha: normalizedOpacity,
          __isBgNode: true
        },
        position: geometry.position,
        locked: false,
        grabbable: false,
        selectable: false,
        classes: 'background-image-node'
      });
      
      // *** FIX: Use normalized opacity in styles ***
      newNode.style({
        'width': geometry.width,
        'height': geometry.height
      });
      newNode.lock();
    });
    
    // Only for initial creation, force a single resize
    cy.resize();
    
    printDebug('✅ [bgNodeAdapter] Background node created successfully');
  }
}

/**
 * Update background node opacity
 */
export function updateBgNodeOpacity(cy, opacity) {
  if (!cy || cy.destroyed()) return;
  
  const bgNode = cy.getElementById(BG_NODE_ID);
  if (bgNode.length === 0) return;
  
  // *** FIX: Convert to normalized once, store percentage in data ***
  const normalizedOpacity = opacity / 100;
  
  printDebug('🎨 [bgNodeAdapter] Updating opacity', {
    opacityPercentage: opacity,
    normalizedOpacity: normalizedOpacity,
    previousDataOpacity: bgNode.data('opacity'),
    previousStyleOpacity: bgNode.style('opacity')
  });
  
  batchNodeUpdates(cy, () => {
    bgNode.data({
      opacityPct: opacity,     // optional UI copy
      bgAlpha: normalizedOpacity
    });
});
}

/**
 * Remove the background node if it exists
 */
export function removeBgNode(cy) {
  if (!cy || cy.destroyed()) return;
  
  const bgNode = cy.getElementById(BG_NODE_ID);
  if (bgNode.length > 0) {
    printDebug('🗑️ [bgNodeAdapter] Removing background node');
    cy.remove(bgNode);
  }
}

/**
 * Update background node calibration (position/scale)
 * This is called when user adjusts background image positioning
 */
export function updateBgNodeCalibration(cy, calibration, imageWidth = 1000, imageHeight = 1000) {
  if (!cy || cy.destroyed()) return;
  
  const bgNode = cy.getElementById(BG_NODE_ID);
  if (bgNode.length === 0) {
    printDebug('⚠️ [bgNodeAdapter] Cannot update calibration - bg node does not exist');
    return;
  }
  
  const geometry = calculateBgNodeGeometry(calibration, imageWidth, imageHeight);
  
  printDebug('📐 [bgNodeAdapter] Updating background node calibration', geometry);
  
  // Batch the calibration update
  batchNodeUpdates(cy, () => {
    const wasLocked = bgNode.locked();
    if (wasLocked) bgNode.unlock();
    
    bgNode.position(geometry.position);
    bgNode.style({
      'width': geometry.width,
      'height': geometry.height
    });
    
    if (wasLocked) bgNode.lock();
  });
}

/**
 * Check if background node exists
 */
export function hasBgNode(cy) {
  if (!cy || cy.destroyed()) return false;
  return cy.getElementById(BG_NODE_ID).length > 0;
}