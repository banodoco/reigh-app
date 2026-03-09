import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeleteGenerationAction } from './useDeleteGenerationAction';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  useDeleteGeneration: vi.fn(),
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/domains/generation/hooks/useGenerationMutations', () => ({
  useDeleteGeneration: (...args: unknown[]) => mocks.useDeleteGeneration(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

describe('useDeleteGenerationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDeleteGeneration.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
    });
  });

  it('tracks pending deletion and can cancel', () => {
    const { result } = renderHook(() => useDeleteGenerationAction({ projectId: 'project-1' }));

    act(() => {
      result.current.requestDelete('gen-1');
    });
    expect(result.current.pendingDeleteId).toBe('gen-1');

    act(() => {
      result.current.cancelDelete();
    });
    expect(result.current.pendingDeleteId).toBeNull();
  });

  it('returns early when pending id or project id is missing', async () => {
    const { result } = renderHook(() => useDeleteGenerationAction({ projectId: null }));

    act(() => {
      result.current.requestDelete('gen-1');
    });

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(result.current.pendingDeleteId).toBeNull();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it('deletes generation and clears pending/deleting states on success', async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteGenerationAction({ projectId: 'project-1' }));

    act(() => {
      result.current.requestDelete('gen-1');
    });

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: 'gen-1', projectId: 'project-1' });
    expect(result.current.pendingDeleteId).toBeNull();
    expect(result.current.deletingId).toBeNull();
  });

  it('reports errors and keeps dialog open on failure', async () => {
    mocks.mutateAsync.mockRejectedValue(new Error('delete failed'));

    const { result } = renderHook(() => useDeleteGenerationAction({ projectId: 'project-1' }));

    act(() => {
      result.current.requestDelete('gen-1');
    });

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        context: 'useDeleteGenerationAction.confirmDelete',
        toastTitle: 'Delete failed',
      },
    );
    expect(result.current.pendingDeleteId).toBe('gen-1');
    expect(result.current.deletingId).toBeNull();
  });
});
