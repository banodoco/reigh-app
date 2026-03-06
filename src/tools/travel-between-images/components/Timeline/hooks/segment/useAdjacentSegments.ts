import { useMemo } from 'react';
import { GenerationRow } from '@/domains/generation/types';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { AdjacentSegmentsData } from '@/domains/media-lightbox/types';

interface UseAdjacentSegmentsProps {
  segmentSlots: SegmentSlot[] | undefined;
  onOpenSegmentSlot: ((pairIndex: number) => void) | undefined;
  lightboxIndex: number | null;
  images: GenerationRow[];
  currentImages: GenerationRow[];
  closeLightbox: () => void;
  navigateWithTransition?: (doNavigation: () => void) => void;
}

/**
 * Computes adjacent segment data for lightbox navigation.
 * Enables "jump to video" buttons when viewing an image that starts/ends a segment.
 */
export function useAdjacentSegments({
  segmentSlots,
  onOpenSegmentSlot,
  lightboxIndex,
  images,
  currentImages,
  closeLightbox,
  navigateWithTransition,
}: UseAdjacentSegmentsProps): AdjacentSegmentsData | undefined {
  return useMemo(() => {
    if (!segmentSlots || segmentSlots.length === 0 || !onOpenSegmentSlot || lightboxIndex === null) {
      return undefined;
    }

    const currentImage = currentImages[lightboxIndex];
    if (!currentImage) {
      return undefined;
    }

    // lightboxIndex is into currentImages which is [...images, ...externalGens...]
    // If lightboxIndex >= images.length, it's an external gen and shouldn't have adjacent segments
    if (lightboxIndex >= images.length) {
      return undefined;
    }

    const imagePosition = lightboxIndex;

    const getImageUrl = (position: number): string | undefined => {
      const img = images[position];
      const urlFallback = (img as (typeof img & { url?: string }) | undefined)?.url;
      return img?.thumbUrl || img?.imageUrl || urlFallback || img?.location || undefined;
    };

    let prevSegment: { pairIndex: number; hasVideo: boolean; startImageUrl?: string; endImageUrl?: string } | undefined;
    let nextSegment: { pairIndex: number; hasVideo: boolean; startImageUrl?: string; endImageUrl?: string } | undefined;

    // Slot at position P starts at image P and ends at image P+1
    // nextSegment: slot at index P (segment starting at this image)
    // prevSegment: slot at index P-1 (segment ending at this image)

    if (imagePosition < segmentSlots.length) {
      const slot = segmentSlots[imagePosition];
      if (slot) {
        const hasVideo = slot.type === 'child' && !!slot.child.location;
        nextSegment = {
          pairIndex: slot.index,
          hasVideo,
          startImageUrl: getImageUrl(imagePosition),
          endImageUrl: getImageUrl(imagePosition + 1),
        };
      }
    }

    if (imagePosition > 0 && imagePosition - 1 < segmentSlots.length) {
      const slot = segmentSlots[imagePosition - 1];
      if (slot) {
        const hasVideo = slot.type === 'child' && !!slot.child.location;
        prevSegment = {
          pairIndex: slot.index,
          hasVideo,
          startImageUrl: getImageUrl(imagePosition - 1),
          endImageUrl: getImageUrl(imagePosition),
        };
      }
    }

    if (!prevSegment && !nextSegment) {
      return undefined;
    }

    return {
      prev: prevSegment,
      next: nextSegment,
      onNavigateToSegment: (pairIndex: number) => {
        if (navigateWithTransition) {
          navigateWithTransition(() => {
            closeLightbox();
            onOpenSegmentSlot(pairIndex);
          });
        } else {
          closeLightbox();
          onOpenSegmentSlot(pairIndex);
        }
      },
    };
  }, [segmentSlots, onOpenSegmentSlot, lightboxIndex, currentImages, images, closeLightbox, navigateWithTransition]);
}
