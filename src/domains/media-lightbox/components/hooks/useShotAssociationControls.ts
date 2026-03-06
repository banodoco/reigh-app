import { useCallback, useMemo } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { ShotOption } from '@/domains/generation/types';

interface UseShotAssociationControlsInput {
  mediaId: string;
  imageUrl?: string;
  thumbUrl?: string;
  allShots: ShotOption[];
  selectedShotId?: string;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForSecondaryImageId?: string | null;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  onNavigateToShot?: (shot: ShotOption) => void;
  errorContext: string;
}

interface ShotAssociationControlsModel {
  selectedShot: ShotOption | null;
  isAddedWithoutPosition: boolean;
  handleAddWithoutPosition: () => Promise<void>;
  handleJumpToSelectedShot: () => void;
}

export function useShotAssociationControls(
  input: UseShotAssociationControlsInput,
): ShotAssociationControlsModel {
  const {
    mediaId,
    imageUrl,
    thumbUrl,
    allShots,
    selectedShotId,
    isAlreadyAssociatedWithoutPosition,
    showTickForSecondaryImageId,
    onAddToShotWithoutPosition,
    onShowSecondaryTick,
    onOptimisticUnpositioned,
    onNavigateToShot,
    errorContext,
  } = input;

  const selectedShot = useMemo(
    () => (selectedShotId ? allShots.find((shot) => shot.id === selectedShotId) ?? null : null),
    [allShots, selectedShotId],
  );

  const isAddedWithoutPosition = isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === mediaId;

  const handleJumpToSelectedShot = useCallback(() => {
    if (!selectedShot || !onNavigateToShot) {
      return;
    }
    onNavigateToShot(selectedShot);
  }, [selectedShot, onNavigateToShot]);

  const handleAddWithoutPosition = useCallback(async () => {
    if (!selectedShotId) {
      return;
    }

    if (isAddedWithoutPosition) {
      if (selectedShot && onNavigateToShot) {
        onNavigateToShot(selectedShot);
      }
      return;
    }

    if (!onAddToShotWithoutPosition) {
      return;
    }

    try {
      const success = await onAddToShotWithoutPosition(selectedShotId, mediaId, imageUrl, thumbUrl);
      if (!success) {
        return;
      }

      onShowSecondaryTick?.(mediaId);
      onOptimisticUnpositioned?.(mediaId, selectedShotId);
    } catch (error) {
      normalizeAndPresentError(error, { context: errorContext, showToast: false });
    }
  }, [
    errorContext,
    imageUrl,
    isAddedWithoutPosition,
    mediaId,
    onAddToShotWithoutPosition,
    onNavigateToShot,
    onOptimisticUnpositioned,
    onShowSecondaryTick,
    selectedShot,
    selectedShotId,
    thumbUrl,
  ]);

  return {
    selectedShot,
    isAddedWithoutPosition,
    handleAddWithoutPosition,
    handleJumpToSelectedShot,
  };
}
