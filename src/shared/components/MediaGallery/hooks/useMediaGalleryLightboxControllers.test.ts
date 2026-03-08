import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTaskDetailsPayload,
  useGenerationNavigationController,
  useLightboxNavigationState,
  useShotAssociationState,
} from './useMediaGalleryLightboxControllers';

const mocks = vi.hoisted(() => ({
  usePrefetchTaskData: vi.fn(),
  getGenerationId: vi.fn(),
  getSupabaseClient: vi.fn(),
  toastError: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  expandShotData: vi.fn(),
}));

vi.mock('@/shared/hooks/tasks/useTaskPrefetch', () => ({
  usePrefetchTaskData: (...args: unknown[]) => mocks.usePrefetchTaskData(...args),
}));

vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (...args: unknown[]) => mocks.getGenerationId(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
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
  expandShotData: (...args: unknown[]) => mocks.expandShotData(...args),
}));

describe('useMediaGalleryLightboxControllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePrefetchTaskData.mockReturnValue(vi.fn());
    mocks.getGenerationId.mockImplementation((item: { id?: string } | undefined) => item?.id ?? null);
    mocks.expandShotData.mockReturnValue([{ shot_id: 'shot-1' }]);
  });

  it('computes navigation flags and prefetches neighboring/current items', () => {
    const prefetchTaskData = vi.fn();
    mocks.usePrefetchTaskData.mockReturnValue(prefetchTaskData);
    const filteredImages = [{ id: 'gen-1' }, { id: 'gen-2' }, { id: 'gen-3' }] as never;

    const { result } = renderHook(() =>
      useLightboxNavigationState({
        activeLightboxMedia: { id: 'gen-2' } as never,
        filteredImages,
        isServerPagination: false,
        serverPage: undefined,
        totalPages: 1,
      }),
    );

    expect(result.current.hasPrevious).toBe(true);
    expect(result.current.hasNext).toBe(true);
    expect(prefetchTaskData).toHaveBeenCalledWith('gen-1');
    expect(prefetchTaskData).toHaveBeenCalledWith('gen-2');
    expect(prefetchTaskData).toHaveBeenCalledWith('gen-3');
  });

  it('handles server-pagination edge flags and shot association states', () => {
    const { result } = renderHook(() =>
      useLightboxNavigationState({
        activeLightboxMedia: { id: 'gen-1' } as never,
        filteredImages: [{ id: 'gen-1' }, { id: 'gen-2' }] as never,
        isServerPagination: true,
        serverPage: 1,
        totalPages: 3,
      }),
    );
    expect(result.current.hasPrevious).toBe(false);
    expect(result.current.hasNext).toBe(true);

    const positioned = renderHook(() =>
      useShotAssociationState({
        sourceRecord: {
          shot_id: 'shot-1',
          position: 2,
          all_shot_associations: [{ shot_id: 'shot-2', position: null }],
        } as never,
        effectiveShotId: 'shot-1',
      }),
    );
    expect(positioned.result.current.positionedInSelectedShot).toBe(true);
    expect(positioned.result.current.associatedWithoutPositionInSelectedShot).toBe(false);

    const secondaryAssociation = renderHook(() =>
      useShotAssociationState({
        sourceRecord: {
          shot_id: 'shot-0',
          position: null,
          all_shot_associations: [{ shot_id: 'shot-2', position: null }],
        } as never,
        effectiveShotId: 'shot-2',
      }),
    );
    expect(secondaryAssociation.result.current.positionedInSelectedShot).toBe(false);
    expect(secondaryAssociation.result.current.associatedWithoutPositionInSelectedShot).toBe(true);
  });

  it('builds task detail payload statuses and navigation fallback errors', () => {
    expect(buildTaskDetailsPayload({
      task: { id: 'task-1' } as never,
      isLoadingTask: false,
      taskError: null,
      inputImages: ['a.png'],
      taskId: 'task-1',
      onClose: vi.fn(),
    }).status).toBe('ok');

    expect(buildTaskDetailsPayload({
      task: null,
      isLoadingTask: false,
      taskError: null,
      inputImages: [],
      taskId: null,
      onClose: vi.fn(),
    }).status).toBe('missing');

    expect(buildTaskDetailsPayload({
      task: null,
      isLoadingTask: false,
      taskError: new Error('failed'),
      inputImages: [],
      taskId: null,
      onClose: vi.fn(),
    }).status).toBe('error');

    const setActiveLightboxIndex = vi.fn();
    const { result } = renderHook(() =>
      useGenerationNavigationController({
        filteredImages: [{ id: 'gen-1' }, { id: 'gen-2' }] as never,
        setActiveLightboxIndex,
      }),
    );

    act(() => {
      result.current.handleNavigateToGeneration('gen-2');
      result.current.handleNavigateToGeneration('missing');
    });

    expect(setActiveLightboxIndex).toHaveBeenCalledWith(1);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'MediaGalleryLightbox.handleNavigateToGeneration' }),
    );
  });

  it('opens external generations via supabase fetch and handles missing/error paths', async () => {
    const setActiveLightboxIndex = vi.fn();
    const filteredImages = [{ id: 'gen-1' }] as Array<Record<string, unknown>>;

    const single = vi.fn();
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.getSupabaseClient.mockReturnValue({ from });

    const { result } = renderHook(() =>
      useGenerationNavigationController({
        filteredImages: filteredImages as never,
        setActiveLightboxIndex,
      }),
    );

    single.mockResolvedValueOnce({
      data: {
        id: 'gen-external',
        location: 'https://cdn/image.png',
        thumbnail_url: 'https://cdn/thumb.png',
        params: { prompt: 'hello' },
        created_at: '2026-01-01T00:00:00.000Z',
        starred: false,
        shot_data: { shot_1: [0] },
      },
      error: null,
    });

    await act(async () => {
      await result.current.handleOpenExternalGeneration('gen-external');
    });

    expect(filteredImages.at(-1)?.id).toBe('gen-external');
    expect(setActiveLightboxIndex).toHaveBeenCalledWith(filteredImages.length - 1);

    single.mockResolvedValueOnce({ data: null, error: null });
    await act(async () => {
      await result.current.handleOpenExternalGeneration('gen-missing');
    });
    expect(mocks.toastError).toHaveBeenCalledWith('Generation not found');

    single.mockResolvedValueOnce({ data: null, error: new Error('db failed') });
    await act(async () => {
      await result.current.handleOpenExternalGeneration('gen-error');
    });
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'MediaGalleryLightbox.handleOpenExternalGeneration',
        toastTitle: 'Failed to load generation',
      }),
    );
  });
});
