/** Preloads adjacent gallery pages for smoother pagination. */

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GenerationFilters } from '@/shared/hooks/projects/useProjectGenerations';
import { scheduleAdjacentGenerationPagePreload } from '@/features/gallery/lib/adjacentPagePreloadCoordinator';

interface UseAdjacentPagePreloaderProps {
  projectId: string | null;
  currentPage: number;
  itemsPerPage: number;
  filters?: GenerationFilters;
  totalItems?: number;
  enabled?: boolean;
  paused?: boolean;
}

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

  const filtersString = useMemo(
    () => (filters ? JSON.stringify(filters) : null),
    [filters]
  );

  const totalPages = useMemo(() => {
    if (totalItems === undefined) {
      return null;
    }
    if (totalItems <= 0) {
      return 1;
    }
    return Math.ceil(totalItems / itemsPerPage);
  }, [totalItems, itemsPerPage]);

  const hasMorePages = useMemo(() => {
    if (totalPages === null) {
      return false;
    }
    return currentPage < totalPages;
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!enabled || paused || !projectId) {
      return;
    }

    return scheduleAdjacentGenerationPagePreload({
      queryClient,
      projectId,
      currentPage,
      totalPages,
      hasMorePages,
      itemsPerPage,
      filters,
      filtersString,
    });
  }, [
    enabled,
    paused,
    projectId,
    currentPage,
    itemsPerPage,
    filters, // Include filters object for reference equality checks
    filtersString, // Include string for content change detection
    hasMorePages,
    totalPages,
    queryClient,
  ]);
}
