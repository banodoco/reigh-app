/**
 * Composite shot creation operations.
 * These combine multiple operations (upload, create, add) into unified workflows.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { invalidateGenerationsSync } from '@/shared/hooks/invalidation/useGenerationInvalidation';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useCreateShot } from './useShotsCrud';
import { useAddImageToShot, useAddImageToShotWithoutPosition } from './useShotGenerationMutations';
import { processDroppedImages, type ExternalImageDropVariables } from './externalImageDrop';

interface CreateShotWithImageResponse {
  shot_id: string;
  shot_name: string;
  shot_generation_id: string;
  success: boolean;
}

export const useCreateShotWithImage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      shotName,
      generationId,
    }: {
      projectId: string;
      shotName: string;
      generationId: string;
    }) => {
      const { data, error } = await supabase().rpc('create_shot_with_image', {
          p_project_id: projectId,
          p_shot_name: shotName,
          p_generation_id: generationId,
        })
        .single();

      if (error) {
        throw error;
      }

      const typedData = data as CreateShotWithImageResponse;
      if (!typedData?.success) {
        throw new Error('Failed to create shot with image');
      }

      return {
        shotId: typedData.shot_id,
        shotName: typedData.shot_name,
        shotGenerationId: typedData.shot_generation_id,
      };
    },

    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.shots.all, variables.projectId],
        refetchType: 'inactive',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.unified.projectPrefix(variables.projectId),
        refetchType: 'inactive',
      });

      if (data.shotId) {
        invalidateGenerationsSync(queryClient, data.shotId, {
          reason: 'create-shot-with-image',
          scope: 'all',
          delayMs: 100,
        });
      }
    },

    onError: (error: Error) => {
      normalizeAndPresentError(error, { context: 'useShotCreation', toastTitle: 'Failed to create shot with image' });
    },
  });
};

export const useHandleExternalImageDrop = () => {
  const createShotMutation = useCreateShot();
  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();

  return useMutation({
    mutationFn: async (variables: ExternalImageDropVariables) => {
      const { currentProjectQueryKey } = variables;
      if (!currentProjectQueryKey) {
        toast.error('Cannot add image(s): current project is not identified.');
        return null;
      }

      try {
        return await processDroppedImages({
          variables,
          projectId: currentProjectQueryKey,
          createShot: createShotMutation.mutateAsync,
          addImageToShot: addImageToShotMutation.mutateAsync,
          addImageToShotWithoutPosition: addImageToShotWithoutPositionMutation.mutateAsync,
        });
      } catch (error) {
        normalizeAndPresentError(error, { context: 'useShotCreation', toastTitle: 'Failed to process dropped image(s)' });
        return null;
      }
    },
  });
};
