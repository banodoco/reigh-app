import { debugConfig } from '@/shared/lib/debug/debugConfig';
import type { TrackableImage, TrackerLimits } from './types';

const getTrackerConfig = (): TrackerLimits => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const hasLowMemory =
    typeof navigator !== 'undefined' &&
    'deviceMemory' in navigator &&
    (navigator as { deviceMemory?: number }).deviceMemory !== undefined &&
    (navigator as { deviceMemory: number }).deviceMemory <= 4;

  if (isMobile || hasLowMemory) {
    return { maxImages: 100, maxUrls: 150 };
  }
  return { maxImages: 300, maxUrls: 500 };
};

const loadedImagesById = new Map<string, boolean>();

const loadedImagesByUrl = new Map<
  string,
  { loadedAt: number; width?: number; height?: number; element?: HTMLImageElement }
>();

const shouldLogTrackerDebug = (): boolean =>
  import.meta.env.DEV && debugConfig.isEnabled('imageLoading');

/**
 * Evict oldest entries from a Map until it's under the limit.
 * Maps maintain insertion order, so we delete from the beginning.
 */
const evictOldestEntries = <K, V>(
  map: Map<K, V>,
  maxSize: number,
  name: string
): number => {
  if (map.size <= maxSize) return 0;

  const toEvict = map.size - maxSize;
  const keys = Array.from(map.keys()).slice(0, toEvict);

  keys.forEach((key) => map.delete(key));

  if (shouldLogTrackerDebug()) {
    console.log(
      `[ImageLoadTracker] Evicted ${toEvict} oldest entries from ${name}, new size: ${map.size}`
    );
  }
  return toEvict;
};

const enforceLoadTrackerLimits = (): void => {
  const config = getTrackerConfig();
  evictOldestEntries(loadedImagesById, config.maxImages, 'loadedImagesById');
  evictOldestEntries(loadedImagesByUrl, config.maxUrls, 'loadedImagesByUrl');
};

export const setImageLoadStatus = (
  image: TrackableImage,
  isLoaded: boolean = true
): void => {
  const imageId = image.id;
  if (!imageId) {
    return;
  }

  // Update tracker
  loadedImagesById.set(imageId, isLoaded);

  // Enforce limits in coarse batches to avoid per-write overhead.
  if (isLoaded && loadedImagesById.size % 50 === 0) {
    enforceLoadTrackerLimits();
  }
};

const removeLoadedImages = (imageIds: string[]): number => {
  let removedCount = 0;

  imageIds.forEach((imageId) => {
    if (loadedImagesById.has(imageId)) {
      loadedImagesById.delete(imageId);
      removedCount++;
    }
  });

  return removedCount;
};

export const clearLoadedImages = (images: Array<{ id: string }>): number => {
  const imageIds = images.map((img) => img.id).filter((id) => id);

  return removeLoadedImages(imageIds);
};

export const clearAllLoadedImages = (
  reason: string = 'project switch'
): number => {
  const prevSize = loadedImagesById.size;
  loadedImagesById.clear();
  loadedImagesByUrl.clear();

  if (shouldLogTrackerDebug()) {
    console.log(
      `[ImageLoadTracker] Cleared all for ${reason}, removed ${prevSize} entries`
    );
  }
  return prevSize;
};

export const hasLoadedImage = (urlOrImage: string | TrackableImage): boolean => {
  if (typeof urlOrImage === 'string') {
    return loadedImagesByUrl.has(urlOrImage);
  }

  const imageId = urlOrImage?.id;
  if (!imageId) {
    return false;
  }

  return loadedImagesById.get(imageId) === true;
};

export const markImageLoaded = (
  urlOrImage: string | TrackableImage,
  metadata?: { width?: number; height?: number; element?: HTMLImageElement }
): void => {
  if (typeof urlOrImage === 'string') {
    loadedImagesByUrl.set(urlOrImage, {
      loadedAt: Date.now(),
      ...metadata,
    });
    if (loadedImagesByUrl.size % 50 === 0) {
      enforceLoadTrackerLimits();
    }
    return;
  }

  setImageLoadStatus(urlOrImage, true);
};

export const getLoadTrackerStats = (): {
  byId: number;
  byUrl: number;
  limits: TrackerLimits;
} => {
  const config = getTrackerConfig();
  return {
    byId: loadedImagesById.size,
    byUrl: loadedImagesByUrl.size,
    limits: config,
  };
};

export const getImageElement = (url: string): HTMLImageElement | undefined => {
  return loadedImagesByUrl.get(url)?.element;
};
