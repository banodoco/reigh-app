import { useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { useAddImageToShot, useAddImageToShotWithoutPosition, usePositionExistingGenerationInShot } from '@/shared/hooks/shots';
import { useShotCreation } from '@/shared/hooks/useShotCreation';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { useDeleteGenerationWithConfirm } from '@/domains/generation/hooks/useDeleteGenerationWithConfirm';
import { queryKeys } from '@/shared/lib/queryKeys';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface UseImageGenActionsParams {
  projectId: string | null;
  effectiveProjectId: string | null;
  selectedShotFilter: string;
  excludePositioned: boolean;
  generationsFilters: Record<string, unknown>;
  currentPage: number;
  itemsPerPage: number;
}

export function useImageGenActions({
  projectId,
  effectiveProjectId,
  selectedShotFilter,
  excludePositioned,
  generationsFilters,
  currentPage,
  itemsPerPage,
}: UseImageGenActionsParams) {
  const queryClient = useQueryClient();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  const positionExistingGenerationMutation = usePositionExistingGenerationInShot();
  const { requestDelete, confirmDialogProps } = useDeleteGenerationWithConfirm();
  const { createShot } = useShotCreation();
  const { shots } = useShots();

  const targetShotInfo = useMemo(() => {
    const targetShotIdForButton = lastAffectedShotId || (shots && shots.length > 0 ? shots[0].id : undefined);
    const targetShotNameForButtonTooltip = targetShotIdForButton
      ? (shots?.find(shot => shot.id === targetShotIdForButton)?.name || 'Selected Shot')
      : (shots && shots.length > 0 ? shots[0].name : 'Last Shot');

    return { targetShotIdForButton, targetShotNameForButtonTooltip };
  }, [lastAffectedShotId, shots]);

  const validShots = useMemo(() => shots || [], [shots]);

  const handleDeleteImage = useCallback(async (id: string) => {
    requestDelete(id);
  }, [requestDelete]);

  const handleAddImageToTargetShot = useCallback(async (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    const resolvedTargetShotId = targetShotId || targetShotInfo.targetShotIdForButton;
    if (!resolvedTargetShotId) {
      toast.error("No target shot available to add to. Create a shot first or interact with one.");
      return false;
    }
    if (!generationId) {
      toast.error("Image has no ID, cannot add to shot.");
      return false;
    }
    if (!projectId) {
      toast.error("No project selected. Cannot add image to shot.");
      return false;
    }

    const shouldPositionExisting = selectedShotFilter !== 'all' &&
      selectedShotFilter === resolvedTargetShotId &&
      excludePositioned;

    try {
      if (shouldPositionExisting) {
        await positionExistingGenerationMutation?.mutateAsync({
          shot_id: resolvedTargetShotId,
          generation_id: generationId,
          project_id: projectId,
        });
      } else {
        await addImageToShotMutation?.mutateAsync({
          shot_id: resolvedTargetShotId,
          generation_id: generationId,
          imageUrl,
          thumbUrl,
          project_id: projectId,
        });
      }
      setLastAffectedShotId(resolvedTargetShotId);
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(effectiveProjectId) });
      return true;
    } catch (error) {
      normalizeAndPresentError(error, { context: 'ImageGenerationToolPage.handleAddImageToTargetShot', toastTitle: 'Failed to add image to shot.' });
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, projectId, addImageToShotMutation, positionExistingGenerationMutation, setLastAffectedShotId, selectedShotFilter, excludePositioned, queryClient, effectiveProjectId]);

  const handleAddImageToTargetShotWithoutPosition = useCallback(async (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    const resolvedTargetShotId = targetShotId || targetShotInfo.targetShotIdForButton;
    if (!resolvedTargetShotId) {
      toast.error("No target shot available to add to. Create a shot first or interact with one.");
      return false;
    }
    if (!generationId) {
      toast.error("Image has no ID, cannot add to shot.");
      return false;
    }
    if (!projectId) {
      toast.error("No project selected. Cannot add image to shot.");
      return false;
    }

    try {
      await addImageToShotWithoutPositionMutation?.mutateAsync({
        shot_id: resolvedTargetShotId,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: projectId,
      });
      setLastAffectedShotId(resolvedTargetShotId);
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(effectiveProjectId) });
      return true;
    } catch (error) {
      normalizeAndPresentError(error, { context: 'ImageGenerationToolPage.handleAddImageToTargetShotWithoutPosition', toastTitle: 'Failed to add image to shot without position.' });
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, projectId, addImageToShotWithoutPositionMutation, setLastAffectedShotId, queryClient, effectiveProjectId]);

  const handleBackfillRequest = useCallback(async (): Promise<void> => {
    if (!projectId) return;

    try {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.unified.projectPrefix(effectiveProjectId),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.unified.byProject(
          effectiveProjectId,
          currentPage,
          itemsPerPage,
          JSON.stringify(generationsFilters)
        ),
      });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'ImageGenerationToolPage.refetchGenerationsAfterChange', showToast: false });
      throw error;
    }
  }, [projectId, effectiveProjectId, currentPage, itemsPerPage, queryClient, generationsFilters]);

  const handleCreateShot = useCallback(async (shotName: string, files: File[]): Promise<void> => {
    const result = await createShot({
      name: shotName,
      files: files.length > 0 ? files : undefined,
      dispatchSkeletonEvents: files.length > 0,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(projectId!) });
        queryClient.refetchQueries({ queryKey: queryKeys.shots.list(projectId!) });
      },
    });

    if (!result) {
      throw new Error('Shot creation failed');
    }
  }, [createShot, queryClient, projectId]);

  return {
    targetShotInfo,
    validShots,
    handleDeleteImage,
    handleAddImageToTargetShot,
    handleAddImageToTargetShotWithoutPosition,
    handleBackfillRequest,
    handleCreateShot,
    setLastAffectedShotId,
    confirmDialogProps,
  };
}
