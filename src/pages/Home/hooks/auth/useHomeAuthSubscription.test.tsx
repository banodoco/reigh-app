import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { useHomeAuthSubscription } from './useHomeAuthSubscription';

const mocks = vi.hoisted(() => ({
  getAuthStateManager: vi.fn(),
  getSupabaseClient: vi.fn(),
  useAuthReferralFinalize: vi.fn(),
  getStorageItem: vi.fn(),
  removeStorageItem: vi.fn(),
  isStandaloneDisplayMode: vi.fn(),
}));

vi.mock('@/integrations/supabase/auth/AuthStateManager', () => ({
  getAuthStateManager: (...args: unknown[]) => mocks.getAuthStateManager(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

vi.mock('./useAuthReferralFinalize', () => ({
  useAuthReferralFinalize: (...args: unknown[]) => mocks.useAuthReferralFinalize(...args),
}));

vi.mock('./storage', () => ({
  getStorageItem: (...args: unknown[]) => mocks.getStorageItem(...args),
  removeStorageItem: (...args: unknown[]) => mocks.removeStorageItem(...args),
}));

vi.mock('./displayMode', () => ({
  isStandaloneDisplayMode: (...args: unknown[]) => mocks.isStandaloneDisplayMode(...args),
}));

describe('useHomeAuthSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isStandaloneDisplayMode.mockReturnValue(false);
    mocks.getStorageItem.mockReturnValue('false');
    mocks.useAuthReferralFinalize.mockReturnValue(vi.fn().mockResolvedValue(undefined));
  });

  it('subscribes through auth manager and redirects immediately in standalone mode', () => {
    const setSession = vi.fn();
    const navigate = vi.fn();
    const unsubscribe = vi.fn();
    let authHandler: ((event: string, session: Session | null) => void) | undefined;
    const subscribe = vi.fn((key: string, handler: (event: string, session: Session | null) => void) => {
      authHandler = handler;
      expect(key).toBe('HomePage');
      return unsubscribe;
    });

    mocks.getAuthStateManager.mockReturnValue({ subscribe });
    mocks.isStandaloneDisplayMode.mockReturnValue(true);

    const { unmount } = renderHook(() =>
      useHomeAuthSubscription({
        setSession,
        navigate,
        pathname: '/home',
      }),
    );

    const session = { access_token: 'token-1' } as Session;
    act(() => {
      authHandler?.('INITIAL_SESSION', session);
    });

    expect(setSession).toHaveBeenCalledWith(session);
    expect(navigate).toHaveBeenCalledWith('/tools');
    expect(mocks.getStorageItem).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('finalizes oauth referral before redirecting when oauth flow flag is set', async () => {
    const setSession = vi.fn();
    const navigate = vi.fn();
    const finalizeReferral = vi.fn().mockResolvedValue(undefined);
    let authHandler: ((event: string, session: Session | null) => void) | undefined;

    mocks.useAuthReferralFinalize.mockReturnValue(finalizeReferral);
    mocks.getStorageItem.mockReturnValue('true');
    mocks.getAuthStateManager.mockReturnValue({
      subscribe: (_key: string, handler: (event: string, session: Session | null) => void) => {
        authHandler = handler;
        return vi.fn();
      },
    });

    renderHook(() =>
      useHomeAuthSubscription({
        setSession,
        navigate,
        pathname: '/home',
      }),
    );

    const session = { access_token: 'token-2' } as Session;
    await act(async () => {
      authHandler?.('SIGNED_IN', session);
      await Promise.resolve();
    });

    expect(setSession).toHaveBeenCalledWith(session);
    expect(finalizeReferral).toHaveBeenCalledTimes(1);
    expect(mocks.removeStorageItem).toHaveBeenCalledWith(
      'oauthInProgress',
      'useHomeAuthSubscription.clear.oauthInProgress',
    );
    expect(navigate).toHaveBeenCalledWith('/tools');
  });

  it('falls back to supabase auth listener and only redirects on signed-in non-home path', () => {
    const setSession = vi.fn();
    const navigate = vi.fn();
    const unsubscribe = vi.fn();
    let authHandler: ((event: string, session: Session | null) => void) | undefined;
    const onAuthStateChange = vi.fn((handler: (event: string, session: Session | null) => void) => {
      authHandler = handler;
      return {
        data: {
          subscription: {
            unsubscribe,
          },
        },
      };
    });

    mocks.getAuthStateManager.mockReturnValue(null);
    mocks.getSupabaseClient.mockReturnValue({
      auth: { onAuthStateChange },
    });

    const { unmount } = renderHook(() =>
      useHomeAuthSubscription({
        setSession,
        navigate,
        pathname: '/settings',
      }),
    );

    const session = { access_token: 'token-3' } as Session;
    act(() => {
      authHandler?.('SIGNED_IN', session);
      authHandler?.('TOKEN_REFRESHED', session);
      authHandler?.('SIGNED_IN', null);
    });

    expect(setSession).toHaveBeenCalledTimes(3);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/tools');

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
