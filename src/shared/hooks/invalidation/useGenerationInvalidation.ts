import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { queryKeys } from '../../lib/queryKeys';

type InvalidationScope = 'all' | 'images' | 'metadata' | 'counts';

interface InvalidationOptions {
  scope?: InvalidationScope;
  reason: string;
  delayMs?: number;
  includeShots?: boolean;
  projectId?: string;
  includeProjectUnified?: boolean;
}

interface VariantInvalidationOptions {
  reason: string;
  generationId: string;
  shotId?: string;
  projectId?: string;
  delayMs?: number;
}

function performInvalidation(
  queryClient: QueryClient,
  shotId: string,
  options: InvalidationOptions
): void {
  const {
    scope = 'all',
    includeShots = false,
    projectId,
    includeProjectUnified = false,
  } = options;

  if (scope === 'all' || scope === 'images') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot(shotId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(shotId) });
  }

  if (scope === 'all' || scope === 'metadata') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.meta(shotId) });
  }

  if (scope === 'all' || scope === 'counts') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.unpositionedCount(shotId) });
  }

  if (includeShots && projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(projectId) });
  }

  if (includeProjectUnified && projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });
  }
}

export function useInvalidateGenerations() {
  const queryClient = useQueryClient();
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  return useCallback((shotId: string, options: InvalidationOptions) => {
    const { delayMs } = options;

    const existingTimeout = timeoutRefs.current.get(shotId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      timeoutRefs.current.delete(shotId);
    }

    if (delayMs && delayMs > 0) {
      const timeout = setTimeout(() => {
        performInvalidation(queryClient, shotId, options);
        timeoutRefs.current.delete(shotId);
      }, delayMs);
      timeoutRefs.current.set(shotId, timeout);
      return;
    }

    performInvalidation(queryClient, shotId, options);
  }, [queryClient]);
}

export function invalidateGenerationsSync(
  queryClient: QueryClient,
  shotId: string,
  options: InvalidationOptions
): void {
  if (options.delayMs && options.delayMs > 0) {
    setTimeout(() => {
      performInvalidation(queryClient, shotId, options);
    }, options.delayMs);
    return;
  }

  performInvalidation(queryClient, shotId, options);
}

export function invalidateAllShotGenerations(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.generations.byShotAll[0],
  });
}

export async function invalidateVariantChange(
  queryClient: QueryClient,
  options: VariantInvalidationOptions
): Promise<void> {
  const { generationId, shotId, projectId, delayMs } = options;

  if (delayMs && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Specific generation + variants
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.variants(generationId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.detail(generationId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantBadges });

  if (shotId) {
    await queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
  }

  // Scoped: only invalidate project or fall back to all
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });
  } else {
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  }

  queryClient.invalidateQueries({ queryKey: queryKeys.generations.derivedAll });

  // Segments may reference this variant as source
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.segments.childrenAll[0],
  });

  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.segments.sourceSlotAll[0],
  });
}
