/**
 * Batch Image Loading Hook
 *
 * Wraps useProgressiveImage with common settings for batch view components.
 * Provides a simplified interface for thumbnail → full image loading.
 *
 * Used by batch view components (ShotBatchItemMobile, ShotBatchItemDesktop).
 */

import { useProgressiveImage } from './useProgressiveImage';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';
import { getDisplayUrl } from '@/shared/lib/utils';

interface UseBatchImageLoadingOptions {
  /** Thumb URL for progressive loading */
  thumbUrl: string | null | undefined;
  /** Full image URL */
  imageUrl: string;
  /** Whether to start loading (for lazy loading) */
  shouldLoad?: boolean;
}

interface UseBatchImageLoadingResult {
  /** URL to display (either thumb or full depending on load state) */
  displayImageUrl: string;
  /** Ref to attach to the img element */
  progressiveRef: (element: HTMLElement | null) => void;
  /** Whether full image is loaded */
  isFullLoaded: boolean;
  /** Whether thumbnail is currently showing */
  isThumbShowing: boolean;
}

/**
 * Hook for loading images in batch view with progressive loading support.
 *
 * @param options - Loading options
 * @returns Object with display URL, ref, and loading state
 */
export function useBatchImageLoading({
  thumbUrl,
  imageUrl,
  shouldLoad = true,
}: UseBatchImageLoadingOptions): UseBatchImageLoadingResult {
  const progressiveEnabled = isProgressiveLoadingEnabled();

  const {
    src: progressiveSrc,
    isThumbShowing,
    isFullLoaded,
    ref: progressiveRef,
  } = useProgressiveImage(
    progressiveEnabled ? thumbUrl : null,
    imageUrl,
    {
      priority: false,
      lazy: true,
      enabled: progressiveEnabled && shouldLoad,
      crossfadeMs: 200,
    }
  );

  // Use progressive src if available, otherwise fallback to display URL
  const displayImageUrl = progressiveEnabled && progressiveSrc
    ? progressiveSrc
    : getDisplayUrl(thumbUrl || imageUrl);

  return {
    displayImageUrl,
    progressiveRef,
    isFullLoaded,
    isThumbShowing,
  };
}
