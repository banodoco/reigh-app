import { useState, useCallback, useMemo } from 'react';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { GenerationRow } from '@/types/shots';
import type { PairData } from '@/shared/types/pairData';

interface UseSegmentLightboxProps {
  displaySlots: SegmentSlot[];
  pairDataByIndex?: Map<number, PairData>;
  selectedParentId?: string | null;
}

export function useSegmentLightbox({ displaySlots, pairDataByIndex, selectedParentId }: UseSegmentLightboxProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const childSlotIndices = useMemo(() =>
    displaySlots
      .map((slot, idx) => slot.type === 'child' && slot.child.location ? idx : null)
      .filter((idx): idx is number => idx !== null),
    [displaySlots]
  );

  const handleLightboxNext = useCallback(() => {
    if (lightboxIndex === null || childSlotIndices.length === 0) return;
    const currentPos = childSlotIndices.indexOf(lightboxIndex);
    const nextPos = (currentPos + 1) % childSlotIndices.length;
    setLightboxIndex(childSlotIndices[nextPos]);
  }, [lightboxIndex, childSlotIndices]);

  const handleLightboxPrev = useCallback(() => {
    if (lightboxIndex === null || childSlotIndices.length === 0) return;
    const currentPos = childSlotIndices.indexOf(lightboxIndex);
    const prevPos = (currentPos - 1 + childSlotIndices.length) % childSlotIndices.length;
    setLightboxIndex(childSlotIndices[prevPos]);
  }, [lightboxIndex, childSlotIndices]);

  const handleLightboxClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // Lightbox media props (memoized)
  const currentLightboxSlot = useMemo(() =>
    lightboxIndex !== null ? displaySlots[lightboxIndex] : null,
    [lightboxIndex, displaySlots]
  );
  const currentLightboxMedia = useMemo(() =>
    currentLightboxSlot?.type === 'child' ? currentLightboxSlot.child : null,
    [currentLightboxSlot]
  );

  const lightboxMedia = useMemo(() => {
    if (!currentLightboxMedia) return null;
    const fallbackParentId = selectedParentId && !currentLightboxMedia.parent_generation_id
      ? { parent_generation_id: selectedParentId }
      : {};

    return {
      ...currentLightboxMedia,
      ...fallbackParentId,
    } as GenerationRow;
  }, [currentLightboxMedia, selectedParentId]);

  const lightboxCurrentSegmentImages = useMemo(() => {
    const pairData = currentLightboxSlot ? pairDataByIndex?.get(currentLightboxSlot.index) : undefined;
    const slotChildId = currentLightboxSlot?.type === 'child' ? currentLightboxSlot.child.id : undefined;
    return {
      startShotGenerationId: pairData?.startImage?.id || currentLightboxSlot?.pairShotGenerationId,
      activeChildGenerationId: slotChildId,
      startUrl: pairData?.startImage?.url,
      endUrl: pairData?.endImage?.url,
      startGenerationId: pairData?.startImage?.generationId,
      endGenerationId: pairData?.endImage?.generationId,
      startVariantId: pairData?.startImage?.primaryVariantId,
      endVariantId: pairData?.endImage?.primaryVariantId,
    };
  }, [currentLightboxSlot, pairDataByIndex]);

  const lightboxCurrentFrameCount = useMemo(() => {
    const pairData = currentLightboxSlot ? pairDataByIndex?.get(currentLightboxSlot.index) : undefined;
    return pairData?.frames;
  }, [currentLightboxSlot, pairDataByIndex]);

  return {
    lightboxIndex,
    setLightboxIndex,
    lightboxMedia,
    lightboxCurrentSegmentImages,
    lightboxCurrentFrameCount,
    currentLightboxMedia,
    childSlotIndices,
    handleLightboxNext,
    handleLightboxPrev,
    handleLightboxClose,
  };
}
