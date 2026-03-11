import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  dispatchShotSkeletonEvent: vi.fn(),
  clearShotSkeletonEvent: vi.fn(),
  createEmptyShotPath: vi.fn(),
  createShotWithFilesPath: vi.fn(),
  createShotWithGenerationPath: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('./shotCreationEffects', () => ({
  dispatchShotSkeletonEvent: (...args: unknown[]) => mocks.dispatchShotSkeletonEvent(...args),
  clearShotSkeletonEvent: (...args: unknown[]) => mocks.clearShotSkeletonEvent(...args),
}));

vi.mock('./shotCreationPaths', () => ({
  createEmptyShotPath: (...args: unknown[]) => mocks.createEmptyShotPath(...args),
  createShotWithFilesPath: (...args: unknown[]) => mocks.createShotWithFilesPath(...args),
  createShotWithGenerationPath: (...args: unknown[]) => mocks.createShotWithGenerationPath(...args),
}));

import { useCreateShotAction } from './shotCreationAction';

describe('useCreateShotAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error and aborts when no project is selected', async () => {
    const { result } = renderHook(() =>
      useCreateShotAction({
        selectedProjectId: null,
        shots: undefined,
        queryClient: {} as never,
        setIsCreating: vi.fn(),
        generateShotName: vi.fn(),
        applyPostCreationEffects: vi.fn(),
        createShotMutation: vi.fn(),
        createShotWithImageMutation: vi.fn(),
        handleExternalImageDropMutation: vi.fn(),
      }),
    );

    let response: unknown;
    await act(async () => {
      response = await result.current();
    });

    expect(response).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith('No project selected');
    expect(mocks.createEmptyShotPath).not.toHaveBeenCalled();
  });

  it('uses the generation path and applies post-creation effects on success', async () => {
    const setIsCreating = vi.fn();
    const applyPostCreationEffects = vi.fn();
    const onSuccess = vi.fn();
    const createShotWithImageMutation = vi.fn();
    const generationResult = { shotId: 'shot-1', shotName: 'Generated Shot' };
    mocks.createShotWithGenerationPath.mockResolvedValueOnce(generationResult);

    const { result } = renderHook(() =>
      useCreateShotAction({
        selectedProjectId: 'project-1',
        shots: [{ id: 'shot-0' }] as never,
        queryClient: { id: 'query-client' } as never,
        setIsCreating,
        generateShotName: () => 'Generated Shot',
        applyPostCreationEffects,
        createShotMutation: vi.fn(),
        createShotWithImageMutation,
        handleExternalImageDropMutation: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current({
        generationId: 'gen-1',
        generationPreview: { imageUrl: 'preview.png' },
        onSuccess,
      });
    });

    expect(mocks.dispatchShotSkeletonEvent).toHaveBeenCalledWith(1);
    expect(mocks.createShotWithGenerationPath).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedProjectId: 'project-1',
        shotName: 'Generated Shot',
        generationId: 'gen-1',
        createShotWithImage: createShotWithImageMutation,
      }),
    );
    expect(applyPostCreationEffects).toHaveBeenCalledWith(
      generationResult,
      expect.objectContaining({ generationId: 'gen-1' }),
    );
    expect(onSuccess).toHaveBeenCalledWith(generationResult);
    expect(setIsCreating).toHaveBeenCalledWith(true);
    expect(setIsCreating).toHaveBeenLastCalledWith(false);
  });

  it('clears skeleton events and reports failures from the file-upload path', async () => {
    const setIsCreating = vi.fn();
    mocks.createShotWithFilesPath.mockRejectedValueOnce(new Error('upload failed'));

    const { result } = renderHook(() =>
      useCreateShotAction({
        selectedProjectId: 'project-1',
        shots: [],
        queryClient: {} as never,
        setIsCreating,
        generateShotName: () => 'Generated Shot',
        applyPostCreationEffects: vi.fn(),
        createShotMutation: vi.fn(),
        createShotWithImageMutation: vi.fn(),
        handleExternalImageDropMutation: vi.fn(),
      }),
    );

    let response: unknown;
    await act(async () => {
      response = await result.current({
        files: [new File(['image'], 'image.png', { type: 'image/png' })],
      });
    });

    expect(response).toBeNull();
    expect(mocks.clearShotSkeletonEvent).toHaveBeenCalledTimes(1);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'useShotCreation',
        toastTitle: 'Failed to create shot',
      }),
    );
    expect(setIsCreating).toHaveBeenCalledWith(true);
    expect(setIsCreating).toHaveBeenLastCalledWith(false);
  });
});
