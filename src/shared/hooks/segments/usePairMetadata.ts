/**
 * usePairMetadata - Query hook for segment pair metadata
 *
 * Fetches metadata from shot_generations table for a specific pair.
 * This includes segment overrides, enhanced prompts, and other pair-level data.
 */

import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { segmentQueryKeys } from '@/shared/lib/queryKeys/segments';
import type { PairMetadata } from '@/shared/components/segmentSettingsMigration';

interface UsePairMetadataReturn {
  data: PairMetadata | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function usePairMetadata(
  pairShotGenerationId: string | null | undefined
): UsePairMetadataReturn {
  const query = useQuery({
    queryKey: segmentQueryKeys.pairMetadata(pairShotGenerationId || ''),
    queryFn: async (): Promise<PairMetadata | null> => {
      if (!pairShotGenerationId) return null;

      const { data, error } = await supabase().from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (error) {
        console.error('[usePairMetadata] Error fetching:', error);
        return null;
      }

      return (data?.metadata as PairMetadata) || null;
    },
    enabled: !!pairShotGenerationId,
    staleTime: 10000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
