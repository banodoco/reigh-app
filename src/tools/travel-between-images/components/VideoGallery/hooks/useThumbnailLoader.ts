import { useState, useEffect, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { hasLoadedImage, getImageElement } from '@/shared/lib/preloading';

/**
 * Check if the browser already has the image decoded/cached.
 * First checks stored ref from preloading, then falls back to creating a test Image.
 */
const isInBrowserCache = (url: string): boolean => {
  if (!url) return false;

  // First check if we have a stored reference from preloading
  const storedImg = getImageElement(url);
  if (storedImg && storedImg.complete && storedImg.naturalWidth > 0) {
    return true;
  }

  // Fallback to creating a new image element to test
  try {
    const testImg = new Image();
    testImg.src = url;

    // For cached images, complete should be true immediately
    // and naturalWidth should be > 0
    const isCached = testImg.complete && testImg.naturalWidth > 0;

    // Additional check: if it's complete but no dimensions, might be a broken image
    if (testImg.complete && testImg.naturalWidth === 0 && testImg.naturalHeight === 0) {
      return false;
    }

    return isCached;
  } catch {
    return false;
  }
};

/**
 * Hook to manage thumbnail loading state with cache detection.
 * Uses the shared preloading tracker to check if images have been preloaded.
 */
export const useThumbnailLoader = (video: GenerationRow) => {
  const hasThumbnail = video.thumbUrl &&
    video.thumbUrl !== video.location &&
    video.thumbUrl !== video.imageUrl;

  // Stable initial cache check - only computed once on mount
  const initialCacheStatus = useMemo(() => {
    if (!hasThumbnail || !video.thumbUrl) {
      return { inPreloaderCache: false, inBrowserCache: false, isInitiallyCached: false };
    }

    const inPreloaderCache = hasLoadedImage(video.thumbUrl);
    const inBrowserCache = isInBrowserCache(video.thumbUrl);
    const isInitiallyCached = inPreloaderCache || inBrowserCache;

    return { inPreloaderCache, inBrowserCache, isInitiallyCached };
  }, [hasThumbnail, video.thumbUrl, video.id]);

  // Initialize as true if cached to prevent flash - the onLoad will confirm it anyway
  // This is the key fix for preventing flash on back navigation - trust the cache check
  const [thumbnailLoaded, setThumbnailLoaded] = useState(() => {
    // If initially cached, start as loaded to prevent any flash
    if (initialCacheStatus.isInitiallyCached) {
      return true;
    }
    // Also do an immediate sync check in case browser has it cached
    if (hasThumbnail && video.thumbUrl) {
      return isInBrowserCache(video.thumbUrl);
    }
    return false;
  });
  const [thumbnailError, setThumbnailError] = useState(false);

  // Live cache check for updates after preloader runs
  const currentCacheStatus = useMemo(() => {
    if (!hasThumbnail || !video.thumbUrl) {
      return { inPreloaderCache: false, inBrowserCache: false, isCurrentlyCached: false };
    }

    const inPreloaderCache = hasLoadedImage(video.thumbUrl);
    const inBrowserCache = isInBrowserCache(video.thumbUrl);
    const isCurrentlyCached = inPreloaderCache || inBrowserCache;

    return { inPreloaderCache, inBrowserCache, isCurrentlyCached };
  }, [hasThumbnail, video.thumbUrl]);

  // Update state when cache status changes (e.g., when preloader completes)
  useEffect(() => {
    if (currentCacheStatus.isCurrentlyCached && !thumbnailLoaded) {
      setThumbnailLoaded(true);
    }
  }, [currentCacheStatus.isCurrentlyCached, thumbnailLoaded, video.thumbUrl]);

  // Listen for global cache updates (from useVideoGalleryPreloader)
  useEffect(() => {
    const handleCacheUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.updatedUrls?.includes(video.thumbUrl)) return;

      const inPreloaderCache = hasLoadedImage(video.thumbUrl);
      const inBrowserCache = isInBrowserCache(video.thumbUrl);
      const isCached = inPreloaderCache || inBrowserCache;

      if (isCached && !thumbnailLoaded) {
        setThumbnailLoaded(true);
      }
    };

    window.addEventListener('videogallery-cache-updated', handleCacheUpdate);
    return () => window.removeEventListener('videogallery-cache-updated', handleCacheUpdate);
  }, [video.thumbUrl, thumbnailLoaded]);

  return {
    thumbnailLoaded,
    setThumbnailLoaded,
    thumbnailError,
    setThumbnailError,
    hasThumbnail,
    // Expose cache debug info
    isInitiallyCached: initialCacheStatus.isInitiallyCached,
    inPreloaderCache: currentCacheStatus.inPreloaderCache,
    inBrowserCache: currentCacheStatus.inBrowserCache
  };
};
