import { useCallback, useRef } from 'react';
import { toast } from "@/shared/components/ui/runtime/sonner";
import { normalizeAndPresentError } from "@/shared/lib/errorHandling/runtimeError";
import { GenerationRow, Shot } from "@/domains/generation/types";
import { useDuplicateAsNewGeneration } from "@/shared/hooks/shots";
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { ShotEditorState } from '../../state/types';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';

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

  const pendingFramePositionsRef = useRef(state.pendingFramePositions);
  pendingFramePositionsRef.current = state.pendingFramePositions;

  const handleDuplicateImage = useCallback(async (
    shotImageEntryId: string,
    currentFrame: number,
    nextTimelineFrame?: number,
  ) => {
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
    if (!generationId) {
      toast.error("Original generation is missing an ID.");
      actionsRef.current.setDuplicatingImageId(null);
      return;
    }

    // Additional guard: Check if the generation ID is also temporary
    if (generationId.startsWith('temp-')) {
      toast.warning("Please wait for the image to finish uploading.");
      return;
    }

    // Start loading state targeting the specific shotImageEntryId
    actionsRef.current.setDuplicatingImageId(shotImageEntryId);

    duplicateAsNewGenerationMutationRef.current.mutate({
      shot_id: currentShot.id,
      generation_id: generationId,
      project_id: currentProjectId,
      timeline_frame: currentFrame,
      next_timeline_frame: nextTimelineFrame ?? undefined,
    }, {
      onSuccess: (result) => {
        // Add the new item to pending positions immediately to prevent flicker
        if (result.new_shot_generation_id && result.timeline_frame !== undefined) {
          const newPendingPositions = new Map(pendingFramePositionsRef.current);
          newPendingPositions.set(result.new_shot_generation_id, result.timeline_frame);
          actionsRef.current.setPendingFramePositions(newPendingPositions);

          // Notify skeleton to wait for this specific item ID before clearing
          dispatchAppEvent('timeline:duplicate-complete', {
            shotId: currentShot.id,
            newItemId: result.new_shot_generation_id
          });
        }

        // Show success state
        actionsRef.current.setDuplicateSuccessImageId(shotImageEntryId);
        setTimeout(() => actionsRef.current.setDuplicateSuccessImageId(null), 2000);
      },
      onError: (error) => {
        normalizeAndPresentError(error, { context: 'DUPLICATE', toastTitle: 'Failed to duplicate image' });
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
