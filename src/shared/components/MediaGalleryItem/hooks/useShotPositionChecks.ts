import { useMemo } from 'react';
import type { GeneratedImageWithMetadata } from '../types';

interface UseShotPositionChecksParams {
  image: GeneratedImageWithMetadata;
  selectedShotIdLocal: string;
  currentViewingShotId?: string;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onAddToLastShotWithoutPosition?: (...args: unknown[]) => unknown;
  showTickForImageId: string | null;
  addingToShotImageId: string | null;
}

/**
 * Computes position-related state for a gallery item relative to the selected shot.
 *
 * Consolidates 4 related memos:
 * - isAlreadyPositionedInSelectedShot
 * - isAlreadyAssociatedWithoutPosition
 * - isCurrentlyViewingSelectedShot
 * - shouldShowAddWithoutPositionButton
 */
export function useShotPositionChecks({
  image,
  selectedShotIdLocal,
  currentViewingShotId,
  optimisticPositionedIds,
  optimisticUnpositionedIds,
  onAddToLastShotWithoutPosition,
  showTickForImageId,
  addingToShotImageId,
}: UseShotPositionChecksParams) {
  const isAlreadyPositionedInSelectedShot = useMemo(() => {
    if (!selectedShotIdLocal || !image.id) return false;

    // Check optimistic state first
    const optimisticKey = `${image.id}:${selectedShotIdLocal}`;
    if (optimisticPositionedIds?.has(optimisticKey)) return true;

    // Check single shot (most common case)
    if (image.shot_id === selectedShotIdLocal) {
      return image.position !== null && image.position !== undefined;
    }

    // Check multiple shot associations
    if (image.all_shot_associations) {
      const match = image.all_shot_associations.find(
        assoc => assoc.shot_id === selectedShotIdLocal
      );
      return match ? match.position !== null && match.position !== undefined : false;
    }

    return false;
  }, [selectedShotIdLocal, image.id, image.shot_id, image.position, image.all_shot_associations, optimisticPositionedIds]);

  const isAlreadyAssociatedWithoutPosition = useMemo(() => {
    if (!selectedShotIdLocal || !image.id) return false;

    const optimisticKey = `${image.id}:${selectedShotIdLocal}`;
    if (optimisticUnpositionedIds?.has(optimisticKey)) return true;

    if (image.shot_id === selectedShotIdLocal) {
      return image.position === null || image.position === undefined;
    }

    if (image.all_shot_associations) {
      const match = image.all_shot_associations.find(
        assoc => assoc.shot_id === selectedShotIdLocal
      );
      return match ? (match.position === null || match.position === undefined) : false;
    }

    return false;
  }, [selectedShotIdLocal, image.id, image.shot_id, image.position, image.all_shot_associations, optimisticUnpositionedIds]);

  const isCurrentlyViewingSelectedShot = useMemo(() => {
    if (!currentViewingShotId || !selectedShotIdLocal) return false;
    return currentViewingShotId === selectedShotIdLocal;
  }, [currentViewingShotId, selectedShotIdLocal]);

  const shouldShowAddWithoutPositionButton = useMemo(() => {
    return !!onAddToLastShotWithoutPosition &&
      !isAlreadyPositionedInSelectedShot &&
      showTickForImageId !== image.id &&
      addingToShotImageId !== image.id &&
      !isCurrentlyViewingSelectedShot;
  }, [
    onAddToLastShotWithoutPosition,
    isAlreadyPositionedInSelectedShot,
    showTickForImageId,
    image.id,
    addingToShotImageId,
    isCurrentlyViewingSelectedShot,
  ]);

  return {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    isCurrentlyViewingSelectedShot,
    shouldShowAddWithoutPositionButton,
  };
}
