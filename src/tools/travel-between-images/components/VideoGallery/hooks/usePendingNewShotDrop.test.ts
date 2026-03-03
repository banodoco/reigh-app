import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePendingNewShotDrop } from './usePendingNewShotDrop';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  getDragType: vi.fn(() => 'none'),
  getGenerationDropData: vi.fn(() => null),
  isFileDrag: vi.fn(() => false),
  isVideoGeneration: vi.fn((img: { type?: string }) => img.type === 'video'),
  eventHandlers: {} as Record<string, (detail: any) => void>,
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/lib/dnd/dragDrop', () => ({
  getDragType: (...args: unknown[]) => mocks.getDragType(...args),
  getGenerationDropData: (...args: unknown[]) => mocks.getGenerationDropData(...args),
  isFileDrag: (...args: unknown[]) => mocks.isFileDrag(...args),
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  isVideoGeneration: (...args: unknown[]) => mocks.isVideoGeneration(...args),
}));

vi.mock('@/shared/lib/typedEvents', () => ({
  useAppEventListener: (name: string, handler: (detail: any) => void) => {
    mocks.eventHandlers[name] = handler;
  },
}));

describe('usePendingNewShotDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventHandlers = {};
    mocks.getDragType.mockReturnValue('none');
    mocks.getGenerationDropData.mockReturnValue(null);
    mocks.isFileDrag.mockReturnValue(false);
  });

  function baseParams(overrides: Record<string, unknown> = {}) {
    return {
      currentShotIds: ['shot-1'],
      shots: [{ id: 'shot-1', images: [] }],
      onGenerationDropForNewShot: vi.fn(async () => {}),
      onFilesDropForNewShot: vi.fn(async () => {}),
      onSkeletonSetupReady: undefined,
      ...overrides,
    } as never;
  }

  function dragEvent(overrides: Record<string, unknown> = {}) {
    return {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: { contains: () => false },
      relatedTarget: null,
      dataTransfer: {
        dropEffect: 'none',
        files: [],
      },
      ...overrides,
    } as never;
  }

  it('tracks drag target state for valid drag types', () => {
    mocks.getDragType.mockReturnValue('generation');
    const { result } = renderHook(() => usePendingNewShotDrop(baseParams()));
    const event = dragEvent();

    act(() => {
      result.current.handleNewShotDragEnter(event);
    });

    expect(result.current.isNewShotDropTarget).toBe(true);
    expect(result.current.newShotDropType).toBe('generation');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('sets pending skeleton then resolves newly created shot metadata when ids update', () => {
    const onSkeletonSetupReady = vi.fn();
    const { result, rerender } = renderHook(
      (props: any) => usePendingNewShotDrop(props),
      {
        initialProps: baseParams({ onSkeletonSetupReady }),
      },
    );

    const setup = onSkeletonSetupReady.mock.calls[0][0] as (count: number) => void;
    act(() => {
      setup(3);
    });
    rerender(baseParams({ onSkeletonSetupReady }));
    expect(result.current.pendingSkeletonShot).toEqual({ imageCount: 3 });

    rerender(
      baseParams({
        onSkeletonSetupReady,
        currentShotIds: ['shot-1', 'shot-2'],
        shots: [
          { id: 'shot-1', images: [] },
          { id: 'shot-2', images: [{ type: 'image' }, { type: 'video' }] },
        ],
      }),
    );

    expect(result.current.newlyCreatedShotId).toBe('shot-2');
    expect(result.current.newlyCreatedShotExpectedImages).toBe(2);
    expect(result.current.newlyCreatedShotBaselineNonVideoCount).toBe(1);
    expect(result.current.pendingSkeletonShot).toBeNull();
  });

  it('handles generation drop failures by reporting and clearing pending state', async () => {
    mocks.getGenerationDropData.mockReturnValue({ generationId: 'g-1' });
    const onGenerationDropForNewShot = vi.fn(async () => {
      throw new Error('drop failed');
    });
    const { result } = renderHook(() =>
      usePendingNewShotDrop(baseParams({ onGenerationDropForNewShot })),
    );

    await act(async () => {
      await result.current.handleNewShotDrop(dragEvent());
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'ShotDrop', toastTitle: 'Failed to create shot' }),
    );
    expect(result.current.pendingSkeletonShot).toBeNull();
  });

  it('rejects non-image file drops with toast error', async () => {
    mocks.isFileDrag.mockReturnValue(true);
    const { result } = renderHook(() => usePendingNewShotDrop(baseParams()));
    const txt = new File(['x'], 'x.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.handleNewShotDrop(
        dragEvent({ dataTransfer: { files: [txt], dropEffect: 'none' } }),
      );
    });

    expect(mocks.toastError).toHaveBeenCalledWith(
      'No valid image files. Only JPEG, PNG, and WebP are supported.',
    );
  });

  it('passes only valid image files to new-shot file drop handler', async () => {
    mocks.isFileDrag.mockReturnValue(true);
    const onFilesDropForNewShot = vi.fn(async () => {});
    const { result } = renderHook(() =>
      usePendingNewShotDrop(baseParams({ onFilesDropForNewShot })),
    );
    const jpg = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const webp = new File(['b'], 'b.webp', { type: 'image/webp' });
    const txt = new File(['c'], 'c.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.handleNewShotDrop(
        dragEvent({ dataTransfer: { files: [jpg, txt, webp], dropEffect: 'none' } }),
      );
    });

    expect(onFilesDropForNewShot).toHaveBeenCalledWith([jpg, webp]);
  });
});
