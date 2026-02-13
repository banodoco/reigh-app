import { useCallback, useRef } from 'react';
import { toast } from "@/shared/components/ui/sonner";
import { handleError } from "@/shared/lib/errorHandler";
import { GenerationRow, Shot } from "@/types/shots";
import { useRemoveImageFromShot } from "@/shared/hooks/useShots";
import { useQueryClient } from '@tanstack/react-query';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';
import { useDemoteOrphanedVariants } from '../../../hooks/useDemoteOrphanedVariants';

interface UseDeleteActionsProps {
  selectedShot: Shot;
  projectId: string;
  orderedShotImages: GenerationRow[];
}

export const useDeleteActions = ({
  selectedShot,
  projectId,
  orderedShotImages,
}: UseDeleteActionsProps) => {
  const queryClient = useQueryClient();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const { demoteOrphanedVariants } = useDemoteOrphanedVariants();

  // Stability refs - prevent callback recreation when data/mutation state changes
  const orderedShotImagesRef = useRef(orderedShotImages);
  orderedShotImagesRef.current = orderedShotImages;

  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const removeImageFromShotMutationRef = useRef(removeImageFromShotMutation);
  removeImageFromShotMutationRef.current = removeImageFromShotMutation;

  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const demoteOrphanedVariantsRef = useRef(demoteOrphanedVariants);
  demoteOrphanedVariantsRef.current = demoteOrphanedVariants;

  const handleDeleteImageFromShot = useCallback(async (shotImageEntryId: string) => {
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;

    if (!currentShot || !currentProjectId) {
      console.error('[DeleteDebug] ❌ Missing shot or project', {
        hasSelectedShot: !!currentShot,
        hasProjectId: !!currentProjectId
      });
      toast.error("Cannot remove image: No shot or project selected.");
      return;
    }

    // Guard: Prevent deleting optimistic items (mutations in progress)
    if (shotImageEntryId.startsWith('temp-')) {
      toast.warning("Please wait for the previous operation to complete.");
      return;
    }

    // Find the image by its id (shot_generations.id)
    const currentOrderedImages = orderedShotImagesRef.current;
    const imageToDelete = currentOrderedImages.find(img => img.id === shotImageEntryId);

    // The actual generation ID is now stored in generation_id
    const actualGenerationId = imageToDelete?.generation_id;

    if (!actualGenerationId) {
      console.error('[DeleteDebug] ❌ Could not find generation ID for shotImageEntryId', {
        shotImageEntryId: shotImageEntryId.substring(0, 8),
        availableIds: currentOrderedImages.map(img => ({
          id: img.id?.substring(0, 8),
          generation_id: img.generation_id?.substring(0, 8)
        }))
      });
      toast.error("Cannot remove image: Image not found.");
      return;
    }

    // Check if we're deleting the first positioned item on the timeline
    // If so, we need to shift all remaining items back proportionally
    const positionedImages = currentOrderedImages
      .filter(img => img.timeline_frame != null && img.timeline_frame >= 0 && !isVideoGeneration(img))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    const deletedItemFrame = imageToDelete?.timeline_frame;
    const isDeletingFirstItem = positionedImages.length > 1 &&
      deletedItemFrame != null &&
      deletedItemFrame >= 0 &&
      positionedImages[0]?.id === shotImageEntryId;

    // Calculate the offset to shift remaining items (gap between first and second item)
    let frameOffset = 0;
    let itemsToShift: Array<{ id: string; currentFrame: number }> = [];

    if (isDeletingFirstItem && positionedImages.length >= 2) {
      const firstFrame = positionedImages[0].timeline_frame ?? 0;
      const secondFrame = positionedImages[1].timeline_frame ?? 0;
      frameOffset = secondFrame - firstFrame;

      // Collect all remaining items (excluding the one being deleted)
      itemsToShift = positionedImages
        .slice(1) // Skip first item (being deleted)
        .map(img => ({
          id: img.id,
          currentFrame: img.timeline_frame ?? 0
        }));

    }

    // Build shift data to pass to mutation (applied optimistically in onMutate)
    const shiftItems = isDeletingFirstItem && frameOffset > 0 && itemsToShift.length > 0
      ? itemsToShift.map(item => ({ id: item.id, newFrame: item.currentFrame - frameOffset }))
      : undefined;

    try {
      // CRITICAL: Pass shotGenerationId (shot_generations.id), NOT generationId (generations.id)
      await removeImageFromShotMutationRef.current.mutateAsync({
        shotId: currentShot.id,
        shotGenerationId: shotImageEntryId,
        projectId: currentProjectId,
        shiftItems,
      });

      invalidateGenerationsSync(queryClientRef.current, currentShot.id, {
        reason: isDeletingFirstItem ? 'delete-image-frame-shift' : 'delete-image',
        scope: 'all',
        includeShots: true,
        projectId: currentProjectId
      });

      // Check for orphaned video variants after image deletion
      await demoteOrphanedVariantsRef.current(currentShot.id, 'single-image-delete');
    } catch (error) {
      handleError(error, { context: 'DeleteDebug', showToast: false });
    }
  }, []);

  const handleBatchDeleteImages = useCallback(async (shotImageEntryIds: string[]) => {
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;

    if (!currentShot || !currentProjectId || shotImageEntryIds.length === 0) {
      return;
    }

    const removePromises = shotImageEntryIds.map(id =>
      removeImageFromShotMutationRef.current.mutateAsync({
        shotId: currentShot.id,
        shotGenerationId: id,
        projectId: currentProjectId,
      })
    );

    try {
      await Promise.all(removePromises);

      // Check for orphaned video variants after batch deletion
      await demoteOrphanedVariantsRef.current(currentShot.id, 'batch-image-delete');
    } catch (error) {
      toast.error('Failed to remove some images from timeline');
    }
  }, []);

  return {
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
  };
};
