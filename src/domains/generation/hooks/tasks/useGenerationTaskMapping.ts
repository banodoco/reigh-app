import { useQuery, type QueryClient } from '@tanstack/react-query';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { isUuid } from '@/shared/lib/uuid';
import { useRuntimeAuthority } from '@/app/runtime/runtimeAuthority';
import { getRuntimeDocumentProjectId } from '@/app/runtime/runtimeDocument';
import type { RuntimeAuthority } from '@/app/runtime/runtimeAuthority';
import {
  resolveGenerationTaskMapping,
  toGenerationTaskMappingCacheEntry,
  type GenerationTaskMappingCacheEntry,
} from '@/shared/lib/tasks/generationTaskRepository';

async function fetchGenerationTaskMapping(
  generationId: string,
  authority: ReturnType<typeof useRuntimeAuthority>,
): Promise<GenerationTaskMappingCacheEntry> {
  return toGenerationTaskMappingCacheEntry(
    await resolveGenerationTaskMapping(generationId, { authority }),
  );
}

export function useGenerationTaskMapping(generationId: string) {
  const authority = useRuntimeAuthority();
  const hasPersistedGenerationId = authority.runtimeAuthority
    ? Boolean(authority.runtimeProjectId && generationId)
    : isUuid(generationId);
  return useQuery<GenerationTaskMappingCacheEntry>({
    queryKey: authority.runtimeAuthority
      ? ['runtime', 'generation-task-mapping', authority.runtimeProjectId, generationId]
      : taskQueryKeys.generationMapping(generationId),
    queryFn: () => fetchGenerationTaskMapping(generationId, authority),
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
  authority?: RuntimeAuthority,
): Promise<GenerationTaskMappingCacheEntry> {
  const effectiveAuthority = authority ?? (() => {
    const runtimeProjectId = getRuntimeDocumentProjectId();
    return { runtimeAuthority: runtimeProjectId !== null, runtimeProjectId };
  })();
  if (effectiveAuthority.runtimeAuthority && !effectiveAuthority.runtimeProjectId) {
    return { taskId: null, status: 'not_loaded' };
  }
  if (!effectiveAuthority.runtimeAuthority && !isUuid(generationId)) {
    return { taskId: null, status: 'not_loaded' };
  }

  return queryClient.fetchQuery({
    queryKey: effectiveAuthority.runtimeAuthority
      ? ['runtime', 'generation-task-mapping', effectiveAuthority.runtimeProjectId, generationId]
      : taskQueryKeys.generationMapping(generationId),
    queryFn: () => fetchGenerationTaskMapping(generationId, effectiveAuthority),
    staleTime: Infinity,
  });
}
