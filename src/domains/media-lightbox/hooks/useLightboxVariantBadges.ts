/**
 * useLightboxVariantBadges
 *
 * Computes pending task count, unviewed variant count, and mark-all-viewed handler.
 * Shared between ImageLightbox and VideoLightbox (identical pattern in both).
 */

import { useMemo, useCallback } from 'react';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import { usePendingGenerationTasks } from '@/shared/hooks/tasks/usePendingGenerationTasks';
import { useMarkVariantViewed } from '@/shared/hooks/variants/useMarkVariantViewed';
import { useVariantBadges } from '@/shared/hooks/variants/useVariantBadges';

interface UseLightboxVariantBadgesInput {
  /** Generation ID to check for pending tasks */
  pendingTaskGenerationId: string | null;
  /** Project ID for task queries */
  selectedProjectId: string | null;
  /** Variant list (for computing unviewed count) */
  variants: GenerationVariant[];
  /** Generation ID used for variant fetching (for mark-all-viewed) */
  variantFetchGenerationId: string | null;
}

interface UseLightboxVariantBadgesReturn {
  pendingTaskCount: number;
  unviewedVariantCount: number;
  handleMarkAllViewed: () => void;
}

export function useLightboxVariantBadges({
  pendingTaskGenerationId,
  selectedProjectId,
  variants,
  variantFetchGenerationId,
}: UseLightboxVariantBadgesInput): UseLightboxVariantBadgesReturn {
  const { pendingCount: pendingTaskCount } = usePendingGenerationTasks(pendingTaskGenerationId, selectedProjectId);

  const localUnviewedVariantCount = useMemo(() => {
    if (!variants || variants.length === 0) return 0;
    return variants.filter((v) => v.viewed_at === null).length;
  }, [variants]);

  const {
    getBadgeData,
    isLoading: isBadgeDataLoading,
  } = useVariantBadges(
    variantFetchGenerationId ? [variantFetchGenerationId] : [],
    !!variantFetchGenerationId
  );

  const badgeUnviewedVariantCount = useMemo(() => {
    if (!variantFetchGenerationId) return 0;
    return getBadgeData(variantFetchGenerationId).unviewedVariantCount;
  }, [getBadgeData, variantFetchGenerationId]);

  // Use the same aggregate badge source as gallery/timeline once loaded.
  // Fall back to local variants while badge data is still loading.
  const unviewedVariantCount = variantFetchGenerationId && !isBadgeDataLoading
    ? badgeUnviewedVariantCount
    : localUnviewedVariantCount;

  const { markAllViewed: markAllViewedMutation } = useMarkVariantViewed();
  const handleMarkAllViewed = useCallback(() => {
    if (variantFetchGenerationId) {
      markAllViewedMutation(variantFetchGenerationId);
    }
  }, [markAllViewedMutation, variantFetchGenerationId]);

  return {
    pendingTaskCount,
    unviewedVariantCount,
    handleMarkAllViewed,
  };
}
