/**
 * Shot update hooks.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { Shot } from '@/domains/generation/types';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import {
  cancelShotsQueries,
  findShotsCache,
  rollbackShotsCaches,
  updateAllShotsCaches,
} from './cacheUtils';

/**
 * Update shot name.
 * Supports both 'name' and 'newName' parameters for backwards compatibility.
 */
export const useUpdateShotName = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shotId,
      name,
      newName,
      projectId,
    }: {
      shotId: string;
      name?: string;
      newName?: string;
      projectId: string;
    }) => {
      const shotName = newName || name;
      if (!shotName) {
        throw new Error('Shot name is required');
      }

      const { error } = await supabase().from('shots')
        .update({ name: shotName })
        .eq('id', shotId);

      if (error) throw error;
      return { shotId, name: shotName, projectId };
    },

    onMutate: async ({ shotId, name, newName, projectId }) => {
      const shotName = newName || name;
      if (!shotName) return;

      await cancelShotsQueries(queryClient, projectId);

      const previousShots = findShotsCache(queryClient, projectId);
      const previousDetail = queryClient.getQueryData<Shot>(shotQueryKeys.detail(shotId));

      updateAllShotsCaches(queryClient, projectId, (old = []) =>
        old.map((shot) => (shot.id === shotId ? { ...shot, name: shotName } : shot)),
        true,
      );

      if (previousDetail) {
        queryClient.setQueryData(shotQueryKeys.detail(shotId), {
          ...previousDetail,
          name: shotName,
        });
      }

      return { previousShots, previousDetail, projectId, shotId };
    },

    onSuccess: ({ projectId, shotId, name }) => {
      queryClient.setQueryData<Shot>(shotQueryKeys.detail(shotId), (old) =>
        old ? { ...old, name } : old
      );

      // Invalidate all list variants for this project (maxImages variants share this prefix).
      queryClient.invalidateQueries({ queryKey: [...shotQueryKeys.all, projectId] });
    },

    onError: (error: Error, _variables, context) => {
      if (context?.previousShots && context.projectId) {
        rollbackShotsCaches(queryClient, context.projectId, context.previousShots);
      }
      if (context?.previousDetail && context.shotId) {
        queryClient.setQueryData(shotQueryKeys.detail(context.shotId), context.previousDetail);
      }

      normalizeAndPresentError(error, { context: 'useUpdateShotName', toastTitle: 'Failed to update shot name' });
    },
  });
};
