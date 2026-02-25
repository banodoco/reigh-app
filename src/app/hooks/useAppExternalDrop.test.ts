import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import { useAppExternalDrop } from './useAppExternalDrop';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

function createDragEndEvent(params: {
  activeData: Record<string, unknown>;
  overData: Record<string, unknown>;
  overId?: string;
}): DragEndEvent {
  const { activeData, overData, overId = 'target' } = params;
  return {
    active: { data: { current: activeData } },
    over: { id: overId, data: { current: overData } },
  } as unknown as DragEndEvent;
}

describe('useAppExternalDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always finalizes overlay for external-file drop failures', async () => {
    const onDropHandled = vi.fn();
    const setLastAffectedShotId = vi.fn();
    const addImageToShotMutation = { mutateAsync: vi.fn() };
    const createShot = vi.fn();
    const handleExternalImageDropMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error('upload failed')),
    };

    const { result } = renderHook(() => useAppExternalDrop({
      selectedProjectId: 'project-1',
      currentShotsCount: 2,
      setLastAffectedShotId,
      createShot,
      addImageToShotMutation,
      handleExternalImageDropMutation,
      onDropHandled,
    }));

    await act(async () => {
      await result.current(createDragEndEvent({
        activeData: {
          isExternalFile: true,
          externalFile: new File(['data'], 'image.png', { type: 'image/png' }),
        },
        overData: {
          type: 'shot-group',
          shotId: 'shot-1',
        },
      }));
    });

    expect(handleExternalImageDropMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(onDropHandled).toHaveBeenCalledTimes(1);
    expect(setLastAffectedShotId).not.toHaveBeenCalled();
    expect(normalizeAndPresentError).toHaveBeenCalledTimes(1);
  });

  it('records affected shot and finalizes overlay for successful external-file drops', async () => {
    const onDropHandled = vi.fn();
    const setLastAffectedShotId = vi.fn();
    const addImageToShotMutation = { mutateAsync: vi.fn() };
    const createShot = vi.fn();
    const handleExternalImageDropMutation = {
      mutateAsync: vi.fn().mockResolvedValue({ shotId: 'shot-99' }),
    };

    const { result } = renderHook(() => useAppExternalDrop({
      selectedProjectId: 'project-1',
      currentShotsCount: 2,
      setLastAffectedShotId,
      createShot,
      addImageToShotMutation,
      handleExternalImageDropMutation,
      onDropHandled,
    }));

    await act(async () => {
      await result.current(createDragEndEvent({
        activeData: {
          isExternalFile: true,
          externalFile: new File(['data'], 'image.png', { type: 'image/png' }),
        },
        overData: {
          type: 'shot-group',
          shotId: 'shot-99',
        },
      }));
    });

    expect(handleExternalImageDropMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(setLastAffectedShotId).toHaveBeenCalledWith('shot-99');
    expect(onDropHandled).toHaveBeenCalledTimes(1);
  });

  it('finalizes overlay when drop target is missing', async () => {
    const onDropHandled = vi.fn();
    const setLastAffectedShotId = vi.fn();
    const addImageToShotMutation = { mutateAsync: vi.fn() };
    const createShot = vi.fn();
    const handleExternalImageDropMutation = { mutateAsync: vi.fn() };

    const { result } = renderHook(() => useAppExternalDrop({
      selectedProjectId: 'project-1',
      currentShotsCount: 2,
      setLastAffectedShotId,
      createShot,
      addImageToShotMutation,
      handleExternalImageDropMutation,
      onDropHandled,
    }));

    const event = {
      active: { data: { current: { generationId: 'gen-1' } } },
      over: null,
    } as unknown as DragEndEvent;

    await act(async () => {
      await result.current(event);
    });

    expect(onDropHandled).toHaveBeenCalledTimes(1);
    expect(addImageToShotMutation.mutateAsync).not.toHaveBeenCalled();
    expect(createShot).not.toHaveBeenCalled();
    expect(handleExternalImageDropMutation.mutateAsync).not.toHaveBeenCalled();
    expect(setLastAffectedShotId).not.toHaveBeenCalled();
  });

  it('finalizes overlay for generation drop failures', async () => {
    const onDropHandled = vi.fn();
    const setLastAffectedShotId = vi.fn();
    const addImageToShotMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error('mutation failed')),
    };
    const createShot = vi.fn();
    const handleExternalImageDropMutation = { mutateAsync: vi.fn() };

    const { result } = renderHook(() => useAppExternalDrop({
      selectedProjectId: 'project-1',
      currentShotsCount: 2,
      setLastAffectedShotId,
      createShot,
      addImageToShotMutation,
      handleExternalImageDropMutation,
      onDropHandled,
    }));

    await act(async () => {
      await result.current(createDragEndEvent({
        activeData: {
          generationId: 'gen-1',
          imageUrl: 'https://example.com/image.png',
        },
        overData: {
          type: 'shot-group',
          shotId: 'shot-1',
        },
      }));
    });

    expect(addImageToShotMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(onDropHandled).toHaveBeenCalledTimes(1);
    expect(normalizeAndPresentError).toHaveBeenCalledTimes(1);
    expect(setLastAffectedShotId).not.toHaveBeenCalled();
  });
});
