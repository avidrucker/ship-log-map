// src/utils/imageUtils.js
import { printDebug } from '../utils/debug.js';

/**
 * Generates a simple hash from a file buffer using browser APIs
 */
async function generateFileHash(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12);
}

function validateImageDimensions(img) {
  return img.width > 0 && img.height > 0;
}

function cropToSquare(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const squareSize = Math.min(img.width, img.height);
  const cropX = (img.width - squareSize) / 2;
  const cropY = (img.height - squareSize) / 2;
  printDebug(`✂️ Cropping: taking ${squareSize}x${squareSize} square from center (offset: ${cropX}, ${cropY})`);
  canvas.width = squareSize;
  canvas.height = squareSize;
  ctx.drawImage(img, cropX, cropY, squareSize, squareSize, 0, 0, squareSize, squareSize);
  return canvas;
}

function resizeImage(source, width, height) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, format = 'image/webp', quality = 0.85) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, format, quality);
  });
}

/** ⬇️ NEW: export these helpers so other modules can reuse them */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Create a thumbnail data URL (square) from a Blob */
export async function blobToThumbnailDataUrl(blob, size = 100, mimeOut = 'image/webp', quality = 0.85) {
  const imgUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = imgUrl;
    });
    const squareCanvas = cropToSquare(img);
    const thumbCanvas = resizeImage(squareCanvas, size, size);
    const outBlob = await canvasToBlob(thumbCanvas, mimeOut, quality);
    return await blobToDataUrl(outBlob);
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

/** Transcode a data URL (or Blob) to WebP with max dimension clamped */
export async function dataUrlOrBlobToWebpDataUrl(src, maxDim = 2048, quality = 0.82) {
  let blob;
  if (typeof src === 'string' && src.startsWith('data:')) {
    // Convert data URL -> Blob
    const byteString = atob(src.split(',')[1]);
    const mimeString = src.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    blob = new Blob([ab], { type: mimeString });
  } else if (src instanceof Blob) {
    blob = src;
  } else {
    return src; // unknown – just pass through
  }

  const imgUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = imgUrl;
    });

    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const outW = Math.max(1, Math.round(img.width * scale));
    const outH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    canvas.getContext('2d').drawImage(img, 0, 0, outW, outH);

    const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    return await blobToDataUrl(outBlob);
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

/** (existing) */
export async function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        if (!validateImageDimensions(img)) {
          reject(new Error('Invalid image: Image has zero width or height.'));
          return;
        }
        printDebug(`📐 Processing image: ${img.width}x${img.height} pixels`);
        if (img.width === img.height) {
          printDebug(`✅ Image is already square, no cropping needed`);
        } else if (img.width > img.height) {
          printDebug(`📏 Image is wider than tall (${img.width}x${img.height}), will crop horizontally to ${img.height}x${img.height}`);
        } else {
          printDebug(`📏 Image is taller than wide (${img.width}x${img.height}), will crop vertically to ${img.width}x${img.width}`);
        }

        const arrayBuffer = await file.arrayBuffer();
        const fileHash = await generateFileHash(new Uint8Array(arrayBuffer));

        const originalFormat = file.type;
        let extension = 'webp';
        if (originalFormat === 'image/png') extension = 'png';
        if (originalFormat === 'image/jpeg') extension = 'jpeg';

        const squareCanvas = cropToSquare(img);
        const squareSize = squareCanvas.width;

        printDebug(`✂️ Cropped to square: ${squareSize}x${squareSize} pixels`);

        const thumbnailCanvas = resizeImage(squareCanvas, 100, 100);
        const thumbnailBlob = await canvasToBlob(thumbnailCanvas, file.type);

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
    img.onerror = () => reject(new Error('Failed to load image file. The file may be corrupted or not a valid image format.'));
    img.src = URL.createObjectURL(file);
  });
}

export function getCurrentMapName(mapName = null) {
  if (mapName) return mapName;
  try { return localStorage.getItem('ship_log_map_name_v1') || 'default_map'; }
  catch { return 'default_map'; }
}

export function generateImageFilename(nodeId, fileHash, extension, type = 'full') {
  const suffix = type === 'thumbnail' ? '_thumb' : '';
  return `${nodeId}_${fileHash}${suffix}.${extension}`;
}

export function generateImagePath(mapName, filename) {
  return `${mapName}/${filename}`;
}

/** (old internal) now exported above as blobToDataUrl */
// function blobToDataUrl(...) { ... }

export async function saveImageFiles(nodeId, processedImage, mapName = null, directoryHandle = null) {
  try {
    const actualMapName = getCurrentMapName(mapName);
    const imageFilename = generateImageFilename(nodeId, processedImage.fileHash, processedImage.extension, 'full');

    // Convert blobs to data URLs - but only cache the thumbnail to save localStorage space
    const thumbnailDataUrl = await blobToDataUrl(processedImage.thumbnailBlob);
    const fullSizeDataUrl = await blobToDataUrl(processedImage.fullSizeBlob);
    printDebug(`📊 Image sizes - Thumbnail: ${thumbnailDataUrl.length} chars, Full: ${fullSizeDataUrl.length} chars`);

    const { imageCache } = await import('./imageLoader.js');
    const cacheKey = `${actualMapName}:${imageFilename}`;
    imageCache.set(cacheKey, thumbnailDataUrl);
    printDebug(`💾 Cached thumbnail for: ${cacheKey} (${thumbnailDataUrl.length} chars)`);

    const result = {
      imagePath: imageFilename,
      success: true,
      immediateImageUrl: fullSizeDataUrl
    };

    try { await saveToFileSystem(nodeId, processedImage, actualMapName, directoryHandle); }
    catch (fsError) { console.warn('Could not save to filesystem (this is optional for development):', fsError.message); }

    return result;
  } catch (error) {
    console.error('Error processing image files:', error);
    throw error;
  }
}

async function saveToFileSystem(nodeId, processedImage, mapName = null, directoryHandle = null) {
  if (!window.showDirectoryPicker || !directoryHandle) {
    throw new Error('File System Access API is not supported or directory access not granted.');
  }
  const actualMapName = getCurrentMapName(mapName);
  const thumbnailFilename = generateImageFilename(nodeId, processedImage.fileHash, processedImage.extension, 'thumbnail');
  const fullSizeFilename = generateImageFilename(nodeId, processedImage.fileHash, processedImage.extension, 'full');

  let publicDirHandle;
  try { publicDirHandle = await directoryHandle.getDirectoryHandle('public', { create: true }); }
  catch { throw new Error('Could not access public directory. Please select the project root directory.'); }

  const mapDirHandle = await publicDirHandle.getDirectoryHandle(actualMapName, { create: true });

  const thumbnailFileHandle = await mapDirHandle.getFileHandle(thumbnailFilename, { create: true });
  const thumbnailWritable = await thumbnailFileHandle.createWritable();
  await thumbnailWritable.write(processedImage.thumbnailBlob);
  await thumbnailWritable.close();

  const fullSizeFileHandle = await mapDirHandle.getFileHandle(fullSizeFilename, { create: true });
  const fullSizeWritable = await fullSizeFileHandle.createWritable();
  await fullSizeWritable.write(processedImage.fullSizeBlob);
  await fullSizeWritable.close();
}

export function getNodeImageUrl(nodeId, imageUrl) {
  if (imageUrl && (imageUrl.startsWith('data:') || imageUrl.startsWith('/'))) return imageUrl;
  return imageUrl;
}
