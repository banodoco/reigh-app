import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCurrentSession,
  rpcCreateReferralFromSession,
  setSessionFromTokens,
  subscribeToAuthStateChanges,
} from './homeAuthRepository';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

describe('homeAuthRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets auth session from access and refresh tokens', async () => {
    const setSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'a' } }, error: null });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { setSession, getSession: vi.fn(), onAuthStateChange: vi.fn() },
      rpc: vi.fn(),
    });

    const result = await setSessionFromTokens('access-1', 'refresh-1');

    expect(setSession).toHaveBeenCalledWith({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
    });
    expect(result).toEqual({ data: { session: { access_token: 'a' } }, error: null });
  });

  it('fetches session and calls referral RPC with normalized params', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { setSession: vi.fn(), getSession, onAuthStateChange: vi.fn() },
      rpc,
    });

    await fetchCurrentSession();
    await rpcCreateReferralFromSession('session-1', 'fingerprint-1');

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_referral_from_session', {
      p_session_id: 'session-1',
      p_fingerprint: 'fingerprint-1',
    });
  });

  it('subscribes to auth-state changes and returns an unsubscribe cleanup', () => {
    const unsubscribe = vi.fn();
    const onAuthStateChange = vi.fn().mockReturnValue({
      data: { listener: true, subscription: { unsubscribe } },
    });
    const handler = vi.fn();
    mocks.getSupabaseClient.mockReturnValue({
      auth: { setSession: vi.fn(), getSession: vi.fn(), onAuthStateChange },
      rpc: vi.fn(),
    });

    const cleanup = subscribeToAuthStateChanges(handler);
    cleanup();

    expect(onAuthStateChange).toHaveBeenCalledWith(handler);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
