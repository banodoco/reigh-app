import { useQuery, type QueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  fetchGenerationDetailById,
} from '@/integrations/supabase/repositories/generationRepository';
import {
  fetchRuntimeGenerationSnapshot,
  runtimeSnapshotToDetail,
  type GenerationDetailProjection,
  type RuntimeGenerationDetail,
} from '@/integrations/runtime/generationAccess';
import { useRuntimeAuthority, type RuntimeAuthority } from '@/app/runtime/runtimeAuthority';
import { resolveRuntimeAuthority } from '@/app/runtime/runtimeAuthority';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';

export type GenerationDetail = GenerationDetailProjection | RuntimeGenerationDetail;

function defaultRuntimeAuthority(): RuntimeAuthority {
  return resolveRuntimeAuthority();
}

/**
 * The one cache entry for a generation detail read. Variants, source metadata,
 * and lineage all come from this payload, so mounting those consumers together
 * cannot issue duplicate detail requests.
 */
export function createGenerationDetailQueryOptions(
  generationId: string,
  authority: RuntimeAuthority = defaultRuntimeAuthority(),
  projectId: string | null = getProjectSelectionFallbackId(),
): UseQueryOptions<GenerationDetail | null, Error> {
  const { runtimeAuthority, runtimeProjectId } = authority;
  return {
    queryKey: runtimeAuthority
      ? ['runtime', 'generation-detail', runtimeProjectId, generationId]
      : ['supabase', 'generation-detail', projectId, generationId],
    queryFn: async () => {
      if (runtimeAuthority) {
        if (!runtimeProjectId) {
          throw new Error('Runtime project authority is still resolving.');
        }
        const snapshot = await fetchRuntimeGenerationSnapshot(generationId);
        if (!snapshot || snapshot.generation.project_id !== runtimeProjectId) return null;
        return runtimeSnapshotToDetail(snapshot);
      }
      return fetchGenerationDetailById(generationId);
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  };
}

export function fetchGenerationDetailQuery(
  queryClient: QueryClient,
  generationId: string,
  authority?: RuntimeAuthority,
  projectId?: string | null,
): Promise<GenerationDetail | null> {
  return queryClient.fetchQuery(createGenerationDetailQueryOptions(generationId, authority, projectId));
}

export function useGenerationDetail(
  generationId: string | null,
  enabled = true,
) {
  const authority = useRuntimeAuthority();
  const projectId = getProjectSelectionFallbackId();
  return useQuery<GenerationDetail | null, Error>({
    ...createGenerationDetailQueryOptions(generationId ?? 'none', authority, projectId),
    enabled: enabled && Boolean(generationId)
      && (!authority.runtimeAuthority || Boolean(authority.runtimeProjectId)),
  });
}
