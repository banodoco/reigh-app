import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { renderHookWithProviders } from '@/test/test-utils';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';

const {
  eqMock,
  fromMock,
  mockUpdate,
  normalizeAndPresentErrorMock,
  updateMock,
} = vi.hoisted(() => ({
  eqMock: vi.fn(),
  fromMock: vi.fn(),
  mockUpdate: vi.fn(),
  normalizeAndPresentErrorMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: normalizeAndPresentErrorMock,
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: fromMock,
  }),
}));

import { useUpdateShotName } from '../useShotUpdates';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('useUpdateShotName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqMock.mockImplementation(() => mockUpdate());
    updateMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ update: updateMock });
    mockUpdate.mockResolvedValue({ error: null });
  });

  it('returns mutation object', () => {
    const { result } = renderHookWithProviders(() => useUpdateShotName());
    expect(typeof result.current.mutateAsync).toBe('function');
    expect(result.current.isPending).toBe(false);
  });

  it('updates shot name with name param', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(shotQueryKeys.list('proj-1', 0), [{ id: 'shot-1', name: 'Old Name' }]);
    queryClient.setQueryData(shotQueryKeys.detail('shot-1'), { id: 'shot-1', name: 'Old Name' });

    const { result } = renderHookWithProviders(() => useUpdateShotName(), { queryClient });

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

    expect(fromMock).toHaveBeenCalledWith('shots');
    expect(updateMock).toHaveBeenCalledWith({ name: 'New Name' });
    expect(eqMock).toHaveBeenCalledWith('id', 'shot-1');
    expect(queryClient.getQueryData(shotQueryKeys.list('proj-1', 0))).toEqual([
      expect.objectContaining({ id: 'shot-1', name: 'New Name' }),
    ]);
    expect(queryClient.getQueryData(shotQueryKeys.detail('shot-1'))).toEqual(
      expect.objectContaining({ id: 'shot-1', name: 'New Name' }),
    );
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
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rolls back caches and normalizes the error when the DB update fails', async () => {
    mockUpdate.mockResolvedValue({ error: new Error('DB error') });
    const queryClient = createQueryClient();
    queryClient.setQueryData(shotQueryKeys.list('proj-1', 0), [{ id: 'shot-1', name: 'Old Name' }]);
    queryClient.setQueryData(shotQueryKeys.detail('shot-1'), { id: 'shot-1', name: 'Old Name' });

    const { result } = renderHookWithProviders(() => useUpdateShotName(), { queryClient });

    await expect(
      result.current.mutateAsync({
        shotId: 'shot-1',
        name: 'Name',
        projectId: 'proj-1',
      })
    ).rejects.toThrow();

    expect(queryClient.getQueryData(shotQueryKeys.list('proj-1', 0))).toEqual([
      expect.objectContaining({ id: 'shot-1', name: 'Old Name' }),
    ]);
    expect(queryClient.getQueryData(shotQueryKeys.detail('shot-1'))).toEqual(
      expect.objectContaining({ id: 'shot-1', name: 'Old Name' }),
    );
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'DB error' }),
      expect.objectContaining({
        context: 'useUpdateShotName',
        toastTitle: 'Failed to update shot name',
      }),
    );
  });
});
