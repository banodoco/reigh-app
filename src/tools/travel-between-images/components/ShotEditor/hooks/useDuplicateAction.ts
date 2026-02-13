import { useCallback, useRef } from 'react';
import { toast } from "@/shared/components/ui/sonner";
import { handleError } from "@/shared/lib/errorHandler";
import { GenerationRow, Shot } from "@/types/shots";
import { useDuplicateAsNewGeneration } from "@/shared/hooks/useShots";
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { ShotEditorState } from '../state/types';

interface UseDuplicateActionProps {
  state: ShotEditorState;
  actions: {
    setDuplicatingImageId: (value: string | null) => void;
    setDuplicateSuccessImageId: (value: string | null) => void;
    setPendingFramePositions: (value: Map<string, number>) => void;
  };
  selectedShot: Shot;
  projectId: string;
  orderedShotImages: GenerationRow[];
}

export const useDuplicateAction = ({
  state,
  actions,
  selectedShot,
  projectId,
  orderedShotImages,
}: UseDuplicateActionProps) => {
  const duplicateAsNewGenerationMutation = useDuplicateAsNewGeneration();

  // Stability refs - prevent callback recreation when data/mutation state changes
  const orderedShotImagesRef = useRef(orderedShotImages);
  orderedShotImagesRef.current = orderedShotImages;

  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const duplicateAsNewGenerationMutationRef = useRef(duplicateAsNewGenerationMutation);
  duplicateAsNewGenerationMutationRef.current = duplicateAsNewGenerationMutation;

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const handleDuplicateImage = useCallback(async (shotImageEntryId: string, timeline_frame: number) => {
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;

    if (!currentShot || !currentProjectId) {
      toast.error("Cannot duplicate image: No shot or project selected.");
      return;
    }

    // Guard: Prevent duplicating optimistic items (mutations in progress)
    if (shotImageEntryId.startsWith('temp-')) {
      toast.warning("Please wait for the previous operation to complete.");
      return;
    }

    const currentOrderedImages = orderedShotImagesRef.current;
    const originalImage = currentOrderedImages.find(img => img.id === shotImageEntryId);
    if (!originalImage) {
      toast.error("Original image not found for duplication.");
      return;
    }

    const generationId = getGenerationId(originalImage);

    // Additional guard: Check if the generation ID is also temporary
    if (generationId.startsWith('temp-')) {
      toast.warning("Please wait for the image to finish uploading.");
      return;
    }

    // Start loading state targeting the specific shotImageEntryId
    actionsRef.current.setDuplicatingImageId(shotImageEntryId);

    // Calculate the next image's frame from UI data (more reliable than database query)
    const sortedImages = [...currentOrderedImages]
      .filter(img => img.timeline_frame !== undefined && img.timeline_frame !== null)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    const currentIndex = sortedImages.findIndex(img => img.id === shotImageEntryId);

    const nextImage = currentIndex >= 0 && currentIndex < sortedImages.length - 1
      ? sortedImages[currentIndex + 1]
      : null;
    const nextTimelineFrame = nextImage ? nextImage.timeline_frame : undefined;

    const targetTimelineFrame = timeline_frame;
    const sourceTimelineFrame = originalImage.timeline_frame ?? 0;

    duplicateAsNewGenerationMutationRef.current.mutate({
      shot_id: currentShot.id,
      generation_id: generationId,
      project_id: currentProjectId,
      timeline_frame: sourceTimelineFrame,
      next_timeline_frame: nextTimelineFrame,
      target_timeline_frame: targetTimelineFrame,
    }, {
      onSuccess: (result) => {
        // Add the new item to pending positions immediately to prevent flicker
        if (result.new_shot_generation_id && result.timeline_frame !== undefined) {
          const newPendingPositions = new Map(state.pendingFramePositions);
          newPendingPositions.set(result.new_shot_generation_id, result.timeline_frame);
          actionsRef.current.setPendingFramePositions(newPendingPositions);

          // Notify skeleton to wait for this specific item ID before clearing
          window.dispatchEvent(new CustomEvent('timeline:duplicate-complete', {
            detail: {
              shotId: currentShot.id,
              newItemId: result.new_shot_generation_id
            }
          }));
        }

        // Show success state
        actionsRef.current.setDuplicateSuccessImageId(shotImageEntryId);
        setTimeout(() => actionsRef.current.setDuplicateSuccessImageId(null), 2000);
      },
      onError: (error) => {
        handleError(error, { context: 'DUPLICATE', toastTitle: 'Failed to duplicate image' });
      },
      onSettled: () => {
        actionsRef.current.setDuplicatingImageId(null);
      }
    });
  }, []);

  return {
    handleDuplicateImage,
  };
};
