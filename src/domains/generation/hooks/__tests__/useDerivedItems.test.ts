import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDerivedItems } from '../useDerivedItems';

const fetchDerivedItemsFromRepositoryMock = vi.fn();

vi.mock('@/domains/generation/repository/derivedItemsRepository', () => ({
  fetchDerivedItemsFromRepository: (...args: unknown[]) =>
    fetchDerivedItemsFromRepositoryMock(...args),
}));

vi.mock('@/shared/hooks/useSmartPolling', () => ({
  useSmartPollingConfig: () => ({ refetchInterval: false }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('domains/generation/useDerivedItems', () => {
  beforeEach(() => {
    fetchDerivedItemsFromRepositoryMock.mockReset();
  });

  it('does not fetch when source id is null', () => {
    const { result } = renderHook(() => useDerivedItems(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.data).toBeUndefined();
    expect(fetchDerivedItemsFromRepositoryMock).not.toHaveBeenCalled();
  });

  it('fetches derived items when source id is provided', async () => {
    fetchDerivedItemsFromRepositoryMock.mockResolvedValue([
      {
        id: 'derived-1',
        thumbUrl: 'thumb',
        url: 'url',
        createdAt: '2025-01-01T00:00:00Z',
        derivedCount: 0,
        itemType: 'generation',
      },
    ]);

    const { result } = renderHook(() => useDerivedItems('gen-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchDerivedItemsFromRepositoryMock).toHaveBeenCalledWith('gen-1');
    expect(result.current.data).toHaveLength(1);
  });
});
