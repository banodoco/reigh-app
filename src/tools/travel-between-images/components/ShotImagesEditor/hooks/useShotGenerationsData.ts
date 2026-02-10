/**
 * Hook for managing shot generations data from either preloaded images or database.
 * Handles the complex data selection logic between useTimelineCore and useTimelinePositionUtils.
 */

import { useRef, useEffect, useMemo } from 'react';
import { useTimelineCore } from '@/shared/hooks/useTimelineCore';
import { useTimelinePositionUtils } from '@/shared/hooks/useTimelinePositionUtils';
import { useVariantBadges } from '@/shared/hooks/useVariantBadges';
import { isPositioned, isVideoGeneration } from '@/shared/lib/typeGuards';
import type { GenerationRow } from '@/types/shots';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

/** Generation row with badge data merged in */
interface GenerationWithBadges extends GenerationRow {
  derivedCount?: number;
  hasUnviewedVariants?: boolean;
  unviewedVariantCount?: number;
}

export interface UseShotGenerationsDataReturn {
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
  /** Exchange positions between two items */
  exchangePositions: (genIdA: string, genIdB: string) => Promise<void>;
  /** Exchange positions without reloading */
  exchangePositionsNoReload: (shotGenIdA: string, shotGenIdB: string) => Promise<void>;
  /** Batch exchange positions */
  batchExchangePositions: (updates: Array<{ id: string; position: number }>) => Promise<void>;
  /** Delete an item */
  deleteItem: (shotGenerationId: string) => Promise<void>;
  /** Reload positions */
  loadPositions: (options?: { silent?: boolean }) => Promise<void>;
  /** Update pair prompts by shot_generation.id */
  updatePairPrompts: (id: string, prompt: string, negativePrompt: string) => Promise<void>;
  /** Update pair prompts by index */
  updatePairPromptsByIndex: (index: number, prompt: string, negativePrompt: string) => Promise<void>;
  /** Clear enhanced prompt for a shot_generation */
  clearEnhancedPrompt: (shotGenerationId: string) => Promise<void>;
  /** Clear all enhanced prompts */
  clearAllEnhancedPrompts: () => Promise<void>;
  /** Get images filtered for a specific mode */
  getImagesForMode: (mode: 'batch' | 'timeline') => GenerationRow[];
  /** Add item */
  addItem: (item: GenerationRow) => void;
  /** Whether we've ever had data (prevents unmounting during refetches) */
  hasEverHadData: boolean;
}

export interface UseShotGenerationsDataProps {
  /** Selected shot ID */
  selectedShotId: string;
  /** Project ID */
  projectId?: string;
  /** Current generation mode */
  generationMode: 'batch' | 'timeline';
  /** Optional preloaded images (bypasses database queries) */
  preloadedImages?: GenerationRow[];
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
    generations: preloadedImages || coreHookData.positionedItems,
    projectId: projectId,
  });

  // Choose data source based on whether we have preloaded images
  const hookData = useMemo(() => {
    if (preloadedImages) {
      return {
        shotGenerations: utilsData.shotGenerations,
        pairPrompts: utilsData.pairPrompts,
        isLoading: utilsData.isLoading,
        error: utilsData.error ? utilsData.error.message : '',
        updateTimelineFrame: utilsData.updateTimelineFrame,
        batchExchangePositions: utilsData.batchExchangePositions,
        loadPositions: utilsData.loadPositions,
        updatePairPrompts: utilsData.updatePairPrompts,
        clearEnhancedPrompt: utilsData.clearEnhancedPrompt,
        initializeTimelineFrames: utilsData.initializeTimelineFrames,
        getImagesForMode: (_mode: 'batch' | 'timeline') => {
          // BOTH modes show only positioned non-video images
          return preloadedImages
            .filter(img => isPositioned(img) && !isVideoGeneration(img))
            .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
        },
        exchangePositions: async () => {},
        exchangePositionsNoReload: async () => {},
        deleteItem: coreHookData.deleteItem,
        updatePairPromptsByIndex: coreHookData.updatePairPromptsByIndex,
        clearAllEnhancedPrompts: coreHookData.clearAllEnhancedPrompts,
        isPersistingPositions: false,
        setIsPersistingPositions: () => {},
        getPositionsForMode: () => new Map(),
        addItem: coreHookData.addItem,
        applyTimelineFrames: async () => {},
        getPairPrompts: () => utilsData.pairPrompts,
        moveItemsToMidpoint: utilsData.moveItemsToMidpoint,
      };
    }

    return {
      shotGenerations: coreHookData.positionedItems,
      pairPrompts: coreHookData.pairPrompts,
      isLoading: coreHookData.isLoading,
      error: coreHookData.error?.message || '',
      updateTimelineFrame: coreHookData.updatePosition,
      batchExchangePositions: coreHookData.commitPositions,
      loadPositions: coreHookData.refetch,
      updatePairPrompts: coreHookData.updatePairPrompts,
      clearEnhancedPrompt: coreHookData.clearEnhancedPrompt,
      initializeTimelineFrames: async () => {},
      getImagesForMode: (mode: 'batch' | 'timeline') => coreHookData.positionedItems,
      exchangePositions: async () => {},
      exchangePositionsNoReload: async () => {},
      deleteItem: coreHookData.deleteItem,
      updatePairPromptsByIndex: coreHookData.updatePairPromptsByIndex,
      clearAllEnhancedPrompts: coreHookData.clearAllEnhancedPrompts,
      isPersistingPositions: false,
      setIsPersistingPositions: () => {},
      getPositionsForMode: () => new Map(),
      addItem: coreHookData.addItem,
      applyTimelineFrames: async () => {},
      getPairPrompts: () => coreHookData.pairPrompts,
      moveItemsToMidpoint: undefined,
    };
  }, [preloadedImages, utilsData, coreHookData]);

  // Use preloaded images if provided, otherwise use database images
  const shotGenerations = preloadedImages || hookData.shotGenerations;

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
  }, [selectedShotId]);

  // Memoize images for the current mode
  const images = useMemo(() => {
    return hookData.getImagesForMode(generationMode);
  }, [hookData.getImagesForMode, generationMode]);

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
    exchangePositions: hookData.exchangePositions,
    exchangePositionsNoReload: hookData.exchangePositionsNoReload,
    batchExchangePositions: hookData.batchExchangePositions,
    deleteItem: hookData.deleteItem,
    loadPositions: hookData.loadPositions,
    updatePairPrompts: hookData.updatePairPrompts,
    updatePairPromptsByIndex: hookData.updatePairPromptsByIndex,
    clearEnhancedPrompt: hookData.clearEnhancedPrompt,
    clearAllEnhancedPrompts: hookData.clearAllEnhancedPrompts,
    getImagesForMode: hookData.getImagesForMode,
    addItem: hookData.addItem,
    hasEverHadData: hasEverHadDataRef.current,
  };
}
