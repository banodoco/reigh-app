/**
 * Hook for managing shot generations data from either preloaded images or database.
 * Handles the complex data selection logic between useTimelineCore and useTimelinePositionUtils.
 */

import { useRef, useEffect, useMemo } from 'react';
import { useTimelineCore } from '@/shared/hooks/timeline/useTimelineCore';
import { useTimelinePositionUtils } from '../../../hooks/timeline/useTimelinePositionUtils';
import { useVariantBadges } from '@/shared/hooks/variants/useVariantBadges';
import { isPositioned, isVideoGeneration } from '@/shared/lib/typeGuards';
import type { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';

/** Generation row with badge data merged in */
interface GenerationWithBadges extends GenerationRow {
  derivedCount?: number;
  hasUnviewedVariants?: boolean;
  unviewedVariantCount?: number;
}

interface UseShotGenerationsDataReturn {
  /** Shot generations (images) - either from preloaded or database */
  shotGenerations: GenerationRow[];
  /** Memoized shot generations to prevent reference changes */
  memoizedShotGenerations: GenerationRow[];
  /** Images filtered for the current mode with badge data */
  imagesWithBadges: GenerationWithBadges[];
  /** Pair prompts keyed by shot_generation.id */
  pairPrompts: Record<string, { prompt: string; negativePrompt: string }>;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string;
  /** Update a single timeline frame position */
  updateTimelineFrame: (id: string, frame: number) => Promise<void>;
  /** Batch exchange positions */
  batchExchangePositions: (updates: Array<{ shotGenerationId: string; newFrame: number }>) => Promise<void>;
  /** Move one or more items to midpoint-distributed positions (batch reorder path) */
  moveItemsToMidpoint?: (
    draggedItemIds: string[],
    newStartIndex: number,
    allItems: Array<{ id: string; timeline_frame: number | null }>
  ) => Promise<void>;
  /** Delete an item */
  deleteItem?: (shotGenerationId: string) => Promise<void>;
  /** Reload positions */
  loadPositions: (options?: { silent?: boolean }) => Promise<void>;
  /** Clear enhanced prompt for a shot_generation */
  clearEnhancedPrompt: (shotGenerationId: string) => Promise<void>;
  /** Get images filtered for a specific mode */
  getImagesForMode: (mode: 'batch' | 'timeline' | 'by-pair') => GenerationRow[];
  /** Whether we've ever had data (prevents unmounting during refetches) */
  hasEverHadData: boolean;
}

interface UseShotGenerationsDataProps {
  /** Selected shot ID */
  selectedShotId: string;
  /** Project ID */
  projectId?: string;
  /** Current generation mode */
  generationMode: 'batch' | 'timeline' | 'by-pair';
  /** Optional preloaded images (bypasses database queries) */
  preloadedImages?: GenerationRow[];
}

interface TimelineDataSource {
  shotGenerations: GenerationRow[];
  pairPrompts: Record<string, { prompt: string; negativePrompt: string }>;
  isLoading: boolean;
  error: string;
  updateTimelineFrame: (id: string, frame: number) => Promise<void>;
  batchExchangePositions: (updates: Array<{ shotGenerationId: string; newFrame: number }>) => Promise<void>;
  moveItemsToMidpoint?: (
    draggedItemIds: string[],
    newStartIndex: number,
    allItems: Array<{ id: string; timeline_frame: number | null }>
  ) => Promise<void>;
  deleteItem?: (shotGenerationId: string) => Promise<void>;
  loadPositions: (options?: { silent?: boolean }) => Promise<void>;
  clearEnhancedPrompt: (shotGenerationId: string) => Promise<void>;
  getImagesForMode: (mode: 'batch' | 'timeline' | 'by-pair') => GenerationRow[];
}

export function useShotGenerationsData({
  selectedShotId,
  projectId,
  generationMode,
  preloadedImages,
}: UseShotGenerationsDataProps): UseShotGenerationsDataReturn {
  // Core hook data (used when no preloaded images)
  const coreHookData = useTimelineCore(preloadedImages ? null : selectedShotId);

  // Utility hook data (used when preloaded images provided)
  const utilsData = useTimelinePositionUtils({
    shotId: preloadedImages ? selectedShotId : null,
    generations: preloadedImages || [],
    projectId: projectId,
  });

  // Choose data source based on whether we have preloaded images
  const hookData = useMemo<TimelineDataSource>(() => {
    if (preloadedImages) {
      return {
        shotGenerations: preloadedImages,
        pairPrompts: utilsData.pairPrompts as Record<string, { prompt: string; negativePrompt: string }>,
        isLoading: utilsData.isLoading,
        error: utilsData.error ? utilsData.error.message : '',
        updateTimelineFrame: utilsData.updateTimelineFrame,
        batchExchangePositions: utilsData.batchExchangePositions,
        moveItemsToMidpoint: utilsData.moveItemsToMidpoint,
        loadPositions: async (options) => {
          await utilsData.loadPositions({ silent: options?.silent });
        },
        clearEnhancedPrompt: utilsData.clearEnhancedPrompt,
        getImagesForMode: () => {
          // BOTH modes show only positioned non-video images
          return preloadedImages
            .filter(img => isPositioned(img) && !isVideoGeneration(img))
            .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
        },
      };
    }

    return {
      shotGenerations: coreHookData.positionedItems,
      pairPrompts: coreHookData.pairPrompts as Record<string, { prompt: string; negativePrompt: string }>,
      isLoading: coreHookData.isLoading,
      error: coreHookData.error?.message || '',
      updateTimelineFrame: coreHookData.updatePosition,
      batchExchangePositions: coreHookData.commitPositions,
      loadPositions: async (options) => {
        await Promise.resolve(coreHookData.refetch());
      },
      clearEnhancedPrompt: coreHookData.clearEnhancedPrompt,
      getImagesForMode: () => coreHookData.positionedItems,
      deleteItem: coreHookData.deleteItem,
    };
  }, [preloadedImages, utilsData, coreHookData]);

  const shotGenerations = hookData.shotGenerations;

  // Memoize shotGenerations to prevent reference changes
  const memoizedShotGenerations = useMemo(() => shotGenerations, [shotGenerations]);

  // Track if we've ever had data to prevent unmounting during refetches
  const hasEverHadDataRef = useRef(false);
  if (memoizedShotGenerations.length > 0) {
    hasEverHadDataRef.current = true;
  }

  // Reset when shot changes
  useEffect(() => {
    hasEverHadDataRef.current = memoizedShotGenerations.length > 0;
  }, [selectedShotId, memoizedShotGenerations.length]);

  const { getImagesForMode } = hookData;

  // Memoize images for the current mode
  const images = useMemo(() => {
    return getImagesForMode(generationMode);
  }, [getImagesForMode, generationMode]);

  // Extract generation IDs for variant badge fetching
  const generationIds = useMemo(() =>
    images.map((img) => getGenerationId(img)).filter(Boolean) as string[],
    [images]
  );

  // Lazy-load variant badge data
  const { getBadgeData, isLoading: isBadgeDataLoading } = useVariantBadges(generationIds);

  // Merge badge data with images
  const imagesWithBadges = useMemo(() => {
    // Don't merge badge data while loading - prevents showing "0" badges
    if (isBadgeDataLoading) {
      return images;
    }
    return images.map((img): GenerationWithBadges => {
      const generationId = getGenerationId(img);
      if (!generationId) return img;
      const badgeData = getBadgeData(generationId);
      return {
        ...img,
        derivedCount: badgeData.derivedCount,
        hasUnviewedVariants: badgeData.hasUnviewedVariants,
        unviewedVariantCount: badgeData.unviewedVariantCount,
      };
    });
  }, [images, getBadgeData, isBadgeDataLoading]);

  return {
    shotGenerations,
    memoizedShotGenerations,
    imagesWithBadges,
    pairPrompts: hookData.pairPrompts,
    isLoading: hookData.isLoading,
    error: hookData.error,
    updateTimelineFrame: hookData.updateTimelineFrame,
    batchExchangePositions: hookData.batchExchangePositions,
    moveItemsToMidpoint: hookData.moveItemsToMidpoint,
    deleteItem: hookData.deleteItem,
    loadPositions: hookData.loadPositions,
    clearEnhancedPrompt: hookData.clearEnhancedPrompt,
    getImagesForMode: hookData.getImagesForMode,
    hasEverHadData: hasEverHadDataRef.current,
  };
}
