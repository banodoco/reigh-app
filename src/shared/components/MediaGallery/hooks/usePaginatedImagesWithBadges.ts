import { useMemo } from 'react';
import { useVariantBadges } from '@/shared/hooks/variants/useVariantBadges';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { getRuntimeDocumentProjectId } from '@/app/runtime/runtimeDocument';
import type { GeneratedImageWithMetadata } from '../types';

interface UsePaginatedImagesWithBadgesParams {
  paginatedImages: GeneratedImageWithMetadata[] | undefined;
}

export function usePaginatedImagesWithBadges({ paginatedImages }: UsePaginatedImagesWithBadgesParams) {
  const runtimeMode = getRuntimeDocumentProjectId() !== null;
  const paginatedGenerationIds = useMemo(
    () =>
      (runtimeMode ? [] : paginatedImages || [])
        .map((image) => getGenerationId(image))
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    [paginatedImages, runtimeMode],
  );

  const { getBadgeData, isLoading: isBadgeDataLoading } = useVariantBadges(paginatedGenerationIds);

  const paginatedImagesWithBadges = useMemo(() => {
    if (!paginatedImages) {
      return [];
    }

    if (runtimeMode) {
      return paginatedImages;
    }

    return paginatedImages.map((image) => {
      if (isBadgeDataLoading) {
        const { derivedCount, hasUnviewedVariants, unviewedVariantCount, ...imageWithoutBadges } = image;
        return imageWithoutBadges;
      }

      const generationId = getGenerationId(image);
      const badgeData = generationId
        ? getBadgeData(generationId)
        : { derivedCount: 0, hasUnviewedVariants: false, unviewedVariantCount: 0 };

      return {
        ...image,
        derivedCount: badgeData.derivedCount,
        hasUnviewedVariants: badgeData.hasUnviewedVariants,
        unviewedVariantCount: badgeData.unviewedVariantCount,
      };
    });
  }, [paginatedImages, getBadgeData, isBadgeDataLoading, runtimeMode]);

  return {
    paginatedImagesWithBadges,
    isBadgeDataLoading,
  };
}
