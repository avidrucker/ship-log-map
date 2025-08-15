// src/utils/grayscaleUtils.js

/**
 * Converts an image to grayscale using canvas manipulation
 * Returns a data URL of the grayscale image
 */
export function convertImageToGrayscale(imageUrl) {
  return new Promise((resolve, reject) => {
    // Create a new image element
    const img = new Image();
    
    // Handle CORS for external images
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
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
        resolve(grayscaleDataUrl);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // Load the image
    img.src = imageUrl;
  });
}

/**
 * Cache for grayscale images to avoid reprocessing
 */
const grayscaleCache = new Map();

/**
 * Get grayscale version of an image with caching
 */
export async function getGrayscaleImage(imageUrl) {
  // Check cache first
  if (grayscaleCache.has(imageUrl)) {
    return grayscaleCache.get(imageUrl);
  }
  
  try {
    const grayscaleUrl = await convertImageToGrayscale(imageUrl);
    grayscaleCache.set(imageUrl, grayscaleUrl);
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
  grayscaleCache.clear();
}
