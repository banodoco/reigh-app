import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useEnhancedShotImageReorder } from '@/tools/travel-between-images/hooks/useEnhancedShotImageReorder';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { isVideoAny } from '@/shared/lib/typeGuards';
import type { GenerationRow } from '@/types/shots';
import type { ShotImagesEditorDataModel } from './useShotImagesEditorModel';

type ShotDataForCallbacks = Pick<
  ShotImagesEditorDataModel,
  'shotGenerations'
  | 'clearEnhancedPrompt'
  | 'batchExchangePositions'
  | 'moveItemsToMidpoint'
  | 'deleteItem'
  | 'getImagesForMode'
  | 'loadPositions'
  | 'positionsLoading'
>;

interface UseShotImagesEditorCallbacksOptions {
  selectedShotId: string;
  preloadedImages?: GenerationRow[];
  onImageDelete: (id: string) => void;
  onAddToShot?: (shotId: string, generationId: string, position?: number) => Promise<void>;
  onAddToShotWithoutPosition?: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (name: string) => Promise<string>;
  onDragStateChange?: (isDragging: boolean) => void;
  data: ShotDataForCallbacks;
}

function useDeleteSegmentHandler(
  queryClient: ReturnType<typeof useQueryClient>,
  setDeletingSegmentId: Dispatch<SetStateAction<string | null>>,
) {

  return useCallback(async (generationId: string) => {
    setDeletingSegmentId(generationId);
    try {
      const { data: beforeData } = await supabase
        .from('generations')
        .select('id, parent_generation_id, pair_shot_generation_id, params')
        .eq('id', generationId)
        .single();

      if (!beforeData) {
        return;
      }

      const paramsObj = beforeData.params as Record<string, unknown> | null;
      const individualParams = paramsObj?.individual_segment_params as Record<string, unknown> | undefined;
      const pairShotGenId = beforeData.pair_shot_generation_id
        || individualParams?.pair_shot_generation_id
        || paramsObj?.pair_shot_generation_id;
      const childrenQueryKey = beforeData.parent_generation_id
        ? queryKeys.segments.children(beforeData.parent_generation_id)
        : null;

      let idsToDelete = [generationId];
      if (pairShotGenId && beforeData.parent_generation_id) {
        const { data: siblings } = await supabase
          .from('generations')
          .select('id, pair_shot_generation_id, params')
          .eq('parent_generation_id', beforeData.parent_generation_id);

        idsToDelete = (siblings || [])
          .filter((child) => {
            const childParamsObj = child.params as Record<string, unknown> | null;
            const childIndividualParams = childParamsObj?.individual_segment_params as Record<string, unknown> | undefined;
            const childPairId = child.pair_shot_generation_id
              || childIndividualParams?.pair_shot_generation_id
              || childParamsObj?.pair_shot_generation_id;
            return childPairId === pairShotGenId;
          })
          .map((child) => child.id);
      }

      const { error: deleteError } = await supabase.from('generations').delete().in('id', idsToDelete);
      if (deleteError) {
        throw new Error(`Failed to delete segment: ${deleteError.message}`);
      }

      if (childrenQueryKey) {
        queryClient.setQueryData(childrenQueryKey, (oldData: unknown) => {
          if (!Array.isArray(oldData)) return oldData;
          return oldData.filter((item: { id: string }) => !idsToDelete.includes(item.id));
        });
      }

      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === 'segment-child-generations' },
        (oldData: unknown) => {
          if (Array.isArray(oldData)) {
            return oldData.filter((item: { id: string }) => !idsToDelete.includes(item.id));
          }
          return oldData;
        },
      );

      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'segment-child-generations',
        refetchType: 'all',
      });
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.segments.parentsAll[0],
        refetchType: 'all',
      });
      await queryClient.invalidateQueries({ queryKey: unifiedGenerationQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
    } catch (error) {
      handleError(error, { context: 'SegmentDelete', toastTitle: 'Failed to delete segment' });
    } finally {
      setDeletingSegmentId(null);
    }
  }, [queryClient, setDeletingSegmentId]);
}

export function useShotImagesEditorCallbacks(options: UseShotImagesEditorCallbacksOptions) {
  const {
    selectedShotId,
    preloadedImages,
    onImageDelete,
    onAddToShot,
    onAddToShotWithoutPosition,
    onCreateShot,
    onDragStateChange,
    data,
  } = options;

  const {
    shotGenerations,
    clearEnhancedPrompt,
    batchExchangePositions,
    moveItemsToMidpoint,
    deleteItem,
    getImagesForMode,
    loadPositions,
    positionsLoading,
  } = data;

  const queryClient = useQueryClient();
  const [deletingSegmentId, setDeletingSegmentId] = useState<string | null>(null);

  const handleDragStateChange = useCallback((isDragging: boolean) => {
    onDragStateChange?.(isDragging);
  }, [onDragStateChange]);

  const handleDeleteSegment = useDeleteSegmentHandler(queryClient, setDeletingSegmentId);

  const handleAddToShotAdapter = useCallback(async (targetShotId: string, generationId: string) => {
    if (!onAddToShot || !targetShotId) {
      return false;
    }
    try {
      await onAddToShot(targetShotId, generationId);
      return true;
    } catch {
      return false;
    }
  }, [onAddToShot]);

  const handleAddToShotWithoutPositionAdapter = useCallback(async (targetShotId: string, generationId: string) => {
    if (!onAddToShotWithoutPosition || !targetShotId) {
      return false;
    }
    try {
      return await onAddToShotWithoutPosition(targetShotId, generationId);
    } catch {
      return false;
    }
  }, [onAddToShotWithoutPosition]);

  const handleCreateShotAdapter = useCallback(async (shotName: string) => {
    if (!onCreateShot) {
      return { shotId: '', shotName: '' };
    }
    const shotId = await onCreateShot(shotName);
    return { shotId, shotName };
  }, [onCreateShot]);

  const handleClearEnhancedPromptByIndex = useCallback(async (pairIndex: number) => {
    const sorted = [...shotGenerations]
      .filter((shotGeneration) => !isVideoAny(shotGeneration))
      .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));

    const item = sorted[pairIndex];
    if (item) {
      await clearEnhancedPrompt(item.id);
    }
  }, [shotGenerations, clearEnhancedPrompt]);

  const { handleReorder, handleDelete } = useEnhancedShotImageReorder(
    selectedShotId,
    {
      shotGenerations,
      getImagesForMode,
      batchExchangePositions,
      moveItemsToMidpoint,
      deleteItem: preloadedImages
        ? async (id: string) => {
            onImageDelete?.(id);
          }
        : (deleteItem ?? (async () => {
            throw new Error('Delete unavailable for non-preloaded mode');
          })),
      loadPositions,
      isLoading: positionsLoading,
    },
  );

  return {
    deletingSegmentId,
    handleDeleteSegment,
    handleAddToShotAdapter,
    handleAddToShotWithoutPositionAdapter,
    handleCreateShotAdapter,
    handleClearEnhancedPromptByIndex,
    handleDragStateChange,
    handleReorder,
    handleDelete,
  };
}

export type ShotImagesEditorCallbacks = ReturnType<typeof useShotImagesEditorCallbacks>;
