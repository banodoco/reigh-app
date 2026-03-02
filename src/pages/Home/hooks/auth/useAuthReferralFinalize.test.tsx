import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClientResult: vi.fn(),
  getStorageItem: vi.fn(),
  removeStorageItems: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClientResult: mocks.getSupabaseClientResult,
}));

vi.mock('./storage', () => ({
  getStorageItem: mocks.getStorageItem,
  removeStorageItems: mocks.removeStorageItems,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

import { useAuthReferralFinalize } from './useAuthReferralFinalize';

describe('useAuthReferralFinalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.getSupabaseClientResult.mockReturnValue({
      ok: true,
      client: { rpc: mocks.rpc },
    });
  });

  it('returns a degraded failure when supabase runtime is unavailable', async () => {
    mocks.getSupabaseClientResult.mockReturnValue({
      ok: false,
      error: new Error('runtime not ready'),
    });

    const { result } = renderHook(() => useAuthReferralFinalize());
    const finalizeResult = await result.current();

    expect(finalizeResult.ok).toBe(false);
    if (!finalizeResult.ok) {
      expect(finalizeResult.errorCode).toBe('supabase_runtime_uninitialized');
      expect(finalizeResult.policy).toBe('degrade');
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns finalized=false when referral storage is incomplete', async () => {
    mocks.getStorageItem.mockImplementation((key: string) => {
      if (key === 'referralCode') return 'code-1';
      return null;
    });

    const { result } = renderHook(() => useAuthReferralFinalize());
    const finalizeResult = await result.current();

    expect(finalizeResult).toEqual({
      ok: true,
      value: { finalized: false },
      policy: 'best_effort',
      recoverable: false,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('finalizes referral and clears storage keys when rpc succeeds', async () => {
    mocks.getStorageItem.mockImplementation((key: string) => {
      if (key === 'referralCode') return 'code-2';
      if (key === 'referralSessionId') return 'session-2';
      if (key === 'referralFingerprint') return 'fingerprint-2';
      return null;
    });

    const { result } = renderHook(() => useAuthReferralFinalize());
    const finalizeResult = await result.current();

    expect(mocks.rpc).toHaveBeenCalledWith('create_referral_from_session', {
      p_session_id: 'session-2',
      p_fingerprint: 'fingerprint-2',
    });
    expect(mocks.removeStorageItems).toHaveBeenCalledWith(
      ['referralCode', 'referralSessionId', 'referralFingerprint', 'referralTimestamp'],
      'useAuthReferralFinalize.cleanup',
    );
    expect(finalizeResult).toEqual({
      ok: true,
      value: { finalized: true },
      policy: 'best_effort',
      recoverable: false,
    });
  });

  it('returns failure when rpc throws and reports normalized error', async () => {
    const rpcError = new Error('rpc failed');
    mocks.getStorageItem.mockImplementation((key: string) => {
      if (key === 'referralCode') return 'code-3';
      if (key === 'referralSessionId') return 'session-3';
      if (key === 'referralFingerprint') return 'fingerprint-3';
      return null;
    });
    mocks.rpc.mockResolvedValue({ error: rpcError });

    const { result } = renderHook(() => useAuthReferralFinalize());
    const finalizeResult = await result.current();

    expect(finalizeResult.ok).toBe(false);
    if (!finalizeResult.ok) {
      expect(finalizeResult.errorCode).toBe('referral_finalize_failed');
      expect(finalizeResult.policy).toBe('best_effort');
      expect(finalizeResult.recoverable).toBe(true);
    }
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      rpcError,
      expect.objectContaining({
        context: 'useAuthReferralFinalize.finalize',
        showToast: false,
      }),
    );
    expect(mocks.removeStorageItems).not.toHaveBeenCalled();
  });
});
