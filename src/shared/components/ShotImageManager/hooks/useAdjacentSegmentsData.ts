import { useMemo } from 'react';
import type { AdjacentSegmentsData } from '@/domains/media-lightbox/types';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { GenerationRow } from '@/domains/generation/types';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';

interface UseAdjacentSegmentsDataProps {
  segmentSlots: SegmentSlot[] | undefined;
  onPairClick: ((pairIndex: number) => void) | undefined;
  lightboxIndex: number | null;
  currentImages: GenerationRow[];
  setLightboxIndex: (index: number | null) => void;
  navigateWithTransition: ((doNavigation: () => void) => void) | undefined;
}

/**
 * Computes adjacent segment data for the current lightbox image.
 * Enables navigation to videos that start/end with the current image.
 */
export function useAdjacentSegmentsData({
  segmentSlots,
  onPairClick,
  lightboxIndex,
  currentImages,
  setLightboxIndex,
  navigateWithTransition,
}: UseAdjacentSegmentsDataProps): AdjacentSegmentsData | undefined {
  return useMemo(() => {
    // Only available when viewing images in batch mode with segment slots
    if (!segmentSlots || segmentSlots.length === 0 || !onPairClick || lightboxIndex === null) {
      return undefined;
    }

    const currentImage = currentImages[lightboxIndex];
    if (!currentImage) return undefined;

    // Use position-based matching instead of ID-based matching
    // The image's position in the timeline is its index in the images array
    const imagePosition = lightboxIndex;

    // Build prev segment info (ends with current image)
    // prev segment is at index (imagePosition - 1)
    let prev: AdjacentSegmentsData['prev'] = undefined;
    if (imagePosition > 0 && imagePosition - 1 < segmentSlots.length) {
      const prevSlot = segmentSlots[imagePosition - 1];
      if (prevSlot) {
        const startImage = currentImages[imagePosition - 1];
        const endImage = currentImage;

        prev = {
          pairIndex: prevSlot.index,
          hasVideo: prevSlot.type === 'child' && !!prevSlot.child?.location,
          startImageUrl: getDisplayUrl(startImage?.thumbUrl || startImage?.imageUrl),
          endImageUrl: getDisplayUrl(endImage?.thumbUrl || endImage?.imageUrl),
        };
      }
    }

    // Build next segment info (starts with current image)
    // next segment is at index imagePosition (if it exists)
    let next: AdjacentSegmentsData['next'] = undefined;
    if (imagePosition < segmentSlots.length) {
      const nextSlot = segmentSlots[imagePosition];
      if (nextSlot) {
        const endImage = currentImages[imagePosition + 1];

        next = {
          pairIndex: nextSlot.index,
          hasVideo: nextSlot.type === 'child' && !!nextSlot.child?.location,
          startImageUrl: getDisplayUrl(currentImage?.thumbUrl || currentImage?.imageUrl),
          endImageUrl: endImage ? getDisplayUrl(endImage?.thumbUrl || endImage?.imageUrl) : undefined,
        };
      }
    }

    if (!prev && !next) return undefined;

    return {
      prev,
      next,
      onNavigateToSegment: (pairIndex: number) => {
        if (navigateWithTransition) {
          navigateWithTransition(() => {
            setLightboxIndex(null);
            onPairClick!(pairIndex);
          });
        } else {
          // Fallback if no transition helper provided
          setLightboxIndex(null);
          onPairClick!(pairIndex);
        }
      },
    };
  }, [segmentSlots, onPairClick, lightboxIndex, currentImages, setLightboxIndex, navigateWithTransition]);
}
