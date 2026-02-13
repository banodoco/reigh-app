import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockApiKeys = { fal_api_key: 'fal-key-123', openai_api_key: 'openai-key-456' };

const mockSingle = vi.fn().mockResolvedValue({ data: { api_keys: mockApiKeys }, error: null });
const mockInsertSingle = vi.fn();
const mockUpdateSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockInsertSingle,
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: mockUpdateSingle,
          }),
        }),
      }),
    })),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/constants/supabaseErrors', () => ({
  isNotFoundError: (err: unknown) => false,
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    api: {
      keys: ['api', 'keys'],
      tokens: ['api', 'tokens'],
    },
  },
}));

import { useApiKeys } from '../useApiKeys';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useApiKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { api_keys: mockApiKeys }, error: null });
  });

  it('fetches API keys on mount', async () => {
    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.apiKeys).toEqual(mockApiKeys);
  });

  it('getApiKey returns specific key value', async () => {
    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.getApiKey('fal_api_key')).toBe('fal-key-123');
    expect(result.current.getApiKey('openai_api_key')).toBe('openai-key-456');
  });

  it('getApiKey returns empty string for missing key', async () => {
    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.getApiKey('replicate_api_key')).toBe('');
  });

  it('defaults apiKeys to empty object before load', () => {
    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });
    expect(result.current.apiKeys).toEqual({});
  });

  it('starts with isLoading true', () => {
    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('provides isUpdating state', () => {
    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });
    expect(result.current.isUpdating).toBe(false);
  });

  it('handles null api_keys from DB', async () => {
    mockSingle.mockResolvedValue({ data: { api_keys: null }, error: null });

    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.apiKeys).toEqual({});
  });
});
