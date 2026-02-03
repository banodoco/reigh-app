import { QueryClient } from '@tanstack/react-query';
import { Shot, GenerationRow } from '@/types/shots';
import { queryKeys } from '@/shared/lib/queryKeys';

/**
 * Cache key variants for shots queries.
 * Different parts of the app use different maxImagesPerShot values:
 * - undefined: base key (useListShots default)
 * - 0: unlimited images (ShotsContext)
 * - 2: sidebar preview
 * - 5: compact view
 *
 * @internal Used only within cacheUtils.ts
 */
const SHOTS_CACHE_VARIANTS = [undefined, 0, 2, 5] as const;

/**
 * Get all cache key variants for a project's shots.
 * Use this to ensure all cache entries are updated consistently.
 *
 * @internal Used only within cacheUtils.ts
 */
function getShotsCacheKeys(projectId: string): readonly (string | number | undefined)[][] {
  return SHOTS_CACHE_VARIANTS.map(variant =>
    variant === undefined
      ? [...queryKeys.shots.all, projectId] as const
      : queryKeys.shots.list(projectId, variant)
  );
}

/**
 * Update all shots cache variants for a project.
 * Ensures consistent state across all cache entries.
 *
 * @param onlyExisting - If true, only update caches that already exist.
 *                       If false (default), will create cache entries if needed.
 */
export function updateAllShotsCaches(
  queryClient: QueryClient,
  projectId: string,
  updater: (old: Shot[] | undefined) => Shot[],
  onlyExisting: boolean = false
): void {
  getShotsCacheKeys(projectId).forEach(key => {
    if (onlyExisting) {
      const existing = queryClient.getQueryData<Shot[]>(key);
      if (existing !== undefined) {
        queryClient.setQueryData(key, updater(existing));
      }
    } else {
      // Pass updater function directly - React Query will call it with undefined if no cache
      queryClient.setQueryData<Shot[]>(key, (old) => updater(old));
    }
  });
}

/**
 * Rollback all shots cache variants to a previous state.
 * Used in onError handlers for optimistic updates.
 */
export function rollbackShotsCaches(
  queryClient: QueryClient,
  projectId: string,
  previous: Shot[] | undefined
): void {
  if (!previous) return;
  getShotsCacheKeys(projectId).forEach(key => {
    queryClient.setQueryData(key, previous);
  });
}

/**
 * Cancel all in-flight shots queries for a project.
 * Call this at the start of onMutate for optimistic updates.
 */
export async function cancelShotsQueries(
  queryClient: QueryClient,
  projectId: string
): Promise<void> {
  await Promise.all(
    getShotsCacheKeys(projectId).map(key =>
      queryClient.cancelQueries({ queryKey: key })
    )
  );
}

/**
 * Find the first non-empty shots cache for a project.
 * Searches through all cache variants and returns the first one with data.
 */
export function findShotsCache(
  queryClient: QueryClient,
  projectId: string
): Shot[] | undefined {
  for (const key of getShotsCacheKeys(projectId)) {
    const data = queryClient.getQueryData<Shot[]>(key);
    if (data && data.length > 0) return data;
  }
  return undefined;
}

/**
 * Update the shot-generations cache for a specific shot.
 * This is the fast cache used by Timeline/Editor.
 */
export function updateShotGenerationsCache(
  queryClient: QueryClient,
  shotId: string,
  updater: (old: GenerationRow[] | undefined) => GenerationRow[]
): void {
  const key = queryKeys.generations.byShot(shotId);
  const existing = queryClient.getQueryData<GenerationRow[]>(key);
  if (existing !== undefined) {
    queryClient.setQueryData(key, updater(existing));
  }
}

/**
 * Rollback shot-generations cache to previous state.
 */
export function rollbackShotGenerationsCache(
  queryClient: QueryClient,
  shotId: string,
  previous: GenerationRow[] | undefined
): void {
  if (!previous) return;
  queryClient.setQueryData(queryKeys.generations.byShot(shotId), previous);
}

/**
 * Cancel in-flight shot-generations query.
 */
export async function cancelShotGenerationsQuery(
  queryClient: QueryClient,
  shotId: string
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryKeys.generations.byShot(shotId) });
}
