import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useImageManagement: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useImageManagement: mocks.useImageManagement,
}));

import { useImageManagementController } from './useImageManagementController';

describe('useImageManagementController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useImageManagement.mockReturnValue({
      isClearingFinalVideo: false,
      handleDeleteFinalVideo: vi.fn(),
      handleReorderImagesInShot: vi.fn(),
      handlePendingPositionApplied: vi.fn(),
    });
  });

  it('returns delegated image-management handlers', () => {
    const { result } = renderHook(() =>
      useImageManagementController({
        queryClient: {} as never,
        selectedShotRef: { current: undefined },
        projectIdRef: { current: null },
        allShotImagesRef: { current: [] },
        batchVideoFramesRef: { current: 0 },
        updateShotImageOrderMutation: {} as never,
        demoteOrphanedVariants: vi.fn(),
        actionsRef: { current: { setPendingFramePositions: vi.fn() } },
        pendingFramePositions: new Map(),
        generationActions: { handleBatchImageDrop: vi.fn() } as never,
      }),
    );

    expect(mocks.useImageManagement).toHaveBeenCalledTimes(1);
    expect(result.current.isClearingFinalVideo).toBe(false);
    expect(typeof result.current.handleDeleteFinalVideo).toBe('function');
    expect(typeof result.current.handleReorderImagesInShot).toBe('function');
    expect(typeof result.current.handlePendingPositionApplied).toBe('function');
  });

  it('uploads images only when files are provided', async () => {
    const handleBatchImageDrop = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useImageManagementController({
        queryClient: {} as never,
        selectedShotRef: { current: undefined },
        projectIdRef: { current: null },
        allShotImagesRef: { current: [] },
        batchVideoFramesRef: { current: 0 },
        updateShotImageOrderMutation: {} as never,
        demoteOrphanedVariants: vi.fn(),
        actionsRef: { current: { setPendingFramePositions: vi.fn() } },
        pendingFramePositions: new Map(),
        generationActions: { handleBatchImageDrop } as never,
      }),
    );

    await act(async () => {
      await result.current.handleImageUpload([]);
    });
    expect(handleBatchImageDrop).not.toHaveBeenCalled();

    const file = new File(['x'], 'image.png', { type: 'image/png' });
    await act(async () => {
      await result.current.handleImageUpload([file]);
    });
    expect(handleBatchImageDrop).toHaveBeenCalledWith([file]);
  });
});
