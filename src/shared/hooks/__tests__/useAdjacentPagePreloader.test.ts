import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';

const { mockPreloadImages, mockClearQueue, mockClearLoadedImages } = vi.hoisted(() => ({
  mockPreloadImages: vi.fn(),
  mockClearQueue: vi.fn(),
  mockClearLoadedImages: vi.fn(),
}));

vi.mock('@/shared/lib/preloading', () => ({
  preloadingService: {
    getConfig: vi.fn(() => ({ debounceMs: 50 })),
    clearQueue: mockClearQueue,
    preloadImages: mockPreloadImages,
  },
  clearLoadedImages: mockClearLoadedImages,
  PRIORITY_VALUES: { high: 1, normal: 2 },
}));

vi.mock('@/shared/hooks/useProjectGenerations', () => ({
  fetchGenerations: vi.fn(),
}));

import { fetchGenerations } from '@/shared/hooks/useProjectGenerations';
import { useAdjacentPagePreloader } from '../useAdjacentPagePreloader';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function createAdjacentPreloaderWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useAdjacentPagePreloader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(fetchGenerations).mockResolvedValue({
      items: [{ id: 'gen-1', url: 'https://example.com/full.jpg', thumbUrl: 'https://example.com/thumb.jpg' }],
      total: 120,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefetches adjacent pages and preloads both pages with priorities', async () => {
    const queryClient = createQueryClient();

    const { unmount } = renderHook(
      () =>
        useAdjacentPagePreloader({
          projectId: 'proj-1',
          currentPage: 2,
          itemsPerPage: 20,
          totalItems: 120,
        }),
      { wrapper: createAdjacentPreloaderWrapper(queryClient) }
    );

    expect(mockClearQueue).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(fetchGenerations).toHaveBeenCalledTimes(2);
    expect(fetchGenerations).toHaveBeenNthCalledWith(1, 'proj-1', 20, 40, undefined);
    expect(fetchGenerations).toHaveBeenNthCalledWith(2, 'proj-1', 20, 0, undefined);
    expect(mockPreloadImages).toHaveBeenCalledTimes(2);
    expect(mockPreloadImages).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ id: 'gen-1' })]),
      1
    );
    expect(mockPreloadImages).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([expect.objectContaining({ id: 'gen-1' })]),
      2
    );

    unmount();
    expect(mockClearQueue).toHaveBeenCalledTimes(2);
  });

  it('skips prefetching when disabled, paused, or missing project ID', async () => {
    const queryClient = createQueryClient();

    renderHook(
      () =>
        useAdjacentPagePreloader({
          projectId: null,
          currentPage: 1,
          itemsPerPage: 20,
          enabled: false,
          paused: true,
        }),
      { wrapper: createAdjacentPreloaderWrapper(queryClient) }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(fetchGenerations).not.toHaveBeenCalled();
    expect(mockPreloadImages).not.toHaveBeenCalled();
    expect(mockClearQueue).not.toHaveBeenCalled();
  });

  it('cleans up distant cached pages and clears loaded image tracking', async () => {
    const queryClient = createQueryClient();
    const distantKey = queryKeys.unified.byProject('proj-1', 10, 20, undefined);
    queryClient.setQueryData(distantKey, {
      items: [
        { id: 'far-1', url: 'https://example.com/far.jpg' },
        { id: undefined, url: 'https://example.com/missing-id.jpg' },
      ],
      total: 120,
    });

    renderHook(
      () =>
        useAdjacentPagePreloader({
          projectId: 'proj-1',
          currentPage: 1,
          itemsPerPage: 20,
          totalItems: 40,
        }),
      { wrapper: createAdjacentPreloaderWrapper(queryClient) }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(mockClearLoadedImages).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'far-1' }),
    ]);
    expect(queryClient.getQueryData(distantKey)).toBeUndefined();
  });

  it('swallows prefetch errors without throwing', async () => {
    const queryClient = createQueryClient();
    vi.mocked(fetchGenerations).mockRejectedValue(new Error('prefetch failed'));

    renderHook(
      () =>
        useAdjacentPagePreloader({
          projectId: 'proj-1',
          currentPage: 2,
          itemsPerPage: 20,
          totalItems: 120,
        }),
      { wrapper: createAdjacentPreloaderWrapper(queryClient) }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(fetchGenerations).toHaveBeenCalledTimes(2);
    expect(mockPreloadImages).not.toHaveBeenCalled();
  });
});
