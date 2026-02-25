import type { QueryClient } from '@tanstack/react-query';
import {
  extractUnifiedProjectGenerationsPage,
  isUnifiedProjectGenerationsKey,
  unifiedGenerationQueryKeys,
} from '@/shared/lib/queryKeys/unified';
import { fetchGenerations, type GenerationFilters } from '@/shared/hooks/useProjectGenerations';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  clearLoadedImages,
  preloadingService,
  PRIORITY_VALUES,
} from '@/shared/lib/preloading';

interface PaginatedResponse {
  items?: Array<{ id?: string; url?: string; thumbUrl?: string }>;
}

interface AdjacentPreloadContext {
  queryClient: QueryClient;
  projectId: string;
  currentPage: number;
  totalPages: number | null;
  hasMorePages: boolean;
  itemsPerPage: number;
  filters?: GenerationFilters;
  filtersString: string | null;
  keepRange?: number;
  onError: (context: string, error: unknown, logData: Record<string, unknown>) => void;
}

interface ScheduleAdjacentGenerationPagePreloadOptions {
  queryClient: QueryClient;
  projectId: string;
  currentPage: number;
  totalPages: number | null;
  hasMorePages: boolean;
  itemsPerPage: number;
  filters?: GenerationFilters;
  filtersString: string | null;
  keepRange?: number;
}

function extractLoadedImageIds(data: unknown): Array<{ id: string }> {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const maybeItems = (data as { items?: unknown }).items;
  if (!Array.isArray(maybeItems)) {
    return [];
  }

  return maybeItems
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const id = (item as { id?: unknown }).id;
      return typeof id === 'string' ? { id } : null;
    })
    .filter((item): item is { id: string } => item !== null);
}

export function cleanupDistantGenerationPages(
  queryClient: QueryClient,
  projectId: string,
  currentPage: number,
  keepRange: number = 2,
): void {
  const allQueries = queryClient.getQueryCache().getAll();

  allQueries.forEach((query) => {
    const key = query.queryKey;
    if (!Array.isArray(key)) return;

    if (!isUnifiedProjectGenerationsKey(key, projectId)) {
      return;
    }

    const page = extractUnifiedProjectGenerationsPage(key, projectId);
    if (page !== null && Math.abs(page - currentPage) > keepRange) {
      const loadedImageIds = extractLoadedImageIds(query.state?.data);
      if (loadedImageIds.length > 0) {
        clearLoadedImages(loadedImageIds);
      }
      queryClient.removeQueries({ queryKey: query.queryKey });
    }
  });
}

export function scheduleAdjacentGenerationPagePreload({
  queryClient,
  projectId,
  currentPage,
  totalPages,
  hasMorePages,
  itemsPerPage,
  filters,
  filtersString,
  keepRange = 2,
}: ScheduleAdjacentGenerationPagePreloadOptions): () => void {
  const config = preloadingService.getConfig();

  const timer = setTimeout(async () => {
    await prefetchAdjacentGenerationPages({
      queryClient,
      projectId,
      currentPage,
      totalPages,
      hasMorePages,
      itemsPerPage,
      filters,
      filtersString,
      keepRange,
      onError: (context, error, logData) => {
        normalizeAndPresentError(error, {
          context,
          showToast: false,
          logData,
        });
      },
    });
  }, config.debounceMs);

  return () => {
    clearTimeout(timer);
  };
}

async function prefetchPage(
  context: AdjacentPreloadContext,
  page: number,
  priority: number,
  errorContext: string,
): Promise<void> {
  const {
    queryClient,
    projectId,
    itemsPerPage,
    filters,
    filtersString,
    onError,
  } = context;

  try {
    await queryClient.prefetchQuery({
      queryKey: unifiedGenerationQueryKeys.byProject(
        projectId,
        page,
        itemsPerPage,
        filtersString,
      ),
      queryFn: () =>
        fetchGenerations(
          projectId,
          itemsPerPage,
          (page - 1) * itemsPerPage,
          filters,
        ),
      staleTime: 30_000,
    });

    const cached = queryClient.getQueryData<PaginatedResponse>(
      unifiedGenerationQueryKeys.byProject(projectId, page, itemsPerPage, filtersString),
    );
    if (cached?.items) {
      preloadingService.preloadImages(cached.items, priority);
    }
  } catch (error) {
    onError(errorContext, error, { projectId, page });
  }
}

export async function prefetchAdjacentGenerationPages(context: AdjacentPreloadContext): Promise<void> {
  const {
    currentPage,
    totalPages,
    hasMorePages,
    keepRange = 2,
  } = context;

  const hasPrevPage = currentPage > 1;
  const hasNextPage = totalPages === null
    ? hasMorePages
    : currentPage < totalPages;

  if (hasNextPage) {
    await prefetchPage(context, currentPage + 1, PRIORITY_VALUES.high, 'useAdjacentPagePreloader.prefetchNext');
  }

  if (hasPrevPage) {
    await prefetchPage(context, currentPage - 1, PRIORITY_VALUES.normal, 'useAdjacentPagePreloader.prefetchPrevious');
  }

  cleanupDistantGenerationPages(context.queryClient, context.projectId, context.currentPage, keepRange);
}
