import { useMemo } from 'react';
import { GenerationRow, Shot } from "@/types/shots";
import { ShotEditorState } from '../state/types';
import { useDeleteActions } from './useDeleteActions';
import { useDuplicateAction } from './useDuplicateAction';
import { useDropActions } from './useDropActions';

interface UseGenerationActionsProps {
  state: ShotEditorState;
  actions: {
    setUploadingImage: (value: boolean) => void;
    setFileInputKey: (value: number) => void;
    setDeletingVideoId: (value: string | null) => void;
    setDuplicatingImageId: (value: string | null) => void;
    setDuplicateSuccessImageId: (value: string | null) => void;
    setPendingFramePositions: (value: Map<string, number>) => void;
    // REMOVED: setLocalOrderedShotImages - no longer needed with two-phase loading
  };
  selectedShot: Shot;
  projectId: string;
  batchVideoFrames: number;
  orderedShotImages: GenerationRow[];
}

/**
 * Composition hook that combines all generation action sub-hooks.
 *
 * Sub-hooks:
 * - useDeleteActions: handleDeleteImageFromShot, handleBatchDeleteImages
 * - useDuplicateAction: handleDuplicateImage
 * - useDropActions: handleTimelineImageDrop, handleTimelineGenerationDrop,
 *                   handleBatchImageDrop, handleBatchGenerationDrop
 */
export const useGenerationActions = ({
  state,
  actions,
  selectedShot,
  projectId,
  batchVideoFrames,
  orderedShotImages,
}: UseGenerationActionsProps) => {
  const { handleDeleteImageFromShot, handleBatchDeleteImages } = useDeleteActions({
    selectedShot,
    projectId,
    orderedShotImages,
  });

  const { handleDuplicateImage } = useDuplicateAction({
    state,
    actions,
    selectedShot,
    projectId,
    orderedShotImages,
  });

  const {
    handleTimelineImageDrop,
    handleTimelineGenerationDrop,
    handleBatchImageDrop,
    handleBatchGenerationDrop,
  } = useDropActions({
    actions,
    selectedShot,
    projectId,
    batchVideoFrames,
  });

  // Memoize the return object to prevent callback instability in parent components.
  // All sub-hook callbacks have empty dependency arrays and use refs internally.
  return useMemo(() => ({
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleDuplicateImage,
    handleTimelineImageDrop,
    handleTimelineGenerationDrop,
    handleBatchImageDrop,
    handleBatchGenerationDrop,
  }), [
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleDuplicateImage,
    handleTimelineImageDrop,
    handleTimelineGenerationDrop,
    handleBatchImageDrop,
    handleBatchGenerationDrop,
  ]);
};
