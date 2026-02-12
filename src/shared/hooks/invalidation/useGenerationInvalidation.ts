/**
 * useGenerationInvalidation.ts
 * 
 * Centralized hook for invalidating generation-related React Query caches.
 * 
 * Why this exists:
 * - 19 different places were calling invalidateQueries with different combinations
 * - Inconsistent patterns led to stale data or excessive invalidation
 * - No visibility into what triggered invalidations
 * 
 * Usage:
 *   const invalidateGenerations = useInvalidateGenerations();
 *   invalidateGenerations(shotId, { reason: 'delete-image' });
 * 
 * For variant changes (no shotId needed):
 *   invalidateVariantChange(queryClient, { generationId, reason: 'set-primary' });
 * 
 * Scopes:
 * - 'all': All generation-related queries (default)
 * - 'images': Just image data (all-shot-generations, segment-live-timeline)
 * - 'metadata': Just metadata (shot-generations-meta)
 * - 'counts': Just counts (unpositioned-count)
 *
 * Note: Uses queryKeys registry from @/shared/lib/queryKeys for all key references.
 */

import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { queryKeys } from '../../lib/queryKeys';

export type InvalidationScope =
  | 'all'           // All generation-related queries for a shot
  | 'images'        // Just image data (all-shot-generations)
  | 'metadata'      // Just metadata (shot-generations-meta)
  | 'counts';       // Just counts (unpositioned-count)

export interface InvalidationOptions {
  /** Which queries to invalidate. Default: 'all' */
  scope?: InvalidationScope;
  /** Debug reason for logging. Required for traceability. */
  reason: string;
  /** Delay invalidation by this many ms (for batching rapid changes) */
  delayMs?: number;
  /** Also invalidate the 'shots' query for the project (e.g., for thumbnail updates) */
  includeShots?: boolean;
  /** Project ID - required if includeShots is true */
  projectId?: string;
  /** Also invalidate unified-generations at project level */
  includeProjectUnified?: boolean;
}

/**
 * Options for variant-specific invalidation.
 * Use when a variant is created/updated/set-as-primary.
 */
export interface VariantInvalidationOptions {
  /** Debug reason for logging. Required for traceability. */
  reason: string;
  /** Generation ID that the variant belongs to */
  generationId: string;
  /** Optional: specific shot ID to prioritize (will refetch immediately before global invalidation) */
  shotId?: string;
  /** Optional: project ID for project-scoped unified-generations invalidation */
  projectId?: string;
  /** Delay before invalidation (e.g., 100ms for DB trigger to complete) */
  delayMs?: number;
}

/**
 * Internal helper that performs the actual invalidation.
 * Extracted so it can be used with or without React hooks.
 */
function performInvalidation(
  queryClient: QueryClient,
  shotId: string,
  options: InvalidationOptions
): void {
  const { 
    scope = 'all', 
    includeShots = false,
    projectId,
    includeProjectUnified = false
  } = options;
  
  // Debug logging via centralized config
  
  // Invalidate based on scope
  if (scope === 'all' || scope === 'images') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot(shotId) });
    // NOTE: ['shot-generations'] removed in Phase 3.5 - it was never queried, only invalidated
    // Also invalidate segment-live-timeline so segment video positions update
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(shotId) });
  }

  if (scope === 'all' || scope === 'metadata') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.meta(shotId) });
  }

  if (scope === 'all' || scope === 'counts') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.unpositionedCount(shotId) });
  }

  // Optional: include shots query
  if (includeShots && projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(projectId) });
  }

  // Optional: include project-level unified generations
  if (includeProjectUnified && projectId) {
    // Invalidate project-scoped unified generations (partial key match)
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });
  }
}

/**
 * Hook that returns a stable invalidation function.
 * Use this in React components/hooks.
 */
export function useInvalidateGenerations() {
  const queryClient = useQueryClient();
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  
  return useCallback((shotId: string, options: InvalidationOptions) => {
    const { delayMs } = options;
    
    // If there's already a pending invalidation for this shotId, clear it
    const existingTimeout = timeoutRefs.current.get(shotId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      timeoutRefs.current.delete(shotId);
    }
    
    if (delayMs && delayMs > 0) {
      // Delayed invalidation (useful for batching rapid changes)
      const timeout = setTimeout(() => {
        performInvalidation(queryClient, shotId, options);
        timeoutRefs.current.delete(shotId);
      }, delayMs);
      timeoutRefs.current.set(shotId, timeout);
    } else {
      // Immediate invalidation
      performInvalidation(queryClient, shotId, options);
    }
  }, [queryClient]);
}

/**
 * Non-hook version for use outside React components (e.g., in event handlers).
 * Requires passing in the queryClient.
 */
export function invalidateGenerationsSync(
  queryClient: QueryClient,
  shotId: string,
  options: InvalidationOptions
): void {
  if (options.delayMs && options.delayMs > 0) {
    setTimeout(() => {
      performInvalidation(queryClient, shotId, options);
    }, options.delayMs);
  } else {
    performInvalidation(queryClient, shotId, options);
  }
}

/**
 * Invalidate ALL shots (dangerous - use sparingly).
 * This is for global events where we don't know which specific shot was affected.
 * Logs a warning to encourage scoped invalidation.
 */
export function invalidateAllShotGenerations(
  queryClient: QueryClient
): void {

  // Use predicate to invalidate all shot-generations queries regardless of shotId
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.generations.byShotAll[0]
  });
  // NOTE: ['shot-generations'] removed - it was never queried, only invalidated
}

/**
 * Invalidate caches after a variant change (create, update, set-as-primary).
 * 
 * This handles the variant → generation → shot cascade:
 * - A variant belongs to a generation
 * - A generation can appear in multiple shots (via shot_generations)
 * - When the primary variant changes, generations.location changes
 * - This affects Timeline/Batch mode displays
 * 
 * @param queryClient - React Query client
 * @param options - Invalidation options including generationId and reason
 */
export async function invalidateVariantChange(
  queryClient: QueryClient,
  options: VariantInvalidationOptions
): Promise<void> {
  const { generationId, shotId, projectId, delayMs } = options;
  
  // Apply delay if specified (e.g., for DB trigger to complete)
  if (delayMs && delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  // 1. Invalidate variant-specific queries
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.variants(generationId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.detail(generationId) });
  // Also invalidate variant-badges so the "X new" badges update
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantBadges });

  // 2. If we know the shot, refetch it immediately for faster UI update
  if (shotId) {
    await queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
  }

  // 3. Invalidate all shot-generations (generation might be in multiple shots)
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.generations.byShotAll[0]
  });
  // NOTE: ['shot-generations'] removed - it was never queried, only invalidated

  // 4. Invalidate generation galleries - cover ALL key patterns for compatibility
  queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
  // Derived items (variants/generations "based on this")
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.derivedAll });

  // 5. If projectId provided, also invalidate project-scoped queries
  if (projectId) {
    // Partial key match for project-scoped unified generations
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });
  }

  // 6. Invalidate segment output queries (for timeline segment strip)
  // This ensures variant changes are reflected in the segment strip
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.segments.childrenAll[0]
  });

  // 7. Invalidate source image change detection (for video warning indicators)
  // This ensures warnings appear immediately when source images change
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.segments.sourceSlotAll[0]
  });
}

