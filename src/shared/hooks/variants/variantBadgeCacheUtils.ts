import type { DerivedCountsResult } from './variantBadgeTypes';

export function withGenerationBadgeCount(
  oldData: DerivedCountsResult | undefined,
  generationId: string,
  nextCount: number,
): DerivedCountsResult | undefined {
  if (!oldData) {
    return oldData;
  }

  const clampedCount = Math.max(0, nextCount);
  return {
    ...oldData,
    hasUnviewedVariants: {
      ...oldData.hasUnviewedVariants,
      [generationId]: clampedCount > 0,
    },
    unviewedVariantCounts: {
      ...oldData.unviewedVariantCounts,
      [generationId]: clampedCount,
    },
  };
}
