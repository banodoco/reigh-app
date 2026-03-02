import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@getSupabase/supabase-js';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  standaloneState: { value: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: mocks.getSession,
    },
  }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

vi.mock('./displayMode', () => ({
  isStandaloneDisplayMode: () => mocks.standaloneState.value,
}));

import { useStandaloneAuthRedirect } from './useStandaloneAuthRedirect';

function Harness({
  setSession,
  navigate,
}: {
  setSession: (session: Session | null) => void;
  navigate: (to: string) => void;
}) {
  useStandaloneAuthRedirect({ setSession, navigate });
  return null;
}

describe('useStandaloneAuthRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.standaloneState.value = false;
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs session without redirect when not in standalone mode', async () => {
    const session = { access_token: 'token-1' } as Session;
    mocks.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });

    const setSession = vi.fn();
    const navigate = vi.fn();

    render(<Harness setSession={setSession} navigate={navigate} />);

    await waitFor(() => {
      expect(setSession).toHaveBeenCalledWith(session);
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it('performs delayed follow-up check and redirect in standalone mode', async () => {
    vi.useFakeTimers();
    mocks.standaloneState.value = true;
    const session = { access_token: 'token-2' } as Session;
    mocks.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });

    const setSession = vi.fn();
    const navigate = vi.fn();

    render(<Harness setSession={setSession} navigate={navigate} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(navigate).toHaveBeenCalledWith('/tools');
    expect(mocks.getSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('normalizes session fetch failures', async () => {
    const error = new Error('session-failed');
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error,
    });

    const setSession = vi.fn();
    const navigate = vi.fn();

    render(<Harness setSession={setSession} navigate={navigate} />);

    await waitFor(() => {
      expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          context: 'useStandaloneAuthRedirect.syncSessionAndRedirect',
          showToast: false,
        }),
      );
    });
    expect(setSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cancels delayed follow-up check on unmount', async () => {
    vi.useFakeTimers();
    mocks.standaloneState.value = true;
    const session = { access_token: 'token-3' } as Session;
    mocks.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });

    const setSession = vi.fn();
    const navigate = vi.fn();

    const { unmount } = render(<Harness setSession={setSession} navigate={navigate} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });

    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });
});
