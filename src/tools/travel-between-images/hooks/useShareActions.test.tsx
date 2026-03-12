// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authCallback: null as null | ((event: string, session: unknown) => void),
  unsubscribe: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mocks.authCallback = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
    },
    rpc: mocks.rpc,
  }),
}));

import { useShareActions } from './useShareActions';

describe('useShareActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    sessionStorage.clear();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it('redirects unauthenticated users into the sign-in flow and stores the pending share', async () => {
    const { result } = renderHook(() => useShareActions('share-1'));

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
    });

    act(() => {
      result.current.handleCopyToAccount();
    });

    expect(sessionStorage.getItem('pending_share')).toBe('share-1');
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Sign in required',
      description: 'Please sign in to copy this to your account',
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/?action=copy-share');
  });

  it('copies a share into a selected project and navigates after the success delay', async () => {
    vi.useFakeTimers();

    mocks.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });

    const { result } = renderHook(() => useShareActions('share-2'));

    await act(async () => {
      await result.current.handleProjectSelected('project-9');
    });

    expect(mocks.rpc).toHaveBeenCalledWith('copy_shot_from_share', {
      share_slug_param: 'share-2',
      target_project_id: 'project-9',
    });
    expect(result.current.copied).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Copied to your account!',
      description: 'The shot has been added to your project',
    });

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(mocks.navigate).toHaveBeenCalledWith('/tools/travel-between-images');
  });
});
