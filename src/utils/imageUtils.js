// src/utils/imageUtils.js

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
 * Validates that an image is square (1:1 aspect ratio)
 */
function validateSquareImage(img) {
  return img.width === img.height;
}

/**
 * Creates a canvas and resizes an image to specified dimensions
 */
function resizeImage(img, width, height) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = width;
  canvas.height = height;
  
  // Draw the image scaled to fit the canvas
  ctx.drawImage(img, 0, 0, width, height);
  
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
 * Processes an image file: validates it's square, creates thumbnail and full-size versions
 */
export async function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        // Validate square aspect ratio
        if (!validateSquareImage(img)) {
          reject(new Error('Sorry, only 1:1 square orientation images are permitted.'));
          return;
        }

        // Read file as array buffer to generate hash
        const arrayBuffer = await file.arrayBuffer();
        const fileHash = await generateFileHash(new Uint8Array(arrayBuffer));
        
        // Determine file extension
        const originalFormat = file.type;
        let extension = 'webp'; // Default to webp
        if (originalFormat === 'image/png') extension = 'png';
        if (originalFormat === 'image/jpeg') extension = 'jpeg';
        
        // Create thumbnail (100x100)
        const thumbnailCanvas = resizeImage(img, 100, 100);
        const thumbnailBlob = await canvasToBlob(thumbnailCanvas, file.type);
        
        // Create full-size (max 500x500, but maintain square)
        const maxSize = Math.min(img.width, 500);
        const fullSizeCanvas = resizeImage(img, maxSize, maxSize);
        const fullSizeBlob = await canvasToBlob(fullSizeCanvas, file.type);
        
        resolve({
          fileHash,
          extension,
          thumbnailBlob,
          fullSizeBlob,
          originalDimensions: { width: img.width, height: img.height }
        });
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image file.'));
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
    // Convert blobs to data URLs for immediate use
    const thumbnailDataUrl = await blobToDataUrl(processedImage.thumbnailBlob);
    const fullSizeDataUrl = await blobToDataUrl(processedImage.fullSizeBlob);

    // For development, we'll use the data URL directly
    // This avoids the complexity of serving files from the filesystem during development
    const result = {
      thumbnailPath: thumbnailDataUrl,
      fullSizePath: fullSizeDataUrl,
      success: true
    };

    // Optionally, still save to filesystem for reference (but don't block on it)
    try {
      await saveToFileSystem(nodeId, processedImage, mapName, directoryHandle);
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
