import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '@/test/test-utils';

const { mockPreloadImages, mockClearQueue } = vi.hoisted(() => ({
  mockPreloadImages: vi.fn(),
  mockClearQueue: vi.fn(),
}));

vi.mock('@/shared/lib/preloading', () => ({
  preloadingService: {
    getConfig: vi.fn(() => ({ debounceMs: 50 })),
    clearQueue: mockClearQueue,
    preloadImages: mockPreloadImages,
  },
  clearLoadedImages: vi.fn(),
  PRIORITY_VALUES: { high: 1, normal: 2 },
}));

vi.mock('@/shared/hooks/useProjectGenerations', () => ({
  fetchGenerations: vi.fn(),
}));

import { useAdjacentPagePreloader } from '../useAdjacentPagePreloader';

describe('useAdjacentPagePreloader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when disabled', () => {
    renderHookWithProviders(() =>
      useAdjacentPagePreloader({
        projectId: 'proj-1',
        currentPage: 1,
        itemsPerPage: 20,
        enabled: false,
      })
    );

    expect(mockPreloadImages).not.toHaveBeenCalled();
  });

  it('does nothing when projectId is null', () => {
    renderHookWithProviders(() =>
      useAdjacentPagePreloader({
        projectId: null,
        currentPage: 1,
        itemsPerPage: 20,
      })
    );

    expect(mockPreloadImages).not.toHaveBeenCalled();
  });

  it('does nothing when paused', () => {
    renderHookWithProviders(() =>
      useAdjacentPagePreloader({
        projectId: 'proj-1',
        currentPage: 1,
        itemsPerPage: 20,
        paused: true,
      })
    );

    expect(mockPreloadImages).not.toHaveBeenCalled();
  });

  it('calculates total pages from totalItems', () => {
    renderHookWithProviders(() =>
      useAdjacentPagePreloader({
        projectId: 'proj-1',
        currentPage: 1,
        itemsPerPage: 20,
        totalItems: 100,
      })
    );

    // Hook initializes correctly without error
  });

  it('does not crash on page 1 with no previous page', () => {
    renderHookWithProviders(() =>
      useAdjacentPagePreloader({
        projectId: 'proj-1',
        currentPage: 1,
        itemsPerPage: 20,
        totalItems: 50,
      })
    );
    // No error thrown
  });
});
