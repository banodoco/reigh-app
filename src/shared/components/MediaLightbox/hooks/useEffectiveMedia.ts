/**
 * useEffectiveMedia - Computes effective URLs and dimensions for media display
 *
 * Handles:
 * - effectiveVideoUrl: Video URL respecting active variant
 * - effectiveMediaUrl: Image URL respecting active variant
 * - effectiveImageDimensions: Guaranteed dimensions with fallbacks
 */

import { useMemo } from 'react';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';

interface UseEffectiveMediaProps {
  isVideo: boolean;
  activeVariant: {
    id: string;
    location: string;
    thumbnail_url?: string;
    is_primary?: boolean;
  } | null;
  effectiveImageUrl: string | undefined;
  imageDimensions: { width: number; height: number } | null;
  projectAspectRatio: string | undefined;
}

interface UseEffectiveMediaReturn {
  effectiveVideoUrl: string | undefined;
  effectiveMediaUrl: string | undefined;
  effectiveImageDimensions: { width: number; height: number };
}

export function useEffectiveMedia({
  isVideo,
  activeVariant,
  effectiveImageUrl,
  imageDimensions,
  projectAspectRatio,
}: UseEffectiveMediaProps): UseEffectiveMediaReturn {
  // Get the effective video URL (active variant or current media)
  const effectiveVideoUrl = useMemo(() => {
    if (isVideo && activeVariant) {
      return activeVariant.location;
    }
    return effectiveImageUrl;
  }, [isVideo, activeVariant, effectiveImageUrl]);

  // For images, use the active variant's location when a variant is explicitly selected
  const effectiveMediaUrl = useMemo(() => {

    // If an active variant is set (any variant, including primary), use its location
    if (activeVariant && activeVariant.location) {
      return activeVariant.location;
    }
    // Otherwise use the standard effective image URL
    return effectiveImageUrl;
  }, [activeVariant, effectiveImageUrl]);

  // Compute effective dimensions that are GUARANTEED to have a value
  // This is computed synchronously during render, so there's no flicker
  // Priority: extracted/loaded dimensions > project aspect ratio > 16:9 default
  const effectiveImageDimensions = useMemo(() => {
    // Use actual dimensions if we have them
    if (imageDimensions) {
      return imageDimensions;
    }

    // Fallback to project aspect ratio
    if (projectAspectRatio) {
      const resolution = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
      if (resolution && resolution.includes('x')) {
        const [w, h] = resolution.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
          return { width: w, height: h };
        }
      }
    }

    // Absolute last resort: 16:9 default
    return { width: 1920, height: 1080 };
  }, [imageDimensions, projectAspectRatio]);

  return {
    effectiveVideoUrl,
    effectiveMediaUrl,
    effectiveImageDimensions,
  };
}
