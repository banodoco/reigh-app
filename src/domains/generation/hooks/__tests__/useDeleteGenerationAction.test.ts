import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockUseProjectSelectionContext, mockUseDeleteGeneration, mockMutateAsync } = vi.hoisted(() => ({
  mockUseProjectSelectionContext: vi.fn(),
  mockUseDeleteGeneration: vi.fn(),
  mockMutateAsync: vi.fn(),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => mockUseProjectSelectionContext(),
}));

vi.mock('@/domains/generation/hooks/useGenerationMutations', () => ({
  useDeleteGeneration: () => mockUseDeleteGeneration(),
}));

import { useDeleteGenerationAction } from '@/domains/generation/hooks/useDeleteGenerationAction';

describe('useDeleteGenerationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectSelectionContext.mockReturnValue({ selectedProjectId: 'project-1' });
    mockUseDeleteGeneration.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it('sets pendingDeleteId when requestDelete is called', () => {
    const { result } = renderHook(() => useDeleteGenerationAction());

    act(() => {
      result.current.requestDelete('gen-1');
    });

    expect(result.current.pendingDeleteId).toBe('gen-1');
  });

  it('confirms delete and clears pending/deleting state on success', async () => {
    const { result } = renderHook(() => useDeleteGenerationAction());

    act(() => {
      result.current.requestDelete('gen-1');
    });

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'gen-1', projectId: 'project-1' });
    expect(result.current.pendingDeleteId).toBeNull();
    expect(result.current.deletingId).toBeNull();
  });

  it('keeps dialog pending state on failed delete so users can retry/cancel', async () => {
    mockMutateAsync.mockRejectedValue(new Error('delete failed'));
    const { result } = renderHook(() => useDeleteGenerationAction());

    act(() => {
      result.current.requestDelete('gen-1');
    });

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(result.current.pendingDeleteId).toBe('gen-1');
    expect(result.current.deletingId).toBeNull();
  });

  it('uses the latest requested id across repeated delete requests', async () => {
    const { result } = renderHook(() => useDeleteGenerationAction());

    act(() => {
      result.current.requestDelete('gen-1');
      result.current.requestDelete('gen-2');
    });

    expect(result.current.pendingDeleteId).toBe('gen-2');

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'gen-2', projectId: 'project-1' });
    expect(result.current.pendingDeleteId).toBeNull();
    expect(result.current.deletingId).toBeNull();
  });
});
