import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const single = vi.fn(async () => ({ data: null, error: null }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    prefetchTaskData: vi.fn(),
    normalizeAndPresentError: vi.fn(),
    toastError: vi.fn(),
    supabaseClient: { from },
    supabaseSingle: single,
  };
});

vi.mock('@/shared/hooks/tasks/useTaskPrefetch', () => ({
  usePrefetchTaskData: () => mocks.prefetchTaskData,
}));

vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (item: { generation_id?: string; id?: string } | undefined) =>
    item?.generation_id ?? item?.id ?? null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => mocks.supabaseClient,
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/lib/shotData', () => ({
  expandShotData: () => [],
}));

import {
  buildTaskDetailsPayload,
  useGenerationNavigationController,
  useLightboxNavigationState,
  useShotAssociationState,
} from './useMediaGalleryLightboxControllers';

describe('useMediaGalleryLightboxControllers', () => {
  const images = [
    { id: 'g1', generation_id: 'gen-1', url: 'u1', createdAt: '2025-01-01T00:00:00Z', metadata: {} },
    { id: 'g2', generation_id: 'gen-2', url: 'u2', createdAt: '2025-01-01T00:00:00Z', metadata: {} },
    { id: 'g3', generation_id: 'gen-3', url: 'u3', createdAt: '2025-01-01T00:00:00Z', metadata: {} },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes local navigation and prefetches adjacent task data', () => {
    const { result } = renderHook(() =>
      useLightboxNavigationState({
        activeLightboxMedia: images[1],
        filteredImages: images,
        isServerPagination: false,
        totalPages: 1,
      }),
    );

    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrevious).toBe(true);
    expect(mocks.prefetchTaskData).toHaveBeenCalledWith('gen-1');
    expect(mocks.prefetchTaskData).toHaveBeenCalledWith('gen-2');
    expect(mocks.prefetchTaskData).toHaveBeenCalledWith('gen-3');
  });

  it('derives shot association flags from primary and association rows', () => {
    const { result } = renderHook(() =>
      useShotAssociationState({
        effectiveShotId: 'shot-b',
        sourceRecord: {
          id: 'g2',
          position: null,
          shot_id: 'shot-a',
          all_shot_associations: [{ shot_id: 'shot-b', position: 12 }],
        } as never,
      }),
    );

    expect(result.current.positionedInSelectedShot).toBe(true);
    expect(result.current.associatedWithoutPositionInSelectedShot).toBe(false);
  });

  it('builds task payload with safe defaults', () => {
    const payload = buildTaskDetailsPayload({
      onClose: vi.fn(),
    });

    expect(payload).toMatchObject({
      task: null,
      isLoading: false,
      error: null,
      inputImages: [],
      taskId: null,
    });
    expect(payload.onApplySettingsFromTask).toBeUndefined();
    expect(typeof payload.onClose).toBe('function');
  });

  it('navigates to an existing generation and reports missing ids', () => {
    const setActiveLightboxIndex = vi.fn();
    const { result } = renderHook(() =>
      useGenerationNavigationController({
        filteredImages: images as never,
        setActiveLightboxIndex,
      }),
    );

    act(() => {
      result.current.handleNavigateToGeneration('g3');
      result.current.handleNavigateToGeneration('missing');
    });

    expect(setActiveLightboxIndex).toHaveBeenCalledWith(2);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'MediaGalleryLightbox.handleNavigateToGeneration',
        showToast: false,
      }),
    );
  });

  it('loads and appends an external generation when missing locally', async () => {
    mocks.supabaseSingle.mockResolvedValueOnce({
      data: {
        id: 'remote-1',
        location: 'https://example.com/remote.png',
        thumbnail_url: 'https://example.com/remote-thumb.png',
        params: { prompt: 'hello' },
        created_at: '2025-01-01T00:00:00Z',
        starred: true,
        shot_data: null,
      },
      error: null,
    });
    const mutable = [...images] as never[];
    const setActiveLightboxIndex = vi.fn();
    const { result } = renderHook(() =>
      useGenerationNavigationController({
        filteredImages: mutable as never,
        setActiveLightboxIndex,
      }),
    );

    await act(async () => {
      await result.current.handleOpenExternalGeneration('remote-1');
    });

    expect(setActiveLightboxIndex).toHaveBeenCalledWith(3);
    expect(mutable[3]).toEqual(
      expect.objectContaining({
        id: 'remote-1',
        url: 'https://example.com/remote.png',
      }),
    );
  });
});
