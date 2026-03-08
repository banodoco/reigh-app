import { useEffect } from 'react';
import { useTaskDetails } from './useTaskDetails';
import { usePrefetchTaskData } from '@/shared/hooks/tasks/useTaskPrefetch';
import { usePendingImageOpen } from '@/shared/hooks/usePendingImageOpen';
import { useAdjacentSegmentsData } from './useAdjacentSegmentsData';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import type { PairData } from '@/shared/types/pairData';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { GenerationRow } from '@/domains/generation/types';

interface UseLightboxContextDataInput {
  lightboxIndex: number | null;
  currentImages: GenerationRow[];
  setLightboxIndex: (index: number | null) => void;
  projectId?: string | null;
  pendingImageToOpen?: string | null;
  pendingImageVariantId?: string | null;
  onClearPendingImageToOpen?: () => void;
  segmentSlots?: SegmentSlot[];
  onPairClick?: (pairIndex: number, pairData?: PairData) => void;
  navigateWithTransition?: (doNavigation: () => void) => void;
}

export function useLightboxContextData({
  lightboxIndex,
  currentImages,
  setLightboxIndex,
  projectId,
  pendingImageToOpen,
  pendingImageVariantId,
  onClearPendingImageToOpen,
  segmentSlots,
  onPairClick,
  navigateWithTransition,
}: UseLightboxContextDataInput) {
  const currentLightboxImage = lightboxIndex !== null ? currentImages[lightboxIndex] : null;
  const currentLightboxImageId = getGenerationId(currentLightboxImage) || null;

  const { taskDetailsData } = useTaskDetails({
    generationId: currentLightboxImageId,
    projectId: projectId ?? null,
  });

  const prefetchTaskData = usePrefetchTaskData();
  useEffect(() => {
    if (lightboxIndex === null) return;

    if (lightboxIndex > 0) {
      const prevGenerationId = getGenerationId(currentImages[lightboxIndex - 1]);
      if (prevGenerationId) {
        prefetchTaskData(prevGenerationId);
      }
    }

    if (lightboxIndex < currentImages.length - 1) {
      const nextGenerationId = getGenerationId(currentImages[lightboxIndex + 1]);
      if (nextGenerationId) {
        prefetchTaskData(nextGenerationId);
      }
    }

    if (currentLightboxImageId) {
      prefetchTaskData(currentLightboxImageId);
    }
  }, [lightboxIndex, currentImages, currentLightboxImageId, prefetchTaskData]);

  const capturedVariantIdRef = usePendingImageOpen({
    pendingImageToOpen,
    pendingImageVariantId,
    images: currentImages,
    openLightbox: setLightboxIndex,
    onClear: onClearPendingImageToOpen,
  });

  const adjacentSegmentsData = useAdjacentSegmentsData({
    segmentSlots,
    onPairClick,
    lightboxIndex,
    currentImages,
    setLightboxIndex,
    navigateWithTransition,
  });

  return {
    capturedVariantIdRef,
    adjacentSegmentsData,
    taskDetailsData,
  };
}
