import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
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
      single: vi.fn().mockResolvedValue({
        data: {
          auto_topup_enabled: true,
          auto_topup_amount: 5000, // 50 dollars in cents
          auto_topup_threshold: 1000, // 10 dollars in cents
          auto_topup_last_triggered: null,
          auto_topup_setup_completed: true,
        },
        error: null,
      }),
    }),
  }),
}));

vi.mock('@/integrations/supabase/functions/invokeSupabaseEdgeFunction', () => ({
  invokeSupabaseEdgeFunction: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    credits: {
      autoTopupPreferences: ['credits', 'auto-topup'],
      all: ['credits'],
      balance: ['credits', 'balance'],
      ledger: ['credits', 'ledger'],
    },
  },
}));

import { useAutoTopup } from '@/shared/hooks/billing/useAutoTopup';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useAutoTopup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches preferences on mount', async () => {
    const { result } = renderHook(() => useAutoTopup(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingPreferences).toBe(false);
    });

    expect(result.current.preferences).toBeDefined();
    expect(result.current.preferences!.enabled).toBe(true);
    expect(result.current.preferences!.amount).toBe(50); // Cents to dollars
    expect(result.current.preferences!.threshold).toBe(10); // Cents to dollars
  });

  it('computes isEnabled from preferences', async () => {
    const { result } = renderHook(() => useAutoTopup(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingPreferences).toBe(false);
    });

    expect(result.current.isEnabled).toBe(true);
  });

  it('computes isSetupCompleted from preferences', async () => {
    const { result } = renderHook(() => useAutoTopup(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingPreferences).toBe(false);
    });

    expect(result.current.isSetupCompleted).toBe(true);
  });

  it('computes isFullyConfigured correctly', async () => {
    const { result } = renderHook(() => useAutoTopup(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingPreferences).toBe(false);
    });

    expect(result.current.isFullyConfigured).toBe(true);
  });

  it('starts with loading state', () => {
    const { result } = renderHook(() => useAutoTopup(), { wrapper: createWrapper() });
    expect(result.current.isLoadingPreferences).toBe(true);
  });

  it('provides mutation loading states', () => {
    const { result } = renderHook(() => useAutoTopup(), { wrapper: createWrapper() });
    expect(result.current.isUpdatingPreferences).toBe(false);
    expect(result.current.isDisabling).toBe(false);
  });

  it('defaults computed values to false when preferences not loaded', () => {
    const { result } = renderHook(() => useAutoTopup(), { wrapper: createWrapper() });
    // Before data loads, computed values default to false
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.isSetupCompleted).toBe(false);
    expect(result.current.hasPaymentMethod).toBe(false);
    expect(result.current.isFullyConfigured).toBe(false);
  });
});
