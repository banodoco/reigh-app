/**
 * useModalImageHandlers - Lightweight composition of existing mutation hooks
 * for use in VideoGenerationModal's ShotImagesEditor.
 *
 * Does NOT depend on ShotSettingsContext or ShotEditorState.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GenerationRow } from '@/domains/generation/types';
import {
  useRemoveImageFromShot,
  useAddImageToShot,
  useUpdateShotImageOrder,
} from '@/shared/hooks/shots/useShotGenerationMutations';
import { useDuplicateAsNewGeneration } from '@/shared/hooks/shots/useDuplicateAsNewGeneration';
import { useHandleExternalImageDrop } from '@/shared/hooks/shots/useShotCreation';
import { queryKeys } from '@/shared/lib/queryKeys';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

export function useModalImageHandlers(
  shotId: string,
  projectId: string,
  orderedImages: GenerationRow[],
  batchVideoFrames: number,
) {
  const queryClient = useQueryClient();
  const removeImage = useRemoveImageFromShot();
  const addImage = useAddImageToShot();
  const reorderImages = useUpdateShotImageOrder();
  const duplicateImage = useDuplicateAsNewGeneration();
  const externalDrop = useHandleExternalImageDrop();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | undefined>();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['shotImages', shotId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.parents(shotId, projectId) });
  }, [queryClient, shotId, projectId]);

  const onImageReorder = useCallback((orderedIds: string[]) => {
    const updates = orderedIds.map((shotGenId, index) => {
      const img = orderedImages.find((i) => i.id === shotGenId);
      return {
        shot_id: shotId,
        generation_id: img?.generation_id ?? shotGenId,
        timeline_frame: index * batchVideoFrames,
      };
    });
    reorderImages.mutate({ shotId, projectId, updates }, { onSuccess: invalidate });
  }, [orderedImages, shotId, projectId, batchVideoFrames, reorderImages, invalidate]);

  const onImageDelete = useCallback((id: string) => {
    removeImage.mutate({ shotId, shotGenerationId: id, projectId }, { onSuccess: invalidate });
  }, [removeImage, shotId, projectId, invalidate]);

  const onBatchImageDelete = useCallback((ids: string[]) => {
    ids.forEach((id) => {
      removeImage.mutate({ shotId, shotGenerationId: id, projectId });
    });
    invalidate();
  }, [removeImage, shotId, projectId, invalidate]);

  const onGenerationDrop = useCallback(async (
    generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number,
  ) => {
    addImage.mutate({
      shot_id: shotId,
      generation_id: generationId,
      project_id: projectId,
      imageUrl,
      thumbUrl,
      timelineFrame: targetFrame ?? null,
    }, { onSuccess: invalidate });
  }, [addImage, shotId, projectId, invalidate]);

  const onFileDrop = useCallback(async (files: File[], targetFrame?: number) => {
    setIsUploadingImage(true);
    try {
      await externalDrop.mutateAsync({
        imageFiles: files,
        targetShotId: shotId,
        currentProjectQueryKey: projectId,
        currentShotCount: 0,
        positions: targetFrame != null ? [targetFrame] : undefined,
        onProgress: (_fi, _fp, overall) => setUploadProgress(overall),
      });
      invalidate();
    } finally {
      setIsUploadingImage(false);
      setUploadProgress(undefined);
    }
  }, [externalDrop, shotId, projectId, invalidate]);

  const onImageUpload = useCallback(async (files: File[]) => {
    await onFileDrop(files);
  }, [onFileDrop]);

  const onImageDuplicate = useCallback((id: string, timelineFrame: number) => {
    const img = orderedImages.find((i) => i.id === id);
    if (!img) return;
    duplicateImage.mutate({
      shot_id: shotId,
      generation_id: img.generation_id || id,
      project_id: projectId,
      timeline_frame: timelineFrame,
    }, { onSuccess: invalidate });
  }, [duplicateImage, orderedImages, shotId, projectId, invalidate]);

  // Final video delete: clear location/thumbnail + remove non-original variants
  const onDeleteFinalVideo = useCallback(async (generationId: string) => {
    try {
      const { error: updateError } = await supabase().from('generations')
        .update({ location: null, thumbnail_url: null })
        .eq('id', generationId);

      if (updateError) {
        normalizeAndPresentError(updateError, { context: 'FinalVideoDelete', toastTitle: 'Failed to clear final video' });
        return;
      }

      await supabase().from('generation_variants')
        .delete()
        .eq('generation_id', generationId)
        .neq('variant_type', 'original');

      queryClient.invalidateQueries({ queryKey: queryKeys.segments.parents(shotId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'FinalVideoDelete', toastTitle: 'Failed to clear final video' });
    }
  }, [queryClient, shotId, projectId]);

  return {
    onImageReorder,
    onImageDelete,
    onBatchImageDelete,
    onGenerationDrop,
    onBatchGenerationDrop: onGenerationDrop,
    onFileDrop,
    onBatchFileDrop: onFileDrop,
    onImageUpload,
    onImageDuplicate,
    onDeleteFinalVideo,
    isUploadingImage,
    uploadProgress,
  };
}
