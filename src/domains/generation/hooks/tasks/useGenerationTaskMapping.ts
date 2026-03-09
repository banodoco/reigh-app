import { useQuery, type QueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { isUuid } from '@/shared/lib/uuid';
import { parseGenerationTaskId } from '@/shared/lib/generationTaskIdParser';
import type { GenerationTaskMappingCacheEntry } from '@/shared/lib/generationTaskRepository';

export async function fetchGenerationTaskMapping(
  generationId: string,
): Promise<GenerationTaskMappingCacheEntry> {
  if (!isUuid(generationId)) {
    return { taskId: null, status: 'not_loaded' };
  }

  const { data, error } = await supabase()
    .from('generations')
    .select('tasks')
    .eq('id', generationId)
    .maybeSingle();

  if (error) {
    return {
      taskId: null,
      status: 'query_failed',
      queryError: error.message,
    };
  }

  if (!data) {
    return { taskId: null, status: 'missing_generation' };
  }

  const parsed = parseGenerationTaskId(data.tasks);
  return {
    taskId: parsed.taskId,
    status: parsed.status,
  };
}

export function useGenerationTaskMapping(generationId: string) {
  const hasPersistedGenerationId = isUuid(generationId);
  return useQuery<GenerationTaskMappingCacheEntry>({
    queryKey: taskQueryKeys.generationMapping(generationId),
    queryFn: () => fetchGenerationTaskMapping(generationId),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: hasPersistedGenerationId,
  });
}

export async function prefetchGenerationTaskMapping(
  queryClient: QueryClient,
  generationId: string,
): Promise<GenerationTaskMappingCacheEntry | null> {
  if (!isUuid(generationId)) {
    return null;
  }

  return queryClient.fetchQuery({
    queryKey: taskQueryKeys.generationMapping(generationId),
    queryFn: () => fetchGenerationTaskMapping(generationId),
    staleTime: Infinity,
  });
}
