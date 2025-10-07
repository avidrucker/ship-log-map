// src/utils/grayscaleUtils.js
import { printDebug } from "./debug.js";

/**
 * Grayscale Pipeline
 *
 * Responsibilities
 * - Create and cache grayscale versions of node images for visual states.
 * - Manage "pending grayscale" flags so rendering waits for assets.
 * - Handle localStorage persistence of grayscale cache.
 *
 * Gotchas
 * - All functions are async-aware; guard against race conditions on rapid loads.
 */

// Cache for grayscale images to avoid reprocessing
const GRAYSCALE_CACHE_KEY = 'shipLogGrayscaleCache';
const grayscaleCache = new Map();
const pendingConversions = new Set();

/**
 * Converts an image to grayscale using canvas manipulation
 * Returns a data URL of the grayscale image
 */
export function convertImageToGrayscale(imageUrl) {
  printDebug(`🎨 [GrayscaleUtils] Starting conversion for: "${imageUrl?.substring(0, 50)}..."`);
  
  return new Promise((resolve, reject) => {
    // Create a new image element
    const img = new Image();
    
    // Handle CORS for external images
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      printDebug(`✅ [GrayscaleUtils] Image loaded successfully, dimensions: ${img.width}x${img.height}`);
      try {
        // Create a canvas element
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas dimensions to match image
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw the image on the canvas
        ctx.drawImage(img, 0, 0);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Convert to grayscale using luminance formula
        for (let i = 0; i < data.length; i += 4) {
          const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          data[i] = gray;     // Red
          data[i + 1] = gray; // Green
          data[i + 2] = gray; // Blue
          // data[i + 3] remains the same (alpha)
        }
        
        // Put the modified image data back
        ctx.putImageData(imageData, 0, 0);
        
        // Convert canvas to data URL
        const grayscaleDataUrl = canvas.toDataURL('image/png');
        printDebug(`✅ [GrayscaleUtils] Conversion successful, result size: ${grayscaleDataUrl.length} chars`);
        resolve(grayscaleDataUrl);
      } catch (error) {
        console.error(`❌ [GrayscaleUtils] Canvas processing failed:`, error);
        reject(error);
      }
    };
    
    img.onerror = () => {
      console.error(`❌ [GrayscaleUtils] Failed to load image for grayscale conversion: "${imageUrl?.substring(0, 50)}..."`);
      reject(new Error('Failed to load image'));
    };
    
    printDebug(`🔄 [GrayscaleUtils] Setting img.src...`);
    // Load the image
    img.src = imageUrl;
  });
}

/**
 * Load grayscale cache from localStorage on module initialization
 */
function loadGrayscaleCacheFromStorage() {
  try {
    const cached = localStorage.getItem(GRAYSCALE_CACHE_KEY);
    if (cached) {
      const parsedCache = JSON.parse(cached);
      const entryCount = Object.keys(parsedCache).length;
      printDebug(`💾 [GrayscaleUtils] Loading grayscale cache from localStorage with ${entryCount} entries`);
      Object.entries(parsedCache).forEach(([key, value]) => {
        grayscaleCache.set(key, value);
        printDebug(`💾 [GrayscaleUtils] Loaded grayscale cache entry: "${key.substring(0, 50)}..." -> value length: ${value?.length || 0}`);
      });
      printDebug(`✅ [GrayscaleUtils] Grayscale cache loaded successfully with ${grayscaleCache.size} entries`);
    } else {
      printDebug(`💾 [GrayscaleUtils] No grayscale cache found in localStorage`);
    }
  } catch (error) {
    console.warn('Failed to load grayscale cache from localStorage:', error);
  }
}

/**
 * Save grayscale cache to localStorage
 */
function saveGrayscaleCacheToStorage() {
  try {
    const cacheObject = {};
    let savedCount = 0;
    grayscaleCache.forEach((value, key) => {
      // Only save completed conversions (strings), not promises
      if (typeof value === 'string') {
        cacheObject[key] = value;
        savedCount++;
      }
    });
    printDebug(`💾 [GrayscaleUtils] Saving grayscale cache to localStorage: ${savedCount} entries out of ${grayscaleCache.size} total`);
    localStorage.setItem(GRAYSCALE_CACHE_KEY, JSON.stringify(cacheObject));
    printDebug(`✅ [GrayscaleUtils] Grayscale cache saved successfully`);
  } catch (error) {
    console.warn('Failed to save grayscale cache to localStorage:', error);
  }
}

/**
 * Initialize cache from localStorage
 */
loadGrayscaleCacheFromStorage();

/**
 * Preprocess images to grayscale in the background to avoid race conditions
 */
export function preprocessImageToGrayscale(imageUrl, originalImagePath = null, testIconSvg = null) {
  printDebug(`🎨 [GrayscaleUtils] preprocessImageToGrayscale called with: "${imageUrl?.substring(0, 50)}..." (originalPath: ${originalImagePath || 'none'})`);
  
  if (!imageUrl) {
    printDebug(`⚠️ [GrayscaleUtils] Skipping grayscale: no image`);
    return Promise.resolve(imageUrl);
  }
  
  // Skip SVG placeholders and test icons
  if (imageUrl === testIconSvg || imageUrl.includes('data:image/svg+xml')) {
    printDebug(`⚠️ [GrayscaleUtils] Skipping grayscale for SVG placeholder`);
    return Promise.resolve(imageUrl);
  }
  
  // Only process real image data URLs - skip filenames and non-image data
  if (!imageUrl.startsWith('data:image/') || imageUrl.startsWith('data:image/svg+xml')) {
    printDebug(`⚠️ [GrayscaleUtils] Skipping grayscale for non-image data URL: "${imageUrl?.substring(0, 50)}..."`);
    return Promise.resolve(imageUrl);
  }
  
  // Use original image path as cache key if available, otherwise fall back to image URL
  const cacheKey = originalImagePath || imageUrl;
  
  if (grayscaleCache.has(cacheKey)) {
    const cached = grayscaleCache.get(cacheKey);
    printDebug(`💾 [GrayscaleUtils] Found cached grayscale result for key: "${originalImagePath ? 'path-based' : 'url-based'}"`);
    // If it's a string (completed conversion), return it
    if (typeof cached === 'string') {
      return Promise.resolve(cached);
    }
    // If it's a promise (in progress), return the promise
    return cached;
  }
  
  printDebug(`🔄 [GrayscaleUtils] Starting new grayscale conversion with cache key: "${cacheKey?.substring(0, 50)}..."`);
  // Start conversion in background, but don't wait for it
  const conversionPromise = convertImageToGrayscale(imageUrl)
    .then(grayscaleUrl => {
      grayscaleCache.set(cacheKey, grayscaleUrl);
      pendingConversions.delete(imageUrl);
      // Save to localStorage when conversion completes
      saveGrayscaleCacheToStorage();
      return grayscaleUrl;
    })
    .catch(error => {
      console.warn('Failed to convert image to grayscale:', error);
      grayscaleCache.set(cacheKey, imageUrl); // Cache the original to avoid retrying
      pendingConversions.delete(imageUrl);
      // Save to localStorage even on failure to avoid retrying
      saveGrayscaleCacheToStorage();
      return imageUrl;
    });
  
  pendingConversions.add(imageUrl);
  grayscaleCache.set(cacheKey, conversionPromise);
  return conversionPromise;
}

/**
 * Check if there are pending conversions that might benefit from an update
 */
export function hasPendingGrayscaleConversions() {
  return pendingConversions.size > 0;
}

/**
 * Get cached grayscale image if available
 */
export function getCachedGrayscaleImage(cacheKey) {
  const cached = grayscaleCache.get(cacheKey);
  if (cached && typeof cached === 'string') {
    return cached;
  }
  return null;
}

/**
 * Check if an image should be processed for grayscale
 */
export function shouldProcessForGrayscale(imageUrl, testIconSvg = null) {
  if (!imageUrl || imageUrl === testIconSvg) return false;
  if (imageUrl.includes('data:image/svg+xml')) return false;
  
  return imageUrl.startsWith('data:image/png;') || 
         imageUrl.startsWith('data:image/jpeg;') || 
         imageUrl.startsWith('data:image/jpg;') || 
         imageUrl.startsWith('data:image/webp;');
}

/**
 * Update only image data for nodes that have completed grayscale conversion
 */
export function updateCompletedGrayscaleImages(cy, nodes, testIconSvg = null) {
  if (pendingConversions.size === 0) return false;
  
  let updated = false;
  
  nodes.forEach(n => {
    const imageUrl = n.imageUrl;
    if (imageUrl && imageUrl !== testIconSvg && grayscaleCache.has(imageUrl)) {
      const cached = grayscaleCache.get(imageUrl);
      if (typeof cached === 'string' && !pendingConversions.has(imageUrl)) {
        // Conversion completed, update the node
        const cyNode = cy.getElementById(n.id);
        if (cyNode.length > 0 && cyNode.data('imageUrl') !== cached) {
          cyNode.data('imageUrl', cached);
          updated = true;
        }
      }
    }
  });
  
  return updated;
}

/**
 * Get grayscale version of an image with caching
 */
export async function getGrayscaleImage(imageUrl) {
  // Check cache first
  if (grayscaleCache.has(imageUrl)) {
    const cached = grayscaleCache.get(imageUrl);
    if (typeof cached === 'string') {
      return cached;
    }
    // If it's a promise, wait for it
    return cached;
  }
  
  try {
    const grayscaleUrl = await convertImageToGrayscale(imageUrl);
    grayscaleCache.set(imageUrl, grayscaleUrl);
    saveGrayscaleCacheToStorage();
    return grayscaleUrl;
  } catch (error) {
    console.warn('Failed to convert image to grayscale:', error);
    // Return original image if conversion fails
    return imageUrl;
  }
}

/**
 * Clear the grayscale cache (useful for memory management)
 */
export function clearGrayscaleCache() {
  const entriesBeforeClear = grayscaleCache.size;
  const pendingBeforeClear = pendingConversions.size;
  
  grayscaleCache.clear();
  pendingConversions.clear();
  
  printDebug(`🧹 [GrayscaleUtils] Cleared grayscale cache: ${entriesBeforeClear} entries, ${pendingBeforeClear} pending conversions`);
  
  try { 
    localStorage.removeItem(GRAYSCALE_CACHE_KEY);
    printDebug(`✅ [GrayscaleUtils] Removed grayscale cache from localStorage`);
  } catch (e) { 
    console.warn('Failed to clear grayscale cache from localStorage:', e); 
  }
}
