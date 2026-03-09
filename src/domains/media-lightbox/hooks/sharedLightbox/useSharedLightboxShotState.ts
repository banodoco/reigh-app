import { useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type { LightboxShotWorkflowProps } from '../../types';
import { useShotCreation } from '../useShotCreation';
import { useShotPositioning } from '../useShotPositioning';

interface UseSharedLightboxShotStateInput {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotWorkflow?: LightboxShotWorkflowProps;
  onClose: () => void;
}

export function useSharedLightboxShotState(input: UseSharedLightboxShotStateInput) {
  const { media, selectedProjectId, shotWorkflow, onClose } = input;
  const {
    allShots,
    onNavigateToShot,
    onShotChange,
    selectedShotId,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onAddToShot,
    onAddToShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  } = shotWorkflow ?? {};

  const { isCreatingShot, quickCreateSuccess, handleQuickCreateAndAdd, handleQuickCreateSuccess } = useShotCreation({
    media,
    selectedProjectId,
    allShots: allShots || [],
    onNavigateToShot,
    onClose,
    onShotChange,
  });

  const computedPositionedInSelectedShot = useMemo(
    () => (typeof positionedInSelectedShot === 'boolean' ? positionedInSelectedShot : undefined),
    [positionedInSelectedShot],
  );

  const {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  } = useShotPositioning({
    media,
    selectedShotId,
    allShots: allShots || [],
    positionedInSelectedShot: computedPositionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onNavigateToShot,
    onClose,
    onAddToShot,
    onAddToShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  });

  return {
    selectedShotId,
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  };
}
