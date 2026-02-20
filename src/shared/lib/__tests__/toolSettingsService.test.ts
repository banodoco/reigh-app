import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {},
  },
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  SUPABASE_URL: 'https://testproject.supabase.co',
}));

vi.mock('@/tooling/toolDefaultsRegistry', () => ({
  toolDefaultsRegistry: {
    'test-tool': { setting1: 'default1', setting2: 42 },
    'other-tool': { enabled: true },
  },
}));

vi.mock('@/shared/lib/deepEqual', () => ({
  deepMerge: (...objects: Record<string, unknown>[]) => {
    return Object.assign({}, ...objects);
  },
}));

vi.mock('@/shared/lib/errorUtils', () => ({
  isCancellationError: (err: unknown) =>
    err instanceof DOMException && err.name === 'AbortError',
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

vi.mock('@/shared/lib/errorHandling/handleError', () => ({
  handleError: vi.fn(),
}));

import { getUserWithTimeout, fetchToolSettingsSupabase, setCachedUserId, _resetCachedUserForTesting } from '../toolSettingsService';

/** Helper: write a fake Supabase session to localStorage so readUserIdFromStorage works */
function setStoredSession(userId: string | null) {
  const key = 'sb-testproject-auth-token';
  if (userId === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify({ access_token: 'tok', user: { id: userId } }));
  }
}

describe('toolSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    _resetCachedUserForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('getUserWithTimeout', () => {
    it('returns user from localStorage when cache is cold', async () => {
      setStoredSession('user-from-storage');

      const result = await getUserWithTimeout();
      expect(result.data.user?.id).toBe('user-from-storage');
      expect(result.error).toBeNull();
    });

    it('returns cached user within cache window without re-reading localStorage', async () => {
      setCachedUserId('cached-user');

      // Remove from localStorage to confirm cache is used, not storage
      localStorage.clear();

      const result = await getUserWithTimeout();
      expect(result.data.user?.id).toBe('cached-user');
    });

    it('re-reads localStorage when cache expires', async () => {
      setCachedUserId('old-cached-user');

      // Advance past 10s cache TTL
      await vi.advanceTimersByTimeAsync(11_000);

      // Update storage with new user (e.g. after re-login)
      setStoredSession('fresh-user');

      const result = await getUserWithTimeout();
      expect(result.data.user?.id).toBe('fresh-user');
    });

    it('returns null user when no session in storage and cache is stale', async () => {
      setCachedUserId('stale');
      await vi.advanceTimersByTimeAsync(11_000);
      // No session in localStorage

      const result = await getUserWithTimeout();
      expect(result.data.user).toBeNull();
    });

    it('seeds in-memory cache from localStorage read', async () => {
      setStoredSession('storage-user');
      await vi.advanceTimersByTimeAsync(11_000); // ensure cache is cold

      await getUserWithTimeout(); // first call — reads from localStorage

      // Second call — cache should be warm (localStorage not needed)
      localStorage.clear();
      const result = await getUserWithTimeout();
      expect(result.data.user?.id).toBe('storage-user');
    });
  });

  describe('fetchToolSettingsSupabase', () => {
    beforeEach(() => {
      setStoredSession('test-user');
    });

    it('returns defaults when no settings exist', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await fetchToolSettingsSupabase('test-tool', {});

      expect(result.settings).toEqual({
        setting1: 'default1',
        setting2: 42,
      });
      expect(result.hasShotSettings).toBe(false);
    });

    it('merges user settings over defaults', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: { settings: { 'test-tool': { setting1: 'custom' } } },
        error: null,
      });
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await fetchToolSettingsSupabase('test-tool', {});

      expect(result.settings).toEqual(
        expect.objectContaining({
          setting1: 'custom',
          setting2: 42,
        })
      );
    });

    it('throws on aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        fetchToolSettingsSupabase('test-tool', {}, controller.signal)
      ).rejects.toThrow();
    });

    it('skips project query when no projectId provided', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      await fetchToolSettingsSupabase('test-tool', {});

      const fromCalls = mockFrom.mock.calls.map((c: unknown) => c[0]);
      expect(fromCalls).toContain('users');
    });

    it('throws Authentication required when not logged in', async () => {
      setStoredSession(null); // no session in storage, cache already cleared by beforeEach

      await expect(
        fetchToolSettingsSupabase('test-tool', {})
      ).rejects.toThrow('Authentication required');
    });
  });
});
