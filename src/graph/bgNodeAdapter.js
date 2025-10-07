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
 * Ensure background node exists with current settings
 * Creates or updates the background image node in Cytoscape
 */
export function ensureBgNode(cy, { imageUrl, visible, opacity = 100, calibration = {} }) {
  if (!cy || cy.destroyed()) {
    printDebug('⚠️ [bgNodeAdapter] Cannot ensure bg node - cy not available');
    return;
  }

  // Debug logging
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
      cy.remove(existingNode);
    }
    return;
  }

  // Background images are typically large - use a big default size
  // The scale factor (calibration.s) will adjust the final world-space size
  // Typical background images are 2000-4000px, but we want them to fill the view
  // so we use a large value that gets scaled by calibration.s
  const defaultImageSize = 10000; // Large enough to cover typical viewports
  const imageWidth = defaultImageSize;
  const imageHeight = defaultImageSize;
  
  const geometry = calculateBgNodeGeometry(calibration, imageWidth, imageHeight);
  
  printDebug('🖼️ [bgNodeAdapter] Background geometry calculated', { 
    calibration, 
    geometry, 
    opacity,
    imageUrlPreview: imageUrl.substring(0, 50) + '...',
    WARNING: calibration.tx !== 0 || calibration.ty !== 0 
      ? `⚠️ Background offset by tx=${calibration.tx}, ty=${calibration.ty}. Center will be at (${geometry.position.x}, ${geometry.position.y}). If not visible, try tx=0, ty=0 in the background modal.`
      : 'Background centered at origin'
  });
  
  if (existingNode.length > 0) {
    // Update existing node
    const oldPos = existingNode.position();
    printDebug('🔄 [bgNodeAdapter] Updating background node', { 
      oldPosition: oldPos,
      newPosition: geometry.position,
      geometry, 
      opacity,
      isLocked: existingNode.locked()
    });
    
    // Unlock temporarily to reposition
    const wasLocked = existingNode.locked();
    if (wasLocked) {
      existingNode.unlock();
    }
    
    existingNode.data('imageUrl', imageUrl);
    existingNode.data('opacity', opacity / 100);
    existingNode.position(geometry.position);
    
    // Re-lock if it was locked
    if (wasLocked) {
      existingNode.lock();
    }
    
    // Verify position was updated
    const updatedPos = existingNode.position();
    printDebug('✅ [bgNodeAdapter] Position after update', { 
      attempted: geometry.position,
      actual: updatedPos,
      success: updatedPos.x === geometry.position.x && updatedPos.y === geometry.position.y
    });
    
    existingNode.style({
      'width': geometry.width,
      'height': geometry.height,
      'opacity': opacity / 100
    });
    
    // Force a re-render after updating (especially on first load from localStorage)
    cy.style().update();
    requestAnimationFrame(() => {
      cy.resize();
    });
  } else {
    // Create new background node
    printDebug('✨ [bgNodeAdapter] Creating background node', { geometry, opacity, imageUrl: imageUrl.substring(0, 50) + '...' });
    
    const newNode = cy.add({
      group: 'nodes',
      data: {
        id: BG_NODE_ID,
        imageUrl: imageUrl,
        opacity: opacity / 100,
        __isBgNode: true
      },
      position: geometry.position,
      locked: false, // Start unlocked to allow initial positioning
      grabbable: false,
      selectable: false,
      classes: 'background-image-node'
    });
    
    // Set size and opacity styles
    newNode.style({
      'width': geometry.width,
      'height': geometry.height,
      'opacity': opacity / 100
    });
    
    // Now lock it after position and styles are set
    newNode.lock();
    
    // Force a re-render to ensure the background appears
    // Sometimes Cytoscape needs a nudge to render the node properly
    cy.style().update();
    
    // Additional: Force viewport refresh
    requestAnimationFrame(() => {
      cy.resize();
    });
    
    printDebug('✅ [bgNodeAdapter] Background node created and locked', { 
      position: newNode.position(),
      size: { width: geometry.width, height: geometry.height },
      isLocked: newNode.locked()
    });
  }
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
  
  // Unlock temporarily to reposition
  const wasLocked = bgNode.locked();
  if (wasLocked) {
    bgNode.unlock();
  }
  
  bgNode.position(geometry.position);
  bgNode.style({
    'width': geometry.width,
    'height': geometry.height
  });
  
  // Re-lock if it was locked
  if (wasLocked) {
    bgNode.lock();
  }
  
  // Force re-render
  cy.style().update();
  requestAnimationFrame(() => {
    cy.resize();
  });
}

/**
 * Update background node opacity
 */
export function updateBgNodeOpacity(cy, opacity) {
  if (!cy || cy.destroyed()) return;
  
  const bgNode = cy.getElementById(BG_NODE_ID);
  if (bgNode.length === 0) return;
  
  const normalizedOpacity = opacity / 100;
  bgNode.data('opacity', normalizedOpacity);
  bgNode.style('opacity', normalizedOpacity);
}

/**
 * Check if background node exists
 */
export function hasBgNode(cy) {
  if (!cy || cy.destroyed()) return false;
  return cy.getElementById(BG_NODE_ID).length > 0;
}
