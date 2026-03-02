import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEnhancedShotImageReorder } from '@/tools/travel-between-images/hooks/timeline/useEnhancedShotImageReorder';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isVideoAny } from '@/shared/lib/typeGuards';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import type { GenerationRow } from '@/domains/generation/types';
import type { ShotImagesEditorDataModel } from './useShotImagesEditorModel';
import {
  deleteSegmentGenerationGroup,
  syncSegmentDeletionCaches,
} from '../services/segmentDeletionService';

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
  projectId?: string;
  preloadedImages?: GenerationRow[];
  onImageDelete: (id: string) => void;
  onAddToShot?: (shotId: string, generationId: string, position?: number) => Promise<boolean | void>;
  onAddToShotWithoutPosition?: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (name: string) => Promise<string>;
  onDragStateChange?: (isDragging: boolean) => void;
  data: ShotDataForCallbacks;
}

interface ShotSelectionOperationResult {
  added: boolean;
}

interface ShotCreationOperationResult {
  shotId: string;
  shotName: string;
}

interface SegmentDeleteOperationResult {
  deleted: boolean;
}

function useDeleteSegmentHandler(
  queryClient: ReturnType<typeof useQueryClient>,
  setDeletingSegmentId: Dispatch<SetStateAction<string | null>>,
  projectId?: string,
) {
  return useCallback(async (generationId: string) => {
    if (!projectId) {
      return operationFailure(new Error('Project scope is required for segment deletion'), {
        policy: 'fail_closed',
        recoverable: false,
        errorCode: 'shot_editor_segment_delete_missing_project_scope',
        message: 'Project scope is required for segment deletion',
      });
    }

    setDeletingSegmentId(generationId);
    try {
      const deletion = await deleteSegmentGenerationGroup({
        generationId,
        projectId,
      });

      if (!deletion.deleted) {
        return operationSuccess(
          { deleted: false } satisfies SegmentDeleteOperationResult,
          { policy: 'best_effort' },
        );
      }

      await syncSegmentDeletionCaches({
        queryClient,
        projectId,
        parentGenerationId: deletion.parentGenerationId,
        idsToDelete: deletion.idsToDelete,
      });

      return operationSuccess(
        { deleted: true } satisfies SegmentDeleteOperationResult,
        { policy: 'best_effort' },
      );
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'SegmentDelete',
        toastTitle: 'Failed to delete segment',
      });
      return operationFailure(error, {
        policy: 'best_effort',
        recoverable: true,
        errorCode: 'shot_editor_segment_delete_failed',
        message: 'Failed to delete segment',
      });
    } finally {
      setDeletingSegmentId(null);
    }
  }, [projectId, queryClient, setDeletingSegmentId]);
}

export function useShotImagesEditorCallbacks(options: UseShotImagesEditorCallbacksOptions) {
  const {
    selectedShotId,
    projectId,
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

  const runDeleteSegmentOperation = useDeleteSegmentHandler(queryClient, setDeletingSegmentId, projectId);

  const runAddToShotOperation = useCallback(async (
    targetShotId: string,
    generationId: string,
  ): Promise<OperationResult<ShotSelectionOperationResult>> => {
    if (!onAddToShot || !targetShotId) {
      return operationFailure(new Error('Add-to-shot handler unavailable'), {
        policy: 'fail_closed',
        recoverable: false,
        errorCode: 'shot_editor_add_to_shot_handler_missing',
        message: 'Add-to-shot handler unavailable',
      });
    }
    try {
      const added = await onAddToShot(targetShotId, generationId);
      return operationSuccess(
        { added: added !== false },
        { policy: 'best_effort' },
      );
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useShotImagesEditorCallbacks.runAddToShotOperation',
        showToast: false,
      });
      return operationFailure(error, {
        policy: 'best_effort',
        recoverable: true,
        errorCode: 'shot_editor_add_to_shot_failed',
        message: 'Failed to add generation to shot',
      });
    }
  }, [onAddToShot]);

  const runAddToShotWithoutPositionOperation = useCallback(async (
    targetShotId: string,
    generationId: string,
  ): Promise<OperationResult<ShotSelectionOperationResult>> => {
    if (!onAddToShotWithoutPosition || !targetShotId) {
      return operationFailure(new Error('Add-to-shot-without-position handler unavailable'), {
        policy: 'fail_closed',
        recoverable: false,
        errorCode: 'shot_editor_add_to_shot_without_position_handler_missing',
        message: 'Add-to-shot-without-position handler unavailable',
      });
    }
    try {
      const added = await onAddToShotWithoutPosition(targetShotId, generationId);
      return operationSuccess(
        { added: added !== false },
        { policy: 'best_effort' },
      );
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useShotImagesEditorCallbacks.runAddToShotWithoutPositionOperation',
        showToast: false,
      });
      return operationFailure(error, {
        policy: 'best_effort',
        recoverable: true,
        errorCode: 'shot_editor_add_to_shot_without_position_failed',
        message: 'Failed to add generation to shot without position',
      });
    }
  }, [onAddToShotWithoutPosition]);

  const runCreateShotOperation = useCallback(async (
    shotName: string,
  ): Promise<OperationResult<ShotCreationOperationResult>> => {
    if (!onCreateShot) {
      return operationFailure(new Error('Create-shot handler unavailable'), {
        policy: 'fail_closed',
        recoverable: false,
        errorCode: 'shot_editor_create_shot_handler_missing',
        message: 'Create-shot handler unavailable',
      });
    }
    try {
      const shotId = await onCreateShot(shotName);
      if (!shotId) {
        return operationFailure(new Error('Create-shot handler returned no shot id'), {
          policy: 'fail_closed',
          recoverable: true,
          errorCode: 'shot_editor_create_shot_empty_result',
          message: 'Create-shot handler returned no shot id',
        });
      }

      return operationSuccess(
        { shotId, shotName },
        { policy: 'best_effort' },
      );
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useShotImagesEditorCallbacks.runCreateShotOperation',
        showToast: false,
      });
      return operationFailure(error, {
        policy: 'best_effort',
        recoverable: true,
        errorCode: 'shot_editor_create_shot_failed',
        message: 'Failed to create shot',
      });
    }
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
    runDeleteSegmentOperation,
    runAddToShotOperation,
    runAddToShotWithoutPositionOperation,
    runCreateShotOperation,
    handleClearEnhancedPromptByIndex,
    handleDragStateChange,
    handleReorder,
    handleDelete,
  };
}

export type ShotImagesEditorCallbacks = ReturnType<typeof useShotImagesEditorCallbacks>;
