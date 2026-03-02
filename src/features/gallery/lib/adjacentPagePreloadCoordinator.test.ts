import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';

const { mockPreloadImages, mockClearLoadedImages } = vi.hoisted(() => ({
  mockPreloadImages: vi.fn(),
  mockClearLoadedImages: vi.fn(),
}));

vi.mock('@/shared/lib/preloading', () => ({
  preloadingService: {
    preloadImages: mockPreloadImages,
  },
  clearLoadedImages: mockClearLoadedImages,
  PRIORITY_VALUES: {
    high: 1,
    normal: 2,
  },
}));

vi.mock('@/shared/hooks/projects/useProjectGenerations', () => ({
  fetchGenerations: vi.fn(),
}));

import { fetchGenerations } from '@/shared/hooks/projects/useProjectGenerations';
import {
  cleanupDistantGenerationPages,
  prefetchAdjacentGenerationPages,
} from './adjacentPagePreloadCoordinator';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

describe('adjacentPagePreloadCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes distant generation pages and clears loaded image ids', () => {
    const queryClient = createQueryClient();
    const keepKey = unifiedGenerationQueryKeys.byProject('proj-1', 2, 20, null);
    const removeKey = unifiedGenerationQueryKeys.byProject('proj-1', 6, 20, null);

    queryClient.setQueryData(keepKey, {
      items: [{ id: 'keep-1', url: 'https://example.com/keep.jpg' }],
    });
    queryClient.setQueryData(removeKey, {
      items: [{ id: 'drop-1', url: 'https://example.com/drop.jpg' }],
    });

    cleanupDistantGenerationPages(queryClient, 'proj-1', 2, 2);

    expect(queryClient.getQueryData(keepKey)).toBeDefined();
    expect(queryClient.getQueryData(removeKey)).toBeUndefined();
    expect(mockClearLoadedImages).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'drop-1' }),
    ]);
  });

  it('prefetches next then previous page and preloads fetched images', async () => {
    const queryClient = createQueryClient();
    const onError = vi.fn();

    vi.mocked(fetchGenerations).mockImplementation(async (_projectId, _limit, offset) => ({
      items: [
        {
          id: `gen-${offset}`,
          url: `https://example.com/${offset}.jpg`,
          thumbUrl: `https://example.com/${offset}-thumb.jpg`,
        },
      ],
      total: 100,
    }));

    await prefetchAdjacentGenerationPages({
      queryClient,
      projectId: 'proj-1',
      currentPage: 2,
      totalPages: 5,
      itemsPerPage: 20,
      filtersString: null,
      onError,
    });

    expect(fetchGenerations).toHaveBeenCalledTimes(2);
    expect(fetchGenerations).toHaveBeenNthCalledWith(1, 'proj-1', 20, 40, undefined);
    expect(fetchGenerations).toHaveBeenNthCalledWith(2, 'proj-1', 20, 0, undefined);
    expect(mockPreloadImages).toHaveBeenCalledTimes(2);
    expect(mockPreloadImages).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ id: 'gen-40' })]),
      1,
    );
    expect(mockPreloadImages).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([expect.objectContaining({ id: 'gen-0' })]),
      2,
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports prefetch failures via onError callback', async () => {
    const onError = vi.fn();
    const queryClient = {
      prefetchQuery: vi.fn().mockRejectedValue(new Error('next-page-fail')),
      getQueryData: vi.fn(),
      getQueryCache: () => ({ getAll: () => [] }),
      removeQueries: vi.fn(),
    } as unknown as QueryClient;

    await prefetchAdjacentGenerationPages({
      queryClient,
      projectId: 'proj-1',
      currentPage: 2,
      totalPages: 5,
      itemsPerPage: 20,
      filtersString: null,
      onError,
    });

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toContain('prefetchNext');
  });
});
