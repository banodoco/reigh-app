/**
 * Shot update hooks.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';

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

      const { error } = await supabase
        .from('shots')
        .update({ name: shotName })
        .eq('id', shotId);

      if (error) throw error;
      return { shotId, name: shotName, projectId };
    },

    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: shotQueryKeys.list(projectId) });
    },

    onError: (error: Error) => {
      handleError(error, { context: 'useUpdateShotName', toastTitle: 'Failed to update shot name' });
    },
  });
};
