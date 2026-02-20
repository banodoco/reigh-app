/**
 * Shared helpers for shot-generation mutation hooks.
 * These are standalone concerns extracted from useShotGenerationMutations.
 */

import { QueryClient } from '@tanstack/react-query';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import { SHOT_FILTER } from '@/shared/constants/filterConstants';

// ============================================================================
// HELPER: Check for quota/server errors
// ============================================================================

export const isQuotaOrServerError = (error: Error): boolean => {
  const msg = error.message?.toLowerCase() || '';
  return (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('quota') ||
    msg.includes('limit') ||
    msg.includes('capacity')
  );
};

// ============================================================================
// HELPER: Optimistically remove from unified-generations cache
// ============================================================================

export function optimisticallyRemoveFromUnifiedGenerations(
  queryClient: QueryClient,
  projectId: string,
  generationId: string
): number {
  const unifiedGenQueries = queryClient.getQueriesData<{
    items: Array<{ id: string; generation_id?: string }>;
    total: number;
    hasMore?: boolean;
  }>({ queryKey: unifiedGenerationQueryKeys.projectPrefix(projectId) });

  let updatedCount = 0;

  unifiedGenQueries.forEach(([queryKey, data]) => {
    // Only remove from 'no-shot' filter views
    const filters = queryKey[5] as { shotId?: string } | undefined;
    if (filters?.shotId !== SHOT_FILTER.NO_SHOT) {
      return;
    }

    if (data?.items) {
      const filteredItems = data.items.filter(
        item => item.id !== generationId && item.generation_id !== generationId
      );

      if (filteredItems.length < data.items.length) {
        queryClient.setQueryData(queryKey, {
          ...data,
          items: filteredItems,
          total: Math.max(0, (data.total || 0) - 1),
        });
        updatedCount++;
      }
    }
  });

  return updatedCount;
}
