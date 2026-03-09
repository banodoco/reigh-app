import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import {
  getSourceTaskIdLegacyCompatible,
  hasOrchestratorDetails,
} from '@/shared/lib/taskIdHelpers';
import type { TaskDetailsData } from '../../types';

interface VariantTaskLike {
  params?: Record<string, unknown> | null;
}

interface UseVariantSourceTaskInput {
  projectId?: string | null;
  activeVariant: VariantTaskLike | null;
  taskDetailsData: TaskDetailsData | undefined;
}

export function useVariantSourceTask(input: UseVariantSourceTaskInput) {
  const { projectId, activeVariant, taskDetailsData } = input;

  const { variantSourceTaskId, variantHasOrchestratorDetails } = useMemo(() => {
    const variantParams = activeVariant?.params as Record<string, unknown> | undefined;
    return {
      variantSourceTaskId: getSourceTaskIdLegacyCompatible(variantParams),
      variantHasOrchestratorDetails: hasOrchestratorDetails(variantParams),
    };
  }, [activeVariant?.params]);

  const { data: variantSourceTask, isLoading: isLoadingVariantTask } = useQuery({
    queryKey: taskQueryKeys.single(variantSourceTaskId ?? '', projectId ?? null),
    queryFn: async () => {
      if (!variantSourceTaskId || !projectId) {
        return null;
      }

      const { data, error } = await supabase().from('tasks')
        .select('*')
        .eq('id', variantSourceTaskId)
        .eq('project_id', projectId)
        .single();
      if (error) {
        console.error('[VariantTaskDetails] Error fetching source task:', error);
        return null;
      }
      return data;
    },
    enabled: !!variantSourceTaskId
      && !!projectId
      && variantSourceTaskId !== taskDetailsData?.taskId
      && !variantHasOrchestratorDetails,
    staleTime: Infinity,
  });

  return {
    variantSourceTaskId,
    variantHasOrchestratorDetails,
    variantSourceTask,
    isLoadingVariantTask,
  };
}
