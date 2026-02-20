import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getDisplayUrl, stripQueryParameters } from "@/shared/lib/mediaUrl";
import { hasLoadedImage, setImageLoadStatus } from "@/shared/lib/preloading";
import type { GeneratedImageWithMetadata } from "../../MediaGallery/types";

interface UseImageLoadingProps {
  image: GeneratedImageWithMetadata;
  displayUrl: string;
  shouldLoad: boolean;
  onImageLoaded?: (id: string) => void;
}

interface UseImageLoadingReturn {
  actualSrc: string | null;
  actualDisplayUrl: string;
  imageLoaded: boolean;
  imageLoading: boolean;
  imageLoadError: boolean;
  handleImageLoad: () => void;
  handleImageError: (e?: React.SyntheticEvent<Element>) => void;
  retryImageLoad: () => void;
  setImageLoading: (loading: boolean) => void;
}

const MAX_RETRIES = 2;

/**
 * Hook to manage image loading state, error handling, and retry logic
 */
export function useImageLoading({
  image,
  displayUrl,
  shouldLoad,
  onImageLoaded,
}: UseImageLoadingProps): UseImageLoadingReturn {
  // Check if this image was already cached by the preloader
  const isPreloadedAndCached = hasLoadedImage(image);

  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [imageRetryCount, setImageRetryCount] = useState<number>(0);
  const [imageLoaded, setImageLoaded] = useState<boolean>(isPreloadedAndCached);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [actualSrc, setActualSrc] = useState<string | null>(null);

  // Track previous image ID to detect actual changes vs re-renders
  // Create a stable identifier using urlIdentity/thumbUrlIdentity (computed at data layer)
  // This prevents resets when only Supabase URL tokens change
  const imageIdentifier = useMemo(
    () => {
      return `${image.id}:${image.urlIdentity || image.url || ''}:${image.thumbUrlIdentity || image.thumbUrl || ''}:${image.updatedAt || ''}`;
    },
     
    [image.id, image.urlIdentity, image.url, image.thumbUrlIdentity, image.thumbUrl, image.updatedAt]
  );

  const prevImageIdentifierRef = useRef<string>(imageIdentifier);

  // Generate display URL with retry cache busting
  const actualDisplayUrl = useMemo(() => {
    if (imageRetryCount > 0) {
      return getDisplayUrl(image.thumbUrl || image.url, true); // Force refresh with cache busting
    }
    return displayUrl;
  }, [displayUrl, image.thumbUrl, image.url, imageRetryCount]);

  // Track successful image load events
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setImageLoading(false);
    // Mark this image as cached in the centralized cache to avoid future skeletons
    try {
      setImageLoadStatus(image, true);
    } catch {
      // Silent: cache status is non-critical optimization; failure won't affect functionality
    }
    // Notify parent that this image has loaded (if callback provided)
    onImageLoaded?.(image.id);
  }, [image, onImageLoaded]);

  // Handle image load error with retry mechanism
  const handleImageError = useCallback((errorEvent?: React.SyntheticEvent<Element>) => {
    const failedSrc = (errorEvent?.target as HTMLImageElement | HTMLVideoElement)?.src || displayUrl;

    // Always reset loading state on error
    setImageLoading(false);

    // Don't retry placeholder URLs or obviously invalid URLs
    if (failedSrc?.includes('/placeholder.svg') || failedSrc?.includes('undefined') || !failedSrc) {
      setImageLoadError(true);
      return;
    }

    if (imageRetryCount < MAX_RETRIES) {
      // Auto-retry with cache busting after a delay
      setTimeout(() => {
        setImageRetryCount(prev => prev + 1);
        // Force reload by clearing and resetting the src
        setActualSrc(null);
        setTimeout(() => {
          const retryUrl = getDisplayUrl(image.thumbUrl || image.url, true); // Force cache bust
          setActualSrc(retryUrl);
        }, 100);
      }, 1000 * (imageRetryCount + 1)); // Exponential backoff
    } else {
      setImageLoadError(true);
    }
  }, [displayUrl, imageRetryCount, image.thumbUrl, image.url]);

  // Manual retry function
  const retryImageLoad = useCallback(() => {
    setImageLoadError(false);
    setImageRetryCount(0);
    setActualSrc(null);
    setImageLoaded(false);
    setImageLoading(false);
  }, []);

  // Reset error state when URL changes (new image)
  useEffect(() => {
    // Check if this is actually a new image
    if (prevImageIdentifierRef.current === imageIdentifier) {
      return; // Same image ID, don't reset
    }

    prevImageIdentifierRef.current = imageIdentifier;

    setImageLoadError(false);
    setImageRetryCount(0);
    // Check if the new image is already cached using centralized function
    const isNewImageCached = hasLoadedImage(image);
    setImageLoaded(isNewImageCached);
    // Only set loading to false if not cached (if cached, we never start loading)
    if (!isNewImageCached) {
      setImageLoading(false);
    }
    // CRITICAL: Reset actualSrc so the loading effect can run for the new image
    setActualSrc(null);
  }, [imageIdentifier, image]);

  // Simplified loading system - responds to progressive loading and URL changes
  useEffect(() => {
    const isPreloaded = hasLoadedImage(image);

    // Update actualSrc when displayUrl changes (for progressive loading transitions)
    // OR when shouldLoad becomes true for the first time
    if (shouldLoad && actualDisplayUrl) {
      // Don't load placeholder URLs - they indicate missing/invalid image data
      if (actualDisplayUrl === '/placeholder.svg') {
        setImageLoadError(true);
        return;
      }

      // Update actualSrc if it's different from actualDisplayUrl AND it's a different file
      // This handles initial load and progressive transitions, but avoids token-only refreshes
      const isActuallyDifferent = actualSrc !== actualDisplayUrl;
      const isDifferentFile = stripQueryParameters(actualSrc) !== stripQueryParameters(actualDisplayUrl);

      if (isActuallyDifferent && isDifferentFile) {
        // Only set loading if the image isn't already cached/loaded
        if (!isPreloaded && !actualSrc) {
          setImageLoading(true);
        }

        setActualSrc(actualDisplayUrl);
      }
    }
  }, [actualSrc, actualDisplayUrl, shouldLoad, image]);

  return {
    actualSrc,
    actualDisplayUrl,
    imageLoaded,
    imageLoading,
    imageLoadError,
    handleImageLoad,
    handleImageError,
    retryImageLoad,
    setImageLoading,
  };
}
