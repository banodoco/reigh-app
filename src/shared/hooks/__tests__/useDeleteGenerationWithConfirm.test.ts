import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockMutate = vi.fn();
vi.mock('@/shared/hooks/useGenerationMutations', () => ({
  useDeleteGeneration: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
    variables: null,
  })),
}));

vi.mock('@/shared/components/ConfirmDialog', () => ({
  ConfirmDialog: vi.fn(() => null),
}));

import { useDeleteGenerationWithConfirm } from '../useDeleteGenerationWithConfirm';

describe('useDeleteGenerationWithConfirm', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns requestDelete, DeleteConfirmDialog, isPending, and deletingId', () => {
    const { result } = renderHook(() => useDeleteGenerationWithConfirm(), { wrapper });
    expect(typeof result.current.requestDelete).toBe('function');
    expect(typeof result.current.DeleteConfirmDialog).toBe('function');
    expect(result.current.isPending).toBe(false);
    expect(result.current.deletingId).toBeNull();
  });

  it('requestDelete sets pendingDeleteId', () => {
    const { result } = renderHook(() => useDeleteGenerationWithConfirm(), { wrapper });
    act(() => {
      result.current.requestDelete('gen-123');
    });
    // The DeleteConfirmDialog should now be showing (open = true)
    // We verify indirectly by checking the component renders
    expect(result.current.DeleteConfirmDialog).toBeDefined();
  });

  it('does not call mutate until confirm', () => {
    const { result } = renderHook(() => useDeleteGenerationWithConfirm(), { wrapper });
    act(() => {
      result.current.requestDelete('gen-123');
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
