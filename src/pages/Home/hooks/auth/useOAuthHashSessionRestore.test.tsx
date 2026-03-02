import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@getSupabase/supabase-js';

const mocks = vi.hoisted(() => ({
  setSessionApi: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  setStorageItem: vi.fn(),
  removeStorageItem: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      setSession: mocks.setSessionApi,
    },
  }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

vi.mock('./storage', () => ({
  setStorageItem: mocks.setStorageItem,
  removeStorageItem: mocks.removeStorageItem,
}));

import { useOAuthHashSessionRestore } from './useOAuthHashSessionRestore';

describe('useOAuthHashSessionRestore', () => {
  const originalHash = window.location.hash;
  const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it('does nothing when no OAuth token hash is present', async () => {
    const setSession = vi.fn();

    renderHook(() => useOAuthHashSessionRestore({ setSession }));

    await waitFor(() => {
      expect(mocks.setSessionApi).not.toHaveBeenCalled();
    });
    expect(setSession).not.toHaveBeenCalled();
    expect(mocks.setStorageItem).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('restores session from hash tokens and clears URL hash', async () => {
    const session = { access_token: 'token-1' } as Session;
    mocks.setSessionApi.mockResolvedValue({
      data: { session },
      error: null,
    });
    window.location.hash = '#access_token=token-1&refresh_token=refresh-1';

    const setSession = vi.fn();
    renderHook(() => useOAuthHashSessionRestore({ setSession }));

    await waitFor(() => {
      expect(mocks.setSessionApi).toHaveBeenCalledWith({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
      });
    });
    expect(mocks.setStorageItem).toHaveBeenCalledWith(
      'oauthInProgress',
      'true',
      'useOAuthHashSessionRestore.setOAuthInProgress',
    );
    expect(setSession).toHaveBeenCalledWith(session);
    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      '',
      window.location.pathname + window.location.search,
    );
  });

  it('normalizes failures and clears oauth-in-progress flag', async () => {
    const error = new Error('setSession failed');
    mocks.setSessionApi.mockResolvedValue({
      data: { session: null },
      error,
    });
    window.location.hash = '#access_token=token-2&refresh_token=refresh-2';

    const setSession = vi.fn();
    renderHook(() => useOAuthHashSessionRestore({ setSession }));

    await waitFor(() => {
      expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          context: 'useOAuthHashSessionRestore.restore',
          showToast: false,
        }),
      );
    });
    expect(setSession).not.toHaveBeenCalled();
    expect(mocks.removeStorageItem).toHaveBeenCalledWith(
      'oauthInProgress',
      'useOAuthHashSessionRestore.clearOAuthInProgressOnError',
    );
    expect(replaceStateSpy).toHaveBeenCalled();
  });
});
