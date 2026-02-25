import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { mockSupabase, mockSingle } = vi.hoisted(() => {
  const mockUser = { id: 'test-user-id' };
  const mockSingle = vi.fn().mockResolvedValue({ data: { credits: 5000 }, error: null });
  const mockSupabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token', user: mockUser } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: mockSingle,
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
  return { mockSupabase, mockSingle };
});

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => mockSupabase,
}));

vi.mock('@/shared/lib/invokeWithTimeout', () => ({
  invokeWithTimeout: vi.fn().mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/test' }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
  reportRuntimeError: vi.fn(),
}));

vi.mock('@/shared/lib/queryDefaults', () => ({
  QUERY_PRESETS: {
    userConfig: { staleTime: 120000 },
  },
}));

vi.mock('@/shared/lib/queryKeys/credits', () => ({
  creditQueryKeys: {
    balance: ['credits', 'balance'],
    ledger: ['credits', 'ledger'],
    ledgerPaginated: (limit: number, offset: number) => ['credits', 'ledger', limit, offset],
  },
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { useCredits } from '../useCredits';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { credits: 5000 }, error: null });
  });

  it('fetches credit balance on mount', async () => {
    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false);
    });

    expect(result.current.balance).toEqual({ balance: 5000, currency: 'USD' });
  });

  it('formatCurrency formats cents to USD', () => {
    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });
    expect(result.current.formatCurrency(1500)).toBe('$15.00');
    expect(result.current.formatCurrency(0)).toBe('$0.00');
    expect(result.current.formatCurrency(99)).toBe('$0.99');
  });

  it('starts with loading state', () => {
    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });
    expect(result.current.isLoadingBalance).toBe(true);
  });

  it('provides isCreatingCheckout state', () => {
    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });
    expect(result.current.isCreatingCheckout).toBe(false);
  });

  it('provides isGrantingCredits state', () => {
    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });
    expect(result.current.isGrantingCredits).toBe(false);
  });

  it('handles balance fetch error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });

    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false);
    });

    expect(result.current.balanceError).toBeTruthy();
  });

  it('defaults balance to 0 when credits is null', async () => {
    mockSingle.mockResolvedValue({ data: { credits: null }, error: null });

    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false);
    });

    expect(result.current.balance).toEqual({ balance: 0, currency: 'USD' });
  });
});
