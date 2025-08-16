// src/utils/imageLoader.js
import { printDebug } from "./debug.js"; // printWarn

// Storage keys
const IMAGE_CACHE_KEY = 'shipLogImageCache';
const CDN_BASE_URL_KEY = 'shipLogCdnBaseUrl';

// Default "Image not found" SVG
const IMAGE_NOT_FOUND_SVG = `data:image/svg+xml;base64,${btoa(`
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#f5f5f5" stroke="#ccc" stroke-width="2"/>
  <text x="50" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">
    Image
  </text>
  <text x="50" y="50" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">
    not
  </text>
  <text x="50" y="65" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">
    found
  </text>
  <path d="M25 25 L75 75 M75 25 L25 75" stroke="#ff6b6b" stroke-width="2"/>
</svg>
`)}`;

// Image cache management
class ImageCache {
  constructor() {
    this.cache = new Map();
    this.loadCache();
  }

  loadCache() {
    printDebug(`💾 [ImageCache] Loading cache from localStorage...`);
    try {
      const cached = localStorage.getItem(IMAGE_CACHE_KEY);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        const entryCount = Object.keys(parsedCache).length;
        printDebug(`💾 [ImageCache] Found ${entryCount} cached entries in localStorage`);
        
        // Clear the current cache and load from storage without triggering saves
        this.cache.clear();
        Object.entries(parsedCache).forEach(([key, value]) => {
          this.cache.set(key, value); // This won't trigger saveCache since we're in constructor
          printDebug(`💾 [ImageCache] Loaded cache entry: "${key}" (${value?.length || 0} chars)`);
        });
        printDebug(`✅ [ImageCache] Cache loaded successfully with ${this.cache.size} entries`);
      } else {
        printDebug(`💾 [ImageCache] No cached entries found in localStorage`);
      }
    } catch (error) {
      console.warn('Failed to load image cache from localStorage:', error);
    }
  }

  saveCache() {
    try {
      const cacheObject = {};
      this.cache.forEach((value, key) => {
        cacheObject[key] = value;
      });
      const serialized = JSON.stringify(cacheObject);
      const localStorageUsage = getLocalStorageUsage();
      printDebug(`💾 [ImageCache] Attempting to save cache with ${Object.keys(cacheObject).length} entries, total size: ${serialized.length} characters`);
      printDebug(`📊 [ImageCache] Current localStorage usage: ${Math.round(localStorageUsage / 1024)}KB`);
      
      localStorage.setItem(IMAGE_CACHE_KEY, serialized);
      printDebug(`✅ [ImageCache] Cache saved successfully to localStorage`);
    } catch (error) {
      console.error('❌ [ImageCache] Failed to save image cache to localStorage:', error);
      if (error.name === 'QuotaExceededError') {
        console.warn('🚨 [ImageCache] localStorage quota exceeded. Consider reducing cache size or clearing old entries.');
        // Clear the cache to free up space
        this.cache.clear();
        try {
          localStorage.removeItem(IMAGE_CACHE_KEY);
        } catch (clearError) {
          console.error('Failed to clear cache after quota exceeded:', clearError);
        }
      }
    }
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value) {
    //// printDebug(`💾 [ImageCache] Setting cache entry: "${key}" (value length: ${value?.length || 0})`);
    this.cache.set(key, value);
    this.saveCache();
  }

  has(key) {
    const exists = this.cache.has(key);
    //// printDebug(`🔍 [ImageCache] Checking if key exists: "${key}" -> ${exists ? 'YES' : 'NO'}`);
    return exists;
  }

  clear() {
    this.cache.clear();
    try {
      localStorage.removeItem(IMAGE_CACHE_KEY);
    } catch (error) {
      console.warn('Failed to clear image cache from localStorage:', error);
    }
  }

  size() {
    return this.cache.size;
  }
}

// Global image cache instance
const imageCache = new ImageCache();

// CDN base URL management
export function setCdnBaseUrl(url) {
  try {
    localStorage.setItem(CDN_BASE_URL_KEY, url);
  } catch (error) {
    console.warn('Failed to save CDN base URL:', error);
  }
}

export function getCdnBaseUrl() {
  try {
    const url = localStorage.getItem(CDN_BASE_URL_KEY) || '';
    printDebug(`🌐 [ImageLoader] Retrieved CDN base URL from localStorage: "${url}"`);
    return url;
  } catch (error) {
    console.warn('Failed to load CDN base URL:', error);
    return '';
  }
}

// Convert image file name to URL-encoded format for CDN
function encodeImageFileName(fileName) {
  // Handle common image extensions and encoding
  return encodeURIComponent(fileName);
}

// Load image with cache-first, CDN-second strategy
export async function loadImageWithFallback(imagePath, mapName = '', cdnBaseUrlOverride = undefined) {
  printDebug(`🖼️ [ImageLoader] Loading image: "${imagePath}" for map: "${mapName}" (override CDN: ${cdnBaseUrlOverride || 'none'})`);
  
  if (imagePath.startsWith('data:')) {
    printDebug(`🖼️ [ImageLoader] Image is already a data URL, returning as-is`);
    return imagePath;
  }
  
  const cacheKey = `${mapName}:${imagePath}`;
  printDebug(`🖼️ [ImageLoader] Checking cache with key: "${cacheKey}"`);
  
  if (imageCache.has(cacheKey)) {
    const cachedImage = imageCache.get(cacheKey);
    printDebug(`✅ [ImageLoader] Found in cache! Returning cached image (${cachedImage.length > 100 ? 'data URL' : 'short value'})`);
    return cachedImage;
  } else {
    printDebug(`❌ [ImageLoader] Not found in cache. Cache currently has ${imageCache.size()} entries.`);
    printDebug(`🔍 [ImageLoader] Cache keys:`, Array.from(imageCache.cache.keys()));
  }

  // Prefer explicit override (fresh in memory) over persisted localStorage value
  const cdnBaseUrl = cdnBaseUrlOverride !== undefined ? cdnBaseUrlOverride : getCdnBaseUrl();
  printDebug(`🌐 [ImageLoader] Effective CDN base URL: "${cdnBaseUrl}" (source: ${cdnBaseUrlOverride !== undefined ? 'override' : 'localStorage'})`);
  
  if (cdnBaseUrl) {
    // Validate the CDN URL and suggest corrections
    const validation = validateCdnUrl(cdnBaseUrl);
    if (!validation.isValid) {
      console.warn(`⚠️ [ImageLoader] CDN URL validation issues:`, validation.issues);
      if (validation.suggestion) {
        printDebug(`💡 [ImageLoader] Suggested CDN URL: "${validation.suggestedUrl}"`);
      }
    }
    
    try {
      // Use the suggested URL if validation provided one, otherwise use original
      const effectiveCdnUrl = validation.suggestedUrl || cdnBaseUrl;
      
      // Clean up the CDN base URL - remove any trailing slashes
      let cleanCdnUrl = effectiveCdnUrl.replace(/\/$/, '');
      
      const cdnUrl = `${cleanCdnUrl}/${encodeImageFileName(imagePath)}`;
      printDebug(`🌐 [ImageLoader] Attempting to load from CDN URL: "${cdnUrl}"`);
      
      const imageDataUrl = await loadImageFromUrl(cdnUrl);
      printDebug(`✅ [ImageLoader] Successfully loaded from CDN! Image size: ${imageDataUrl.length} characters`);
      
      // Cache successful load
      imageCache.set(cacheKey, imageDataUrl);
      printDebug(`💾 [ImageLoader] Cached image with key: "${cacheKey}"`);
      return imageDataUrl;
    } catch (error) {
      console.warn(`❌ [ImageLoader] Failed to load image from CDN: ${imagePath}`, error);
      printDebug(`🔄 [ImageLoader] Will fallback to "image not found" SVG`);
    }
  } else {
    printDebug(`⚠️ [ImageLoader] No CDN base URL configured, skipping CDN lookup`);
  }
  
  // Fallback to "image not found" SVG
  printDebug(`🔄 [ImageLoader] Using fallback "image not found" SVG for: "${imagePath}"`);
  const notFoundSvg = IMAGE_NOT_FOUND_SVG;
  imageCache.set(cacheKey, notFoundSvg);
  printDebug(`💾 [ImageLoader] Cached fallback SVG with key: "${cacheKey}"`);
  return notFoundSvg;
}

// Load image from URL and convert to data URL
async function loadImageFromUrl(url) {
  printDebug(`🌐 [ImageLoader] Starting to load image from URL: "${url}"`);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      printDebug(`✅ [ImageLoader] Image loaded successfully from: "${url}"`);
      printDebug(`📐 [ImageLoader] Image dimensions: ${img.width}x${img.height}`);
      
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = img.width;
        canvas.height = img.height;
        
        ctx.drawImage(img, 0, 0);
        
        const dataUrl = canvas.toDataURL('image/png');
        printDebug(`🎨 [ImageLoader] Converted to data URL, size: ${dataUrl.length} characters`);
        resolve(dataUrl);
      } catch (error) {
        console.error(`❌ [ImageLoader] Failed to convert image to canvas/data URL:`, error);
        reject(error);
      }
    };
    
    img.onerror = () => {
      console.error(`❌ [ImageLoader] Failed to load image from URL: "${url}"`);
      printDebug(`🔍 [ImageLoader] Check if the URL is accessible and the image exists`);
      reject(new Error(`Failed to load image from ${url}`));
    };
    
    printDebug(`🔄 [ImageLoader] Setting img.src to: "${url}"`);
    img.src = url;
  });
}

// Preload images for a list of nodes
export async function preloadNodeImages(nodes, mapName = '', cdnBaseUrlOverride = undefined) {
  const promises = nodes
    .filter(node => node.imageUrl && !node.imageUrl.startsWith('data:'))
    .map(async (node) => {
      try {
        const imageUrl = await loadImageWithFallback(node.imageUrl, mapName, cdnBaseUrlOverride);
        return { nodeId: node.id, imageUrl };
      } catch (error) {
        console.warn(`Failed to preload image for node ${node.id}:`, error);
        return { nodeId: node.id, imageUrl: IMAGE_NOT_FOUND_SVG };
      }
    });

  const results = await Promise.allSettled(promises);
  return results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
}

// Clear all image caches
export function clearAllImageCaches() {
  imageCache.clear();
  
  // Also clear grayscale cache if it exists
  try {
    localStorage.removeItem('shipLogGrayscaleCache');
  } catch (error) {
    console.warn('Failed to clear grayscale cache:', error);
  }
}

// Get cache statistics
export function getImageCacheStats() {
  return {
    totalImages: imageCache.size(),
    cdnBaseUrl: getCdnBaseUrl(),
    cacheSize: JSON.stringify(Array.from(imageCache.cache.entries())).length
  };
}

// Export the cache instance for direct access if needed
export { imageCache };

// Validate and suggest correct CDN URLs
export function validateCdnUrl(url) {
  if (!url) {
    return {
      isValid: false,
      suggestion: '',
      issues: ['No URL provided']
    };
  }

  const issues = [];
  let suggestion = url;

  // Check for GitHub repository URLs that need fixing
  if (url.includes('github.com') && url.includes('/tree/')) {
    issues.push('GitHub repository URL detected - should be converted to GitHub Pages URL');
    
    // Convert github.com/user/repo/tree/branch to user.github.io/repo
    const githubRepoMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+(.*)/);
    if (githubRepoMatch) {
      const [, username, repoName, remainingPath] = githubRepoMatch;
      suggestion = `https://${username}.github.io/${repoName}${remainingPath || ''}`;
      printDebug(`🔧 [URLValidator] Suggested GitHub Pages URL: "${suggestion}"`);
    }
  }

  // Check for trailing slashes
  if (url.endsWith('/')) {
    suggestion = suggestion.replace(/\/$/, '');
  }

  // Check if URL is accessible (this would need to be async, but for now just validate format)
  const urlPattern = /^https?:\/\/.+/;
  if (!urlPattern.test(url)) {
    issues.push('URL must start with http:// or https://');
  }

  return {
    isValid: issues.length === 0,
    suggestion: suggestion !== url ? suggestion : null,
    issues,
    originalUrl: url,
    suggestedUrl: suggestion
  };
}

// Check localStorage usage
function getLocalStorageUsage() {
  let total = 0;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      total += localStorage[key].length + key.length;
    }
  }
  return total;
}
