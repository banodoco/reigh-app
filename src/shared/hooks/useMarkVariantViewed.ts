/**
 * useMarkVariantViewed Hook
 *
 * Marks a variant as viewed in the database and invalidates all relevant queries.
 * Used when user views a variant in the lightbox to remove the NEW badge.
 *
 * Now includes optimistic update support - the badge count is decremented immediately
 * before the database update completes.
 *
 * Usage:
 *   const { markViewed, markAllViewed } = useMarkVariantViewed();
 *   markViewed({ variantId, generationId }); // generationId enables optimistic update
 *   markAllViewed(generationId); // marks all unviewed variants for a generation
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { DerivedCountsResult } from '@/shared/lib/generationTransformers';
import { queryKeys } from '@/shared/lib/queryKeys';

interface MarkViewedParams {
  variantId: string;
  generationId?: string; // Optional: enables optimistic badge update
}

interface MarkAllViewedParams {
  generationId: string;
}

export function useMarkVariantViewed() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ variantId, generationId }: MarkViewedParams) => {
      const { error } = await supabase().from('generation_variants')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', variantId)
        .is('viewed_at', null);

      if (error) {
        console.error('[useMarkVariantViewed] Error:', error);
        throw error;
      }

      return { variantId, generationId };
    },
    onMutate: async ({ generationId }) => {
      // Optimistic update: immediately decrement the unviewed count for this generation
      if (generationId) {
        // Find and update any variant-badges queries that include this generation
        queryClient.setQueriesData(
          { queryKey: queryKeys.generations.variantBadges, exact: false },
          (oldData: DerivedCountsResult | undefined) => {
            if (!oldData) return oldData;

            const currentCount = oldData.unviewedVariantCounts[generationId] || 0;
            const newCount = Math.max(0, currentCount - 1);

            return {
              ...oldData,
              hasUnviewedVariants: {
                ...oldData.hasUnviewedVariants,
                [generationId]: newCount > 0,
              },
              unviewedVariantCounts: {
                ...oldData.unviewedVariantCounts,
                [generationId]: newCount,
              },
            };
          }
        );
      }
    },
    onSuccess: () => {
      // Only invalidate variant-level queries — viewed_at doesn't change generation data
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.derivedAll });

      // NOTE: We intentionally do NOT invalidate variant-badges here.
      // The optimistic update in onMutate already updated the badge count.
      // Invalidating would trigger a refetch that could race with the DB update.
      // Badge data will sync naturally when staleTime (30s) expires.
    },
    onError: (error) => {
      normalizeAndPresentError(error, { context: 'useMarkVariantViewed', showToast: false });
    },
  });

  // Bulk mutation: mark ALL unviewed variants for a generation
  const bulkMutation = useMutation({
    mutationFn: async ({ generationId }: MarkAllViewedParams) => {
      const { error } = await supabase().from('generation_variants')
        .update({ viewed_at: new Date().toISOString() })
        .eq('generation_id', generationId)
        .is('viewed_at', null);

      if (error) {
        console.error('[useMarkVariantViewed] Bulk error:', error);
        throw error;
      }

      return { generationId };
    },
    onMutate: async ({ generationId }) => {
      // Optimistic update: immediately set unviewed count to 0 for this generation
      queryClient.setQueriesData(
        { queryKey: queryKeys.generations.variantBadges, exact: false },
        (oldData: DerivedCountsResult | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            hasUnviewedVariants: {
              ...oldData.hasUnviewedVariants,
              [generationId]: false,
            },
            unviewedVariantCounts: {
              ...oldData.unviewedVariantCounts,
              [generationId]: 0,
            },
          };
        }
      );
    },
    onSuccess: () => {
      // Only invalidate variant-level queries — viewed_at doesn't change generation data
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.derivedAll });
    },
    onError: (error) => {
      normalizeAndPresentError(error, { context: 'useMarkVariantViewed', showToast: false });
    },
  });

  return {
    markViewed: mutation.mutate,
    markAllViewed: (generationId: string) => bulkMutation.mutate({ generationId }),
    isMarking: mutation.isPending,
    isMarkingAll: bulkMutation.isPending,
  };
}

// NOTE: Default export removed - use named export { useMarkVariantViewed } instead
