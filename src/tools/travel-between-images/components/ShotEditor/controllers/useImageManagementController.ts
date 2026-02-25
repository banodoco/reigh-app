import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { MutableRefObject } from 'react';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import { useImageManagement } from '../hooks';
import type { useGenerationActions } from '../hooks';

interface UseImageManagementControllerParams {
  queryClient: QueryClient;
  selectedShotRef: MutableRefObject<Shot | undefined>;
  projectIdRef: MutableRefObject<string | null>;
  allShotImagesRef: MutableRefObject<GenerationRow[]>;
  batchVideoFramesRef: MutableRefObject<number>;
  updateShotImageOrderMutation: ReturnType<typeof import('@/shared/hooks/shots').useUpdateShotImageOrder>;
  demoteOrphanedVariants: (shotId: string, reason: string) => void;
  actionsRef: MutableRefObject<{
    setPendingFramePositions: (value: Map<string, number>) => void;
  }>;
  pendingFramePositions: Map<string, number>;
  generationActions: ReturnType<typeof useGenerationActions>;
}

export function useImageManagementController({
  queryClient,
  selectedShotRef,
  projectIdRef,
  allShotImagesRef,
  batchVideoFramesRef,
  updateShotImageOrderMutation,
  demoteOrphanedVariants,
  actionsRef,
  pendingFramePositions,
  generationActions,
}: UseImageManagementControllerParams) {
  const {
    isClearingFinalVideo,
    handleDeleteFinalVideo,
    handleReorderImagesInShot,
    handlePendingPositionApplied,
  } = useImageManagement({
    queryClient,
    selectedShotRef,
    projectIdRef,
    allShotImagesRef,
    batchVideoFramesRef,
    updateShotImageOrderMutation,
    demoteOrphanedVariants,
    actionsRef,
    pendingFramePositions,
  });

  // Image upload handler consumes normalized files, not DOM events.
  const handleImageUpload = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      await generationActions.handleBatchImageDrop(files);
    }
  }, [generationActions]);

  return {
    isClearingFinalVideo,
    handleDeleteFinalVideo,
    handleReorderImagesInShot,
    handlePendingPositionApplied,
    handleImageUpload,
  };
}
