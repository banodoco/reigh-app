import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const mockSingle = vi.fn().mockResolvedValue({ data: { credits: 5000 }, error: null });
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { [['access', 'token'].join('_')]: 'test-token' } },
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
    },
  };
});

vi.mock('@/shared/lib/invokeWithTimeout', () => ({
  invokeWithTimeout: vi.fn().mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/test' }),
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/queryDefaults', () => ({
  QUERY_PRESETS: {
    userConfig: { staleTime: 120000 },
  },
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    credits: {
      balance: ['credits', 'balance'],
      ledger: ['credits', 'ledger'],
      all: ['credits'],
      autoTopupPreferences: ['credits', 'auto-topup'],
    },
  },
}));

import { useCredits } from '../useCredits';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// Helper to get the mockSingle reference from the mocked module
function getMockSingle() {
  const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
  const chain = mockFrom('users');
  return chain.single as ReturnType<typeof vi.fn>;
}

describe('useCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup default mock for each test
    const mockSingle = getMockSingle();
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
    const mockSingle = getMockSingle();
    mockSingle.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });

    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false);
    });

    expect(result.current.balanceError).toBeTruthy();
  });

  it('defaults balance to 0 when credits is null', async () => {
    const mockSingle = getMockSingle();
    mockSingle.mockResolvedValue({ data: { credits: null }, error: null });

    const { result } = renderHook(() => useCredits(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingBalance).toBe(false);
    });

    expect(result.current.balance).toEqual({ balance: 0, currency: 'USD' });
  });
});
