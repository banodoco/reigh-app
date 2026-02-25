import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockUpdate = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => mockUpdate()),
      })),
    })),
  },
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useUpdateShotName } from '../useShotUpdates';

describe('useUpdateShotName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ error: null });
  });

  it('returns mutation object', () => {
    const { result } = renderHookWithProviders(() => useUpdateShotName());
    expect(typeof result.current.mutateAsync).toBe('function');
    expect(result.current.isPending).toBe(false);
  });

  it('updates shot name with name param', async () => {
    const { result } = renderHookWithProviders(() => useUpdateShotName());

    await act(async () => {
      await result.current.mutateAsync({
        shotId: 'shot-1',
        name: 'New Name',
        projectId: 'proj-1',
      });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('updates shot name with newName param (backwards compat)', async () => {
    const { result } = renderHookWithProviders(() => useUpdateShotName());

    await act(async () => {
      await result.current.mutateAsync({
        shotId: 'shot-1',
        newName: 'Updated Name',
        projectId: 'proj-1',
      });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('throws when no name provided', async () => {
    const { result } = renderHookWithProviders(() => useUpdateShotName());

    await expect(
      result.current.mutateAsync({
        shotId: 'shot-1',
        projectId: 'proj-1',
      })
    ).rejects.toThrow('Shot name is required');
  });

  it('handles DB error', async () => {
    mockUpdate.mockResolvedValue({ error: new Error('DB error') });
    const { result } = renderHookWithProviders(() => useUpdateShotName());

    await expect(
      result.current.mutateAsync({
        shotId: 'shot-1',
        name: 'Name',
        projectId: 'proj-1',
      })
    ).rejects.toThrow();
  });
});
