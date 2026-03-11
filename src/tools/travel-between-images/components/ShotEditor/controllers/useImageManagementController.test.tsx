import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageManagementController } from './useImageManagementController';

const mocks = vi.hoisted(() => ({
  useImageManagement: vi.fn(),
}));

vi.mock('../hooks/editor-state/useImageManagement', () => ({
  useImageManagement: mocks.useImageManagement,
}));

describe('useImageManagementController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useImageManagement.mockReturnValue({
      isClearingFinalVideo: true,
      handleDeleteFinalVideo: vi.fn(),
      handleReorderImagesInShot: vi.fn(),
      handlePendingPositionApplied: vi.fn(),
    });
  });

  function buildArgs() {
    return {
      queryClient: { invalidateQueries: vi.fn() } as never,
      selectedShotRef: { current: { id: 'shot-1' } } as never,
      projectIdRef: { current: 'project-1' } as never,
      allShotImagesRef: { current: [{ id: 'image-1' }] } as never,
      batchVideoFramesRef: { current: 61 } as never,
      updateShotImageOrderMutation: { mutate: vi.fn() } as never,
      demoteOrphanedVariants: vi.fn(),
      actionsRef: { current: { setPendingFramePositions: vi.fn() } } as never,
      pendingFramePositions: new Map([['image-1', 0]]),
      generationActions: {
        handleBatchImageDrop: vi.fn().mockResolvedValue(undefined),
      } as never,
    };
  }

  it('forwards the image-management handlers and only uploads non-empty file selections', async () => {
    const args = buildArgs();

    const { result } = renderHook(() => useImageManagementController(args));

    expect(mocks.useImageManagement).toHaveBeenCalledWith(
      expect.objectContaining({
        queryClient: args.queryClient,
        selectedShotRef: args.selectedShotRef,
        projectIdRef: args.projectIdRef,
        pendingFramePositions: args.pendingFramePositions,
      }),
    );
    expect(result.current.isClearingFinalVideo).toBe(true);
    expect(result.current.handleDeleteFinalVideo).toBe(
      mocks.useImageManagement.mock.results[0].value.handleDeleteFinalVideo,
    );
    expect(result.current.handleReorderImagesInShot).toBe(
      mocks.useImageManagement.mock.results[0].value.handleReorderImagesInShot,
    );
    expect(result.current.handlePendingPositionApplied).toBe(
      mocks.useImageManagement.mock.results[0].value.handlePendingPositionApplied,
    );

    await act(async () => {
      await result.current.handleImageUpload([]);
    });

    expect(args.generationActions.handleBatchImageDrop).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleImageUpload([
        new File(['data'], 'frame.png', { type: 'image/png' }),
      ]);
    });

    expect(args.generationActions.handleBatchImageDrop).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(File)]),
    );
  });
});
