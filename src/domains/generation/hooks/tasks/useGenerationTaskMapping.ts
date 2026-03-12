import { useQuery, type QueryClient } from '@tanstack/react-query';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { isUuid } from '@/shared/lib/uuid';
import {
  resolveGenerationTaskMapping,
  toGenerationTaskMappingCacheEntry,
  type GenerationTaskMappingCacheEntry,
} from '@/shared/lib/tasks/generationTaskRepository';

async function fetchGenerationTaskMapping(
  generationId: string,
): Promise<GenerationTaskMappingCacheEntry> {
  if (!isUuid(generationId)) {
    return { taskId: null, status: 'not_loaded' };
  }

  return toGenerationTaskMappingCacheEntry(
    await resolveGenerationTaskMapping(generationId),
  );
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
