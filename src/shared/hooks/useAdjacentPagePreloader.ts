/**
 * useAdjacentPagePreloader
 *
 * Unified hook for preloading adjacent gallery pages.
 * Handles React Query prefetching + image preloading + cache cleanup in one place.
 *
 * This replaces the previous scattered approach where:
 * - Page components had handlePrefetchAdjacentPages callbacks
 * - Those callbacks manually called queryClient.prefetchQuery + smartPreloadImages
 * - ImagePreloadManager separately ran useImagePreloading + useCacheCleanup
 *
 * Now: Just use this hook in MediaGallery. Pages don't need to know about preloading.
 */

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { fetchGenerations } from '@/shared/hooks/useProjectGenerations';
import {
  preloadingService,
  clearLoadedImages,
  PRIORITY_VALUES,
} from '@/shared/lib/preloading';

interface UseAdjacentPagePreloaderProps {
  /** Project ID to scope queries */
  projectId: string | null;
  /** Current page (1-indexed, as used by the API) */
  currentPage: number;
  /** Items per page */
  itemsPerPage: number;
  /** Filters object (will be stringified for cache key) */
  filters?: Record<string, unknown>;
  /** Total items (for calculating total pages) */
  totalItems?: number;
  /** Whether preloading is enabled */
  enabled?: boolean;
  /** Pause preloading (e.g., when lightbox is open) */
  paused?: boolean;
}

interface PaginatedResponse {
  items?: Array<{ id?: string; url?: string; thumbUrl?: string }>;
  total?: number;
}

/**
 * Clean up distant page queries from React Query cache.
 * Keeps pages within ±keepRange of current page.
 */
function cleanupDistantPages(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  currentPage: number,
  keepRange: number = 2
): void {
  const allQueries = queryClient.getQueryCache().getAll();

  allQueries.forEach((query) => {
    const key = query.queryKey as unknown[];
    if (!Array.isArray(key)) return;

    // Match unified format: ['unified-generations', 'project', projectId, page, ...]
    if (
      key[0] === 'unified-generations' &&
      key[1] === 'project' &&
      key[2] === projectId
    ) {
      const page = key[3];
      if (typeof page === 'number' && Math.abs(page - currentPage) > keepRange) {
        // Clear load tracker for removed pages
        const data = query.state?.data as PaginatedResponse | undefined;
        if (data?.items) {
          clearLoadedImages(data.items.filter((item): item is { id: string } => !!item.id));
        }
        // Remove the query
        queryClient.removeQueries({ queryKey: query.queryKey });
      }
    }
  });
}

/**
 * Unified hook for preloading adjacent gallery pages.
 */
export function useAdjacentPagePreloader({
  projectId,
  currentPage,
  itemsPerPage,
  filters,
  totalItems,
  enabled = true,
  paused = false,
}: UseAdjacentPagePreloaderProps): void {
  const queryClient = useQueryClient();

  // Use shared service for config
  const config = preloadingService.getConfig();

  // Stable filters string for dependency array (to detect when filters change)
  // We stringify for the dependency array but pass the object to query keys
  const filtersString = useMemo(
    () => (filters ? JSON.stringify(filters) : null),
    [filters]
  );

  // Calculate total pages
  const totalPages = useMemo(() => {
    if (totalItems !== undefined && totalItems > 0) {
      return Math.ceil(totalItems / itemsPerPage);
    }
    return Infinity; // Unknown, assume there's always more
  }, [totalItems, itemsPerPage]);

  useEffect(() => {
    // Skip if disabled, paused, or no project
    if (!enabled || paused || !projectId) {
      return;
    }

    // Clear pending preloads from previous page
    preloadingService.clearQueue();

    // Debounce: wait for user to settle on a page
    const timer = setTimeout(async () => {
      const hasPrevPage = currentPage > 1;
      const hasNextPage = currentPage < totalPages;

      // IMPORTANT: Pass the filters object directly to query keys (not stringified)
      // This must match how useProjectGenerations creates its query keys
      // The filtersString is only used for the effect dependency array

      // Prefetch next page (higher priority)
      if (hasNextPage) {
        const nextPage = currentPage + 1;
        try {
          await queryClient.prefetchQuery({
            queryKey: queryKeys.unified.byProject(
              projectId,
              nextPage,
              itemsPerPage,
              filters // Pass object, not string
            ),
            queryFn: () =>
              fetchGenerations(
                projectId,
                itemsPerPage,
                (nextPage - 1) * itemsPerPage,
                filters
              ),
            staleTime: 30_000,
          });

          // Preload images from prefetched data
          const cached = queryClient.getQueryData<PaginatedResponse>(
            queryKeys.unified.byProject(projectId, nextPage, itemsPerPage, filters)
          );
          if (cached?.items) {
            preloadingService.preloadImages(cached.items, PRIORITY_VALUES.high);
          }
        } catch (err) {
          // Prefetch failures are non-critical, just log
        }
      }

      // Prefetch previous page (lower priority)
      if (hasPrevPage) {
        const prevPage = currentPage - 1;
        try {
          await queryClient.prefetchQuery({
            queryKey: queryKeys.unified.byProject(
              projectId,
              prevPage,
              itemsPerPage,
              filters // Pass object, not string
            ),
            queryFn: () =>
              fetchGenerations(
                projectId,
                itemsPerPage,
                (prevPage - 1) * itemsPerPage,
                filters
              ),
            staleTime: 30_000,
          });

          const cached = queryClient.getQueryData<PaginatedResponse>(
            queryKeys.unified.byProject(projectId, prevPage, itemsPerPage, filters)
          );
          if (cached?.items) {
            preloadingService.preloadImages(cached.items, PRIORITY_VALUES.normal);
          }
        } catch (err) {
        }
      }

      // Clean up distant pages
      cleanupDistantPages(queryClient, projectId, currentPage, 2);
    }, config.debounceMs);

    return () => {
      clearTimeout(timer);
      // Clear queue on page change to prioritize new adjacent pages
      preloadingService.clearQueue();
    };
  }, [
    enabled,
    paused,
    projectId,
    currentPage,
    itemsPerPage,
    filters, // Include filters object for reference equality checks
    filtersString, // Include string for content change detection
    totalPages,
    queryClient,
    config,
  ]);

  // Note: We don't clear queue on unmount because other components may be using it
  // The service handles cleanup on project change
}
