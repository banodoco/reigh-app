/**
 * Image Load Tracker
 *
 * Tracks which images have been loaded (preloaded or displayed).
 * This is NOT a cache - it doesn't store image data, just tracks load status.
 * The browser manages its own image cache; we just track what we've attempted to load.
 *
 * Used by:
 * - Preloading system: marks images as loaded after preload completes
 * - Progressive loading: checks if image was preloaded to skip animation delay
 */

// Tracker size limits based on device capabilities
const getTrackerConfig = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const hasLowMemory = typeof navigator !== 'undefined' &&
    'deviceMemory' in navigator &&
    (navigator as { deviceMemory?: number }).deviceMemory !== undefined &&
    (navigator as { deviceMemory: number }).deviceMemory <= 4;

  if (isMobile || hasLowMemory) {
    return { maxImages: 100, maxUrls: 150 };
  }
  return { maxImages: 300, maxUrls: 500 };
};

// Track loaded images by ID
const loadedImagesById = new Map<string, boolean>();

// Track loaded images by URL (for progressive loading)
const loadedImagesByUrl = new Map<string, { loadedAt: number; width?: number; height?: number }>();

/**
 * Evict oldest entries from a Map until it's under the limit.
 * Maps maintain insertion order, so we delete from the beginning.
 */
const evictOldestEntries = <K, V>(map: Map<K, V>, maxSize: number, name: string): number => {
  if (map.size <= maxSize) return 0;

  const toEvict = map.size - maxSize;
  const keys = Array.from(map.keys()).slice(0, toEvict);

  keys.forEach(key => map.delete(key));

  console.log(`[ImageLoadTracker] Evicted ${toEvict} oldest entries from ${name}, new size: ${map.size}`);
  return toEvict;
};

/**
 * Enforce tracker limits - call this periodically or after adding entries
 */
export const enforceLoadTrackerLimits = (): void => {
  const config = getTrackerConfig();
  evictOldestEntries(loadedImagesById, config.maxImages, 'loadedImagesById');
  evictOldestEntries(loadedImagesByUrl, config.maxUrls, 'loadedImagesByUrl');
};

/** Image with an id property */
interface TrackableImage {
  id: string;
  __memoryCached?: boolean; // Legacy field, kept for backwards compatibility
}

/**
 * Mark an image as loaded or not loaded
 */
export const setImageLoadStatus = (image: TrackableImage, isLoaded: boolean = true): void => {
  const imageId = image.id;
  if (!imageId) {
    console.warn('[ImageLoadTracker] Cannot track image without ID:', image);
    return;
  }

  // Update tracker
  loadedImagesById.set(imageId, isLoaded);

  // Update object property for backwards compatibility (will be phased out)
  image.__memoryCached = isLoaded;

  // Enforce limits after adding (debounced check - only every 50 entries)
  if (isLoaded && loadedImagesById.size % 50 === 0) {
    enforceLoadTrackerLimits();
  }
};

/**
 * Remove images from tracker (for cleanup when pages are evicted)
 */
const removeLoadedImages = (imageIds: string[]): number => {
  let removedCount = 0;

  imageIds.forEach(imageId => {
    if (loadedImagesById.has(imageId)) {
      loadedImagesById.delete(imageId);
      removedCount++;
    }
  });

  return removedCount;
};

/**
 * Clear load status for a set of images (used when evicting pages from cache)
 */
export const clearLoadedImages = (images: Array<{ id: string }>): number => {
  const imageIds = images
    .map(img => img.id)
    .filter(id => id);

  return removeLoadedImages(imageIds);
};

/**
 * Clear all tracked images (used on project switch)
 */
export const clearAllLoadedImages = (reason: string = 'project switch'): number => {
  const prevSize = loadedImagesById.size;
  loadedImagesById.clear();

  console.log(`[ImageLoadTracker] Cleared all for ${reason}, removed ${prevSize} entries`);
  return prevSize;
};

/**
 * Check if an image has been loaded (by URL or image object)
 */
export const hasLoadedImage = (urlOrImage: string | TrackableImage): boolean => {
  // URL string
  if (typeof urlOrImage === 'string') {
    return loadedImagesByUrl.has(urlOrImage);
  }

  // Image object
  const imageId = urlOrImage?.id;
  if (!imageId) {
    return false;
  }

  const isLoaded = loadedImagesById.get(imageId) === true;

  // Sync object property if needed (backwards compatibility)
  if (isLoaded && urlOrImage.__memoryCached !== true) {
    urlOrImage.__memoryCached = true;
  }

  return isLoaded;
};

/**
 * Mark an image as loaded (by URL or image object)
 */
export const markImageLoaded = (
  urlOrImage: string | TrackableImage,
  metadata?: { width?: number; height?: number }
): void => {
  // URL string
  if (typeof urlOrImage === 'string') {
    loadedImagesByUrl.set(urlOrImage, {
      loadedAt: Date.now(),
      ...metadata
    });
    // Enforce limits after adding (debounced check - only every 50 entries)
    if (loadedImagesByUrl.size % 50 === 0) {
      enforceLoadTrackerLimits();
    }
    return;
  }

  // Image object
  setImageLoadStatus(urlOrImage, true);
};

/**
 * Get tracker statistics for debugging
 */
export const getLoadTrackerStats = (): {
  byId: number;
  byUrl: number;
  limits: { maxImages: number; maxUrls: number };
} => {
  const config = getTrackerConfig();
  return {
    byId: loadedImagesById.size,
    byUrl: loadedImagesByUrl.size,
    limits: config,
  };
};

// =============================================================================
// LEGACY ALIASES (for backwards compatibility during migration)
// These will be removed once all imports are updated
// =============================================================================

/** @deprecated Use setImageLoadStatus */
export const setImageCacheStatus = setImageLoadStatus;

/** @deprecated Use hasLoadedImage */
export const isImageCached = hasLoadedImage;

/** @deprecated Use markImageLoaded */
export const markImageAsCached = markImageLoaded;

/** @deprecated Use clearLoadedImages */
export const clearCacheForImages = clearLoadedImages;

/** @deprecated Use clearAllLoadedImages */
export const clearCacheForProjectSwitch = clearAllLoadedImages;

/** @deprecated Use enforceLoadTrackerLimits */
export const enforceCacheLimits = enforceLoadTrackerLimits;

/** @deprecated Use getLoadTrackerStats */
export const getCacheStats = getLoadTrackerStats;
