import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockUseDeleteGenerationAction } = vi.hoisted(() => ({
  mockUseDeleteGenerationAction: vi.fn(),
}));

vi.mock('@/domains/generation/hooks/useDeleteGenerationAction', () => ({
  useDeleteGenerationAction: () => mockUseDeleteGenerationAction(),
}));

import { useDeleteGenerationWithConfirm } from '@/domains/generation/hooks/useDeleteGenerationWithConfirm';

describe('useDeleteGenerationWithConfirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDeleteGenerationAction.mockReturnValue({
      pendingDeleteId: null,
      deletingId: null,
      isPending: false,
      requestDelete: vi.fn(),
      cancelDelete: vi.fn(),
      confirmDelete: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('maps deletion state into confirm dialog props', () => {
    const cancelDelete = vi.fn();
    mockUseDeleteGenerationAction.mockReturnValue({
      pendingDeleteId: 'gen-1',
      deletingId: 'gen-1',
      isPending: true,
      requestDelete: vi.fn(),
      cancelDelete,
      confirmDelete: vi.fn().mockResolvedValue(undefined),
    });

    const { result } = renderHook(() => useDeleteGenerationWithConfirm());

    expect(result.current.confirmDialogProps.open).toBe(true);
    expect(result.current.confirmDialogProps.isConfirming).toBe(true);

    result.current.confirmDialogProps.onOpenChange(false);
    expect(cancelDelete).toHaveBeenCalledTimes(1);
  });

  it('forwards async confirm callback from delete action', async () => {
    const confirmDelete = vi.fn().mockResolvedValue(undefined);
    mockUseDeleteGenerationAction.mockReturnValue({
      pendingDeleteId: 'gen-1',
      deletingId: null,
      isPending: false,
      requestDelete: vi.fn(),
      cancelDelete: vi.fn(),
      confirmDelete,
    });

    const { result } = renderHook(() => useDeleteGenerationWithConfirm());

    await expect(result.current.confirmDialogProps.onConfirm()).resolves.toBeUndefined();
    expect(confirmDelete).toHaveBeenCalledTimes(1);
  });
});
