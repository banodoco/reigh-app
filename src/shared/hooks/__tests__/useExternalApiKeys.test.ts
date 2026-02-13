import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'key-1',
          service: 'huggingface',
          metadata: { username: 'testuser', verified: true, verifiedAt: '2024-01-01' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useHuggingFaceToken } from '../useExternalApiKeys';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useHuggingFaceToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the maybeSingle mock to return token data
    const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
    const chain = mockFrom('external_api_keys');
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'key-1',
        service: 'huggingface',
        metadata: { username: 'testuser', verified: true, verifiedAt: '2024-01-01' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      error: null,
    });
  });

  it('fetches token status on mount', async () => {
    const { result } = renderHook(() => useHuggingFaceToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasToken).toBe(true);
    expect(result.current.username).toBe('testuser');
    expect(result.current.isVerified).toBe(true);
  });

  it('reports hasToken false when no key exists', async () => {
    const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
    const chain = mockFrom('external_api_keys');
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useHuggingFaceToken(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasToken).toBe(false);
    expect(result.current.username).toBeUndefined();
  });

  it('provides saving and deleting states', () => {
    const { result } = renderHook(() => useHuggingFaceToken(), { wrapper: createWrapper() });
    expect(result.current.isSaving).toBe(false);
    expect(result.current.isDeleting).toBe(false);
  });

  it('verifyToken returns valid result for good token', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ name: 'verified-user' }),
    });

    const { result } = renderHook(() => useHuggingFaceToken(), { wrapper: createWrapper() });

    const verification = await result.current.verifyToken('hf_valid_token');
    expect(verification.valid).toBe(true);
    expect(verification.username).toBe('verified-user');
  });

  it('verifyToken returns invalid for 401', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const { result } = renderHook(() => useHuggingFaceToken(), { wrapper: createWrapper() });

    const verification = await result.current.verifyToken('hf_bad_token');
    expect(verification.valid).toBe(false);
    expect(verification.error).toBe('Invalid token');
  });

  it('verifyToken handles network errors', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useHuggingFaceToken(), { wrapper: createWrapper() });

    const verification = await result.current.verifyToken('hf_token');
    expect(verification.valid).toBe(false);
    expect(verification.error).toBe('Failed to connect to HuggingFace');
  });
});
