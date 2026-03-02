import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { useAuthGuard } from './useAuthGuard';

const {
  getSessionMock,
  onAuthStateChangeMock,
  getAuthStateManagerMock,
  getSupabaseClientResultMock,
  normalizeAndPresentErrorMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  getAuthStateManagerMock: vi.fn(),
  getSupabaseClientResultMock: vi.fn(),
  normalizeAndPresentErrorMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClientResult: () => getSupabaseClientResultMock(),
}));

vi.mock('@/integrations/supabase/auth/AuthStateManager', () => ({
  getAuthStateManager: () => getAuthStateManagerMock(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: normalizeAndPresentErrorMock,
}));

describe('useAuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthStateManagerMock.mockReturnValue(null);
    getSupabaseClientResultMock.mockReturnValue({
      ok: true,
      client: {
        auth: {
          getSession: getSessionMock,
          onAuthStateChange: onAuthStateChangeMock,
        },
      },
    });
  });

  it('handles getSession rejection and falls back to null session', async () => {
    const unsubscribe = vi.fn();
    getSessionMock.mockRejectedValue(new Error('session failed'));
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe } } });

    const { result, unmount } = renderHook(() => useAuthGuard());

    await waitFor(() => {
      expect(result.current.session).toBeNull();
    });

    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'useAuthGuard.getSession',
        showToast: false,
      }),
    );

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('loads session and subscribes through supabase when auth manager is absent', async () => {
    const session = { access_token: 'token' } as Session;
    const unsubscribe = vi.fn();
    getSessionMock.mockResolvedValue({ data: { session } });
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe } } });

    const { result, unmount } = renderHook(() => useAuthGuard());

    await waitFor(() => {
      expect(result.current.session).toBe(session);
    });

    expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('prefers shared auth manager subscription when available', async () => {
    const initialSession = { access_token: 'initial' } as Session;
    const pushedSession = { access_token: 'next' } as Session;
    const managerUnsubscribe = vi.fn();
    let managerCallback: ((event: unknown, session: Session | null) => void) | null = null;

    getSessionMock.mockResolvedValue({ data: { session: initialSession } });
    getAuthStateManagerMock.mockReturnValue({
      subscribe: vi.fn((_scope: string, callback: (event: unknown, session: Session | null) => void) => {
        managerCallback = callback;
        return managerUnsubscribe;
      }),
    });

    const { result, unmount } = renderHook(() => useAuthGuard());

    await waitFor(() => {
      expect(result.current.session).toBe(initialSession);
    });

    expect(onAuthStateChangeMock).not.toHaveBeenCalled();
    expect(managerCallback).not.toBeNull();

    act(() => {
      managerCallback?.('SIGNED_IN', pushedSession);
    });

    expect(result.current.session).toBe(pushedSession);

    unmount();
    expect(managerUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('falls back to null session when supabase runtime is unavailable', async () => {
    getSupabaseClientResultMock.mockReturnValue({
      ok: false,
      error: new Error('runtime unavailable'),
    });

    const { result } = renderHook(() => useAuthGuard());

    await waitFor(() => {
      expect(result.current.session).toBeNull();
    });

    expect(getSessionMock).not.toHaveBeenCalled();
    expect(onAuthStateChangeMock).not.toHaveBeenCalled();
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'useAuthGuard.supabaseUnavailable',
        showToast: false,
      }),
    );
  });
});
