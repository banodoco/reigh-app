/**
 * useShotInvalidation.ts
 *
 * Centralized hook for invalidating shot-related React Query caches.
 *
 * Scopes:
 * - 'list': Just the shots list for a project
 * - 'detail': A specific shot's detail data
 * - 'all': List + all related generation caches
 */

import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../../lib/queryKeys';

export type ShotInvalidationScope = 'list' | 'detail' | 'all';

export interface ShotInvalidationOptions {
  /** Which queries to invalidate */
  scope?: ShotInvalidationScope;
  /** Debug reason for logging. Required for traceability. */
  reason: string;
  /** Shot ID - required for 'detail' and 'all' scopes */
  shotId?: string;
  /** Project ID - required for 'list' and 'all' scopes */
  projectId?: string;
}

/**
 * Internal helper that performs the actual invalidation.
 */
function performShotInvalidation(
  queryClient: QueryClient,
  options: ShotInvalidationOptions
): void {
  const { scope = 'all', shotId, projectId } = options;

  if ((scope === 'list' || scope === 'all') && projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(projectId) });
  }

  if ((scope === 'detail' || scope === 'all') && shotId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.shots.detail(shotId) });
    // Also invalidate generation caches for this shot
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot(shotId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.meta(shotId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(shotId) });
  }
}

/**
 * Hook that returns a stable shot invalidation function.
 * Use this in React components/hooks.
 *
 * @internal Not exported - currently unused. If needed in the future,
 * add export back and update the barrel file.
 */
function useInvalidateShots() {
  const queryClient = useQueryClient();

  return useCallback((options: ShotInvalidationOptions) => {
    performShotInvalidation(queryClient, options);
  }, [queryClient]);
}

// Keep for potential future use - referenced in barrel file docs
void useInvalidateShots;

/**
 * Non-hook version for use outside React components.
 * Requires passing in the queryClient.
 *
 * @internal Not exported - currently unused. If needed in the future,
 * add export back and update the barrel file.
 */
function invalidateShotsSync(
  queryClient: QueryClient,
  options: ShotInvalidationOptions
): void {
  performShotInvalidation(queryClient, options);
}

// Keep for potential future use
void invalidateShotsSync;
