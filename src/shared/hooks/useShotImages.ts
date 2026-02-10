/**
 * Shot-Specific Image Queries (useShotImages)
 * ============================================
 *
 * This module provides hooks for querying images within a SPECIFIC SHOT.
 * Use these hooks when working with the timeline, shot editor, or any shot-scoped view.
 *
 * ## When to Use
 * - Displaying images in a shot's timeline or image grid
 * - You need timeline_frame positioning data
 * - You need pair_prompt or other shot-specific metadata
 * - Working in ShotImageManager, Timeline, or shot editors
 *
 * ## When NOT to Use
 * - Project-wide gallery views → use `useProjectGenerations` from `useGenerations.ts`
 * - Filtering across all shots → use `useProjectGenerations` with shotId filter
 * - Page-level state management → use `useGalleryPageState.ts`
 *
 * ## Key Exports
 * - `useShotImages(shotId)` - All images in a shot (the base query)
 *   (alias: `useAllShotGenerations` for backwards compatibility)
 * - `useTimelineImages(shotId)` - Positioned, non-video images only
 * - `useUnpositionedImages(shotId)` - Unpositioned images only
 * - `useVideoOutputs(shotId)` - Video generations only
 *
 * ## Data Source
 * Queries `shot_generations` JOIN `generations` (shot-scoped, includes positioning data)
 *
 * ## Data Shape
 * Returns `GenerationRow` which includes:
 * - `timeline_frame: number | null` - Position on timeline (null if unpositioned)
 * - `shotImageEntryId: string` - The shot_generations.id (needed for mutations)
 * - `metadata: { pair_prompt, enhanced_prompt, ... }` - Shot-specific metadata
 *
 * @module useShotImages
 */

import { useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GenerationRow } from '@/types/shots';
import { QUERY_PRESETS, STANDARD_RETRY, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import { queryKeys } from '@/shared/lib/queryKeys';
import React from 'react';

import { mapShotGenerationToRow } from '@/shared/hooks/useShots';

/**
 * Hook for loading ALL shot generations (non-paginated)
 * 
 * **ARCHITECTURE:**
 * Single query to shot_generations with join to generations table.
 * Returns complete data in one request for simplicity and reliability.
 * 
 * **Data Loaded:**
 * - All shot_generations for the shot (positioned + unpositioned)
 * - Full generation data (location, type, starred, etc.)
 * - Metadata (pair_prompt, enhanced_prompt, timeline positioning data)
 * - shotImageEntryId (required for mutations)
 * 
 * **Cache Sync:**
 * When data is loaded, automatically updates the shots list cache
 * to keep shot list views in sync with editor views.
 * 
 * **Use Cases:**
 * - Image galleries and lightboxes
 * - Timeline display (filter to positioned images)
 * - Shot image management
 * 
 * @param shotId - The shot ID to load generations for
 * @param options - Query options
 * @param options.disableRefetch - Prevents refetching during drag/persist operations
 * @returns Query result with GenerationRow[] data
 * 
 * @example
 * ```typescript
 * // General use (preferred new name)
 * const { data: allImages } = useShotImages(shotId);
 *
 * // With refetch disabled during sensitive operations
 * const { data: images } = useShotImages(shotId, { disableRefetch: isDragging });
 * ```
 */
const useAllShotGenerations = (
  shotId: string | null,
  options?: {
    // When true, prevents query from refetching during sensitive operations (drag, persist, etc.)
    disableRefetch?: boolean;
  }
): UseQueryResult<GenerationRow[]> => {
  const stableShotId = React.useMemo(() => shotId, [shotId]);
  const isEnabled = React.useMemo(() => {
    if (options?.disableRefetch) {
      return false;
    }
    return !!stableShotId;
  }, [stableShotId, options?.disableRefetch]);
  
  // Get queryClient for cache access in queryFn (for abort handling)
  const queryClient = useQueryClient();
  
  // ============================================================================
  // SINGLE QUERY: Fetch from shot_generations with join to generations
  // This replaces the previous two-phase approach for simpler, more reliable data
  // ============================================================================
  const mainQuery = useQuery<GenerationRow[], Error>({
    queryKey: queryKeys.generations.byShot(stableShotId!),
    enabled: isEnabled,
    // Use realtimeBacked preset - data freshness from realtime + mutations
    // (invalidated by RealtimeProvider + useGenerationInvalidation)
    ...QUERY_PRESETS.realtimeBacked,
    staleTime: 0, // CRITICAL: Always refetch from DB when opening shot, even if primed
    retry: STANDARD_RETRY,
    // NOTE: Removed placeholderData: (previousData) => previousData
    // This was causing cross-shot data leakage - when navigating to a new shot,
    // the previous shot's images would briefly appear as "placeholder" data
    queryFn: async ({ signal }) => {
      const startTime = Date.now();

      // Query shot_generations with embedded generations data + primary variant
      // NOTE: Must specify FK explicitly to avoid ambiguous relationship error (PGRST201)
      // since there are two FKs between shot_generations and generations
      // We also fetch the primary_variant using the generations.primary_variant_id FK
      // to get the correct display URL (primary variant may differ from generation.location)
      const response = await supabase
        .from('shot_generations')
        .select(`
          id,
          generation_id,
          timeline_frame,
          metadata,
          generation:generations!shot_generations_generation_id_generations_id_fk (
            id,
            location,
            thumbnail_url,
            type,
            created_at,
            starred,
            name,
            based_on,
            params,
            primary_variant_id,
            primary_variant:generation_variants!generations_primary_variant_id_fkey (
              location,
              thumbnail_url
            )
          )
        `)
        .eq('shot_id', stableShotId!)
        .order('timeline_frame', { ascending: true, nullsFirst: false })
        .abortSignal(signal);
      
      if (response.error) {
        // Abort errors are expected during rapid invalidations - silently return cached data
        if (response.error.code === '20' || response.error.message?.includes('abort')) {
          const cachedData = queryClient.getQueryData<GenerationRow[]>(queryKeys.generations.byShot(stableShotId!));
          return cachedData || [];
        }
        console.error('[DataTrace] ❌ NETWORK FETCH ERROR:', response.error);
        throw response.error;
      }

      // Transform to standardized GenerationRow format using shared mapper
      const baseResult: GenerationRow[] = (response.data || [])
        .map(mapShotGenerationToRow)
        .filter(Boolean) as GenerationRow[];

      // Badge data (derivedCount, hasUnviewedVariants, unviewedVariantCount) is now loaded
      // lazily via useVariantBadges hook to avoid blocking gallery display
      const result = baseResult;

      const duration = Date.now() - startTime;
      
      // [DuplicateGenDebug] Check for duplicate generation_ids (same gen appearing multiple times)
      const genIdCounts = new Map<string, number>();
      result.forEach(r => {
        if (r.generation_id) {
          const count = genIdCounts.get(r.generation_id) || 0;
          genIdCounts.set(r.generation_id, count + 1);
        }
      });
      const duplicateGenIds = Array.from(genIdCounts.entries()).filter(([_, count]) => count > 1);
      
      return result;
    },
    retryDelay: STANDARD_RETRY_DELAY,
  });

  // Use the query data directly (no merging needed)
  const mergedData = mainQuery.data;

  // ============================================================================
  // Return query result (simplified - single query, no phases)
  // ============================================================================
  return mainQuery as UseQueryResult<GenerationRow[]>;
};

// ============================================================================
// SELECTOR HOOKS - Centralized filtering for different views
// These provide stable, memoized views of shot data. When mutations update
// the cache with optimistic data, all selectors automatically see the change.
// ============================================================================

/**
 * Selector: Timeline images (positioned, non-video, with valid location)
 *
 * Returns images that should appear on the timeline:
 * - Has valid timeline_frame (not null, >= 0)
 * - Is not a video generation
 * - Has valid location (not null, not placeholder)
 * - Sorted by timeline_frame ascending
 *
 * CRITICAL: Location filtering ensures UI counts match task creation counts
 * (see generateVideoService.ts for the same filtering logic)
 *
 * @param shotId - The shot ID to get timeline images for
 * @returns Query result with filtered GenerationRow[] data
 */
export const useTimelineImages = (
  shotId: string | null
): UseQueryResult<GenerationRow[]> => {
  const baseQuery = useAllShotGenerations(shotId);

  const filtered = React.useMemo(() => {
    if (!baseQuery.data) return undefined;

    const result = baseQuery.data
      .filter(g => {
        const location = g.imageUrl || g.location;
        const hasValidLocation = location && location !== '/placeholder.svg';
        return g.timeline_frame != null &&
               g.timeline_frame >= 0 &&
               !g.type?.includes('video') &&
               hasValidLocation;
      })
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    // [SelectorDebug] THE GOD LOG - See exactly what's inside the data

    // [SelectorDebug] Log filtering results with WHY items were filtered
    const filteredOut = baseQuery.data.filter(g => {
      const location = g.imageUrl || g.location;
      const hasValidLocation = location && location !== '/placeholder.svg';
      return g.timeline_frame == null || g.timeline_frame < 0 || g.type?.includes('video') || !hasValidLocation;
    });

    return result;
  }, [baseQuery.data, shotId]);

  return { ...baseQuery, data: filtered } as UseQueryResult<GenerationRow[]>;
};

/**
 * Selector: Unpositioned images (no timeline_frame, non-video, with valid location)
 *
 * Returns images that are in the shot but not positioned on timeline:
 * - Has null timeline_frame
 * - Is not a video generation
 * - Has valid location (not null, not placeholder)
 *
 * @param shotId - The shot ID to get unpositioned images for
 * @returns Query result with filtered GenerationRow[] data
 */
export const useUnpositionedImages = (
  shotId: string | null
): UseQueryResult<GenerationRow[]> => {
  const baseQuery = useAllShotGenerations(shotId);

  const filtered = React.useMemo(() => {
    if (!baseQuery.data) return undefined;

    return baseQuery.data.filter(g => {
      const location = g.imageUrl || g.location;
      const hasValidLocation = location && location !== '/placeholder.svg';
      return g.timeline_frame == null &&
             !g.type?.includes('video') &&
             hasValidLocation;
    });
  }, [baseQuery.data]);

  return { ...baseQuery, data: filtered } as UseQueryResult<GenerationRow[]>;
};

/**
 * Selector: Video outputs
 * 
 * Returns video generations in the shot.
 * 
 * @param shotId - The shot ID to get video outputs for
 * @returns Query result with filtered GenerationRow[] data
 */
export const useVideoOutputs = (
  shotId: string | null
): UseQueryResult<GenerationRow[]> => {
  const baseQuery = useAllShotGenerations(shotId);
  
  const filtered = React.useMemo(() => {
    if (!baseQuery.data) return undefined;
    
    return baseQuery.data.filter(g => g.type?.includes('video'));
  }, [baseQuery.data]);
  
  return { ...baseQuery, data: filtered } as UseQueryResult<GenerationRow[]>;
};

// ============================================================================
// CACHE PRIMING - Enable instant selector data during shot navigation
// ============================================================================

/**
 * Primes the all-shot-generations cache with data from ShotsContext.
 * 
 * Call at the top-level component (VideoTravelToolPage) to enable instant selector data.
 * When a shot is selected, this seeds the cache so selectors immediately have data
 * to display, eliminating the need for dual-source fallback logic in components.
 * 
 * NOTE: Primed data from ShotsContext does NOT include `metadata` (pair prompts).
 * This is fine because selectors filter on `timeline_frame` and `type` which are present.
 * Full metadata arrives when the useAllShotGenerations query completes (~300ms).
 * 
 * @param shotId - The shot ID to prime cache for
 * @param contextImages - Images from ShotsContext (selectedShot.images)
 */
const usePrimeShotGenerationsCache = (
  shotId: string | null,
  contextImages: GenerationRow[] | undefined
) => {
  const queryClient = useQueryClient();
  
  React.useEffect(() => {
    if (!shotId || !contextImages || contextImages.length === 0) return;

    const existingData = queryClient.getQueryData<GenerationRow[]>(queryKeys.generations.byShot(shotId));
    if (existingData && existingData.length > 0) return;

    // Prime the cache with context data
    queryClient.setQueryData(queryKeys.generations.byShot(shotId), contextImages);
  }, [shotId, contextImages, queryClient]);
};

// ============================================================================
// EXPORTED NAMES - Use these in code
// ============================================================================

/**
 * All images in a shot (positioned + unpositioned).
 * This is the preferred name - use this in new code.
 * @see useAllShotGenerations for documentation
 */
export const useShotImages = useAllShotGenerations;

/**
 * Primes the shot images cache with data from context.
 * This is the preferred name - use this in new code.
 * @see usePrimeShotGenerationsCache for documentation
 */
export const usePrimeShotImagesCache = usePrimeShotGenerationsCache;

// NOTE: useAllShotGenerations and usePrimeShotGenerationsCache are the implementation
// functions above. We only export the preferred names (useShotImages, usePrimeShotImagesCache)
// to avoid duplicate exports and confusion.