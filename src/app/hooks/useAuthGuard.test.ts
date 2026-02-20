import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { useAuthGuard } from './useAuthGuard';

const { getSessionMock, onAuthStateChangeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  },
}));

describe('useAuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Record<string, unknown>).__AUTH_MANAGER__;
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

  it('prefers window auth manager subscription when available', async () => {
    const initialSession = { access_token: 'initial' } as Session;
    const pushedSession = { access_token: 'next' } as Session;
    const managerUnsubscribe = vi.fn();
    let managerCallback: ((event: unknown, session: Session | null) => void) | null = null;

    getSessionMock.mockResolvedValue({ data: { session: initialSession } });
    (window as Record<string, unknown>).__AUTH_MANAGER__ = {
      subscribe: vi.fn((_scope: string, callback: (event: unknown, session: Session | null) => void) => {
        managerCallback = callback;
        return managerUnsubscribe;
      }),
    };

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
});
