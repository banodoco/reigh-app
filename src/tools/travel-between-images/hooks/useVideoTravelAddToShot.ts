/**
 * Add to Shot Hook for VideoTravelToolPage
 * 
 * Manages the "Add to Shot" functionality for the Videos gallery view:
 * - Computes target shot (last affected or first shot)
 * - Handles adding generations to shots with/without timeline position
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 * @see MediaGallery - Component that triggers these handlers
 */

import { useCallback, useMemo } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { useQueryClient } from '@tanstack/react-query';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { Shot } from '@/types/shots';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';

interface UseVideoTravelAddToShotParams {
  /** Current project ID */
  selectedProjectId: string;
  /** Current shots list */
  shots: Shot[] | undefined;
  /** Mutation to add an image to a shot with automatic position */
  addImageToShotMutation: {
    mutateAsync: (params: {
      shot_id: string;
      generation_id: string;
      project_id: string;
      imageUrl?: string;
      thumbUrl?: string;
    }) => Promise<unknown>;
  };
  /** Mutation to add an image to a shot without timeline position */
  addImageToShotWithoutPositionMutation: {
    mutateAsync: (params: {
      shot_id: string;
      generation_id: string;
      project_id: string;
      imageUrl?: string;
      thumbUrl?: string;
    }) => Promise<unknown>;
  };
}

interface UseVideoTravelAddToShotReturn {
  /** Info about the target shot for the "Add to Shot" button */
  targetShotInfo: {
    targetShotIdForButton: string | undefined;
    targetShotNameForButtonTooltip: string;
  };
  /** Handle adding a video/image to target shot WITH position */
  handleAddVideoToTargetShot: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  /** Handle adding a video/image to target shot WITHOUT position */
  handleAddVideoToTargetShotWithoutPosition: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
}

/**
 * Hook that provides "Add to Shot" functionality for the Videos gallery.
 */
export const useVideoTravelAddToShot = ({
  selectedProjectId,
  shots,
  addImageToShotMutation,
  addImageToShotWithoutPositionMutation,
}: UseVideoTravelAddToShotParams): UseVideoTravelAddToShotReturn => {
  const queryClient = useQueryClient();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  
  // Compute target shot info - memoized to prevent unnecessary recalculations
  const targetShotInfo = useMemo(() => {
    const targetShotIdForButton = lastAffectedShotId || (shots && shots.length > 0 ? shots[0].id : undefined);
    const targetShotNameForButtonTooltip = targetShotIdForButton 
      ? (shots?.find(shot => shot.id === targetShotIdForButton)?.name || 'Selected Shot')
      : (shots && shots.length > 0 ? shots[0].name : 'Last Shot');
    
    return { targetShotIdForButton, targetShotNameForButtonTooltip };
  }, [lastAffectedShotId, shots]);
  
  // Shared implementation for adding to shot (with or without position)
  const addToTargetShot = useCallback(async (
    mutation: typeof addImageToShotMutation,
    targetShotId: string,
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string,
  ): Promise<boolean> => {
    const resolvedTargetShotId = targetShotId || targetShotInfo.targetShotIdForButton;
    if (!resolvedTargetShotId) {
      console.error('[VideoTravelAddToShot] No target shot available');
      toast.error("No target shot available to add to. Create a shot first or interact with one.");
      return false;
    }
    if (!generationId) {
      console.error('[VideoTravelAddToShot] No generationId provided');
      toast.error("Item has no ID, cannot add to shot.");
      return false;
    }
    if (!selectedProjectId) {
      console.error('[VideoTravelAddToShot] No selectedProjectId');
      toast.error("No project selected. Cannot add item to shot.");
      return false;
    }

    try {
      await mutation.mutateAsync({
        shot_id: resolvedTargetShotId,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });

      setLastAffectedShotId(resolvedTargetShotId);
      queryClient.invalidateQueries({ queryKey: unifiedGenerationQueryKeys.projectPrefix(selectedProjectId) });

      return true;
    } catch (error) {
      handleError(error, { context: 'useVideoTravelAddToShot', toastTitle: 'Failed to add item to shot' });
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, selectedProjectId, setLastAffectedShotId, queryClient]);

  // Handle adding a video/image to target shot WITH position
  const handleAddVideoToTargetShot = useCallback(
    (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) =>
      addToTargetShot(addImageToShotMutation, targetShotId, generationId, imageUrl, thumbUrl),
    [addToTargetShot, addImageToShotMutation]
  );

  // Handle adding a video/image to target shot WITHOUT position
  const handleAddVideoToTargetShotWithoutPosition = useCallback(
    (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) =>
      addToTargetShot(addImageToShotWithoutPositionMutation, targetShotId, generationId, imageUrl, thumbUrl),
    [addToTargetShot, addImageToShotWithoutPositionMutation]
  );

  return {
    targetShotInfo,
    handleAddVideoToTargetShot,
    handleAddVideoToTargetShotWithoutPosition,
  };
};
