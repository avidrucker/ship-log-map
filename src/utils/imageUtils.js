// src/utils/imageUtils.js
import { printDebug } from '../utils/debug.js';

/**
 * Generates a simple hash from a file buffer using browser APIs
 */
async function generateFileHash(buffer) {
  // Use Web Crypto API for hashing
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12); // Use first 12 characters
}

/**
 * Validates that an image has valid dimensions (not 0x0)
 */
function validateImageDimensions(img) {
  return img.width > 0 && img.height > 0;
}

/**
 * Crops an image to a square by taking the center portion
 * If the image is wider than tall, crops horizontally
 * If the image is taller than wide, crops vertically
 */
function cropToSquare(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Determine the size of the square (smallest dimension)
  const squareSize = Math.min(img.width, img.height);
  
  // Calculate crop positions to center the crop
  const cropX = (img.width - squareSize) / 2;
  const cropY = (img.height - squareSize) / 2;
  
  printDebug(`✂️ Cropping: taking ${squareSize}x${squareSize} square from center (offset: ${cropX}, ${cropY})`);
  
  // Set canvas to square dimensions
  canvas.width = squareSize;
  canvas.height = squareSize;
  
  // Draw the cropped image onto the canvas
  // drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
  ctx.drawImage(
    img,                    // source image
    cropX, cropY,           // source x, y (crop start position)
    squareSize, squareSize, // source width, height (crop size)
    0, 0,                   // destination x, y
    squareSize, squareSize  // destination width, height
  );
  
  return canvas;
}

/**
 * Creates a canvas and resizes an image or canvas to specified dimensions
 */
function resizeImage(source, width, height) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = width;
  canvas.height = height;
  
  // Draw the source (could be an image or canvas) scaled to fit the canvas
  ctx.drawImage(source, 0, 0, width, height);
  
  return canvas;
}

/**
 * Converts a canvas to a Blob with specified format and quality
 */
function canvasToBlob(canvas, format = 'image/webp', quality = 0.85) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, format, quality);
  });
}

/**
 * Processes an image file: crops to square (center crop), creates thumbnail and full-size versions
 * - For wide images: crops horizontally to take the center square
 * - For tall images: crops vertically to take the center square
 * - For square images: no cropping needed
 * - Only errors if image is corrupted or has 0x0 dimensions
 */
export async function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        // Validate image has valid dimensions (not 0x0)
        if (!validateImageDimensions(img)) {
          reject(new Error('Invalid image: Image has zero width or height.'));
          return;
        }

        printDebug(`📐 Processing image: ${img.width}x${img.height} pixels`);

        // Determine crop strategy
        if (img.width === img.height) {
          printDebug(`✅ Image is already square, no cropping needed`);
        } else if (img.width > img.height) {
          printDebug(`📏 Image is wider than tall (${img.width}x${img.height}), will crop horizontally to ${img.height}x${img.height}`);
        } else {
          printDebug(`📏 Image is taller than wide (${img.width}x${img.height}), will crop vertically to ${img.width}x${img.width}`);
        }

        // Read file as array buffer to generate hash
        const arrayBuffer = await file.arrayBuffer();
        const fileHash = await generateFileHash(new Uint8Array(arrayBuffer));
        
        // Determine file extension
        const originalFormat = file.type;
        let extension = 'webp'; // Default to webp
        if (originalFormat === 'image/png') extension = 'png';
        if (originalFormat === 'image/jpeg') extension = 'jpeg';
        
        // Crop image to square (center crop)
        const squareCanvas = cropToSquare(img);
        const squareSize = squareCanvas.width; // Now it's square, so width === height
        
        printDebug(`✂️ Cropped to square: ${squareSize}x${squareSize} pixels`);
        
        // Create thumbnail (100x100) from the cropped square
        const thumbnailCanvas = resizeImage(squareCanvas, 100, 100);
        const thumbnailBlob = await canvasToBlob(thumbnailCanvas, file.type);
        
        // Create full-size (max 500x500, but maintain square) from the cropped square
        const maxSize = Math.min(squareSize, 500);
        const fullSizeCanvas = resizeImage(squareCanvas, maxSize, maxSize);
        const fullSizeBlob = await canvasToBlob(fullSizeCanvas, file.type);
        
        resolve({
          fileHash,
          extension,
          thumbnailBlob,
          fullSizeBlob,
          originalDimensions: { width: img.width, height: img.height },
          croppedDimensions: { width: squareSize, height: squareSize }
        });
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image file. The file may be corrupted or not a valid image format.'));
    };
    
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Gets the current map name from app state or localStorage
 * This function is designed to be called with a map name parameter when available
 */
export function getCurrentMapName(mapName = null) {
  if (mapName) {
    return mapName;
  }
  
  // Fallback to localStorage
  try {
    const mapNameFromStorage = localStorage.getItem('ship_log_map_name_v1');
    return mapNameFromStorage || 'default_map';
  } catch (e) {
    console.warn('Could not access localStorage for map name:', e);
    return 'default_map';
  }
}

/**
 * Generates the image filename based on nodeId and hash
 */
export function generateImageFilename(nodeId, fileHash, extension, type = 'full') {
  const suffix = type === 'thumbnail' ? '_thumb' : '';
  return `${nodeId}_${fileHash}${suffix}.${extension}`;
}

/**
 * Generates the full path for storing images
 */
export function generateImagePath(mapName, filename) {
  return `${mapName}/${filename}`;
}

/**
 * Converts a blob to a data URL
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Saves processed image files to the public directory using File System Access API
 * Note: This is a development-only feature for prototyping
 * Returns data URLs for immediate use while also saving files for reference
 */
export async function saveImageFiles(nodeId, processedImage, mapName = null, directoryHandle = null) {
  try {
    const actualMapName = getCurrentMapName(mapName);
    
    // Generate logical filename for the image
    const imageFilename = generateImageFilename(nodeId, processedImage.fileHash, processedImage.extension, 'full');
    
    // Convert blobs to data URLs - but only cache the thumbnail to save localStorage space
    const thumbnailDataUrl = await blobToDataUrl(processedImage.thumbnailBlob);
    const fullSizeDataUrl = await blobToDataUrl(processedImage.fullSizeBlob);
    
    printDebug(`📊 Image sizes - Thumbnail: ${thumbnailDataUrl.length} chars, Full: ${fullSizeDataUrl.length} chars`);
    
    // Cache only the THUMBNAIL (100x100) to conserve localStorage space
    // The full-size image will be generated on-demand or loaded from CDN
    const { imageCache } = await import('./imageLoader.js');
    const cacheKey = `${actualMapName}:${imageFilename}`;
    
    // For immediate display, we'll use the full-size but only cache the thumbnail
    imageCache.set(cacheKey, thumbnailDataUrl);
    printDebug(`💾 Cached thumbnail for: ${cacheKey} (${thumbnailDataUrl.length} chars)`);

    // Return the logical filename (not the data URL) to store in JSON
    const result = {
      imagePath: imageFilename, // This will be stored in the JSON
      success: true,
      // Include the full-size data URL for immediate use (but don't cache it)
      immediateImageUrl: fullSizeDataUrl
    };

    // Optionally, still save to filesystem for reference (but don't block on it)
    try {
      await saveToFileSystem(nodeId, processedImage, actualMapName, directoryHandle);
    } catch (fsError) {
      console.warn('Could not save to filesystem (this is optional for development):', fsError.message);
    }

    return result;
  } catch (error) {
    console.error('Error processing image files:', error);
    throw error;
  }
}

/**
 * Helper function to save files to filesystem (optional for development)
 */
async function saveToFileSystem(nodeId, processedImage, mapName = null, directoryHandle = null) {
  // Check if File System Access API is available and we have a directory handle
  if (!window.showDirectoryPicker || !directoryHandle) {
    throw new Error('File System Access API is not supported or directory access not granted.');
  }

  const actualMapName = getCurrentMapName(mapName);
  const thumbnailFilename = generateImageFilename(nodeId, processedImage.fileHash, processedImage.extension, 'thumbnail');
  const fullSizeFilename = generateImageFilename(nodeId, processedImage.fileHash, processedImage.extension, 'full');

  // Navigate to public directory
  let publicDirHandle;
  try {
    publicDirHandle = await directoryHandle.getDirectoryHandle('public', { create: true });
  } catch {
    throw new Error('Could not access public directory. Please select the project root directory.');
  }

  // Create/get map directory
  const mapDirHandle = await publicDirHandle.getDirectoryHandle(actualMapName, { create: true });

  // Save thumbnail
  const thumbnailFileHandle = await mapDirHandle.getFileHandle(thumbnailFilename, { create: true });
  const thumbnailWritable = await thumbnailFileHandle.createWritable();
  await thumbnailWritable.write(processedImage.thumbnailBlob);
  await thumbnailWritable.close();

  // Save full-size image
  const fullSizeFileHandle = await mapDirHandle.getFileHandle(fullSizeFilename, { create: true });
  const fullSizeWritable = await fullSizeFileHandle.createWritable();
  await fullSizeWritable.write(processedImage.fullSizeBlob);
  await fullSizeWritable.close();
}

/**
 * Checks if a custom image exists for a node
 */
export function getNodeImageUrl(nodeId, imageUrl) {
  // If imageUrl is a data URL or starts with a map path, it's a custom image
  if (imageUrl && (imageUrl.startsWith('data:') || imageUrl.startsWith('/'))) {
    return imageUrl;
  }
  
  // Otherwise return the default/provided imageUrl
  return imageUrl;
}
