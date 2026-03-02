import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {},
  }),
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  getSupabaseUrl: () => 'https://testproject.supabase.co',
}));

vi.mock('@/tooling/toolDefaultsRegistry', () => ({
  toolDefaultsRegistry: {
    'test-tool': { setting1: 'default1', setting2: 42 },
    'other-tool': { enabled: true },
  },
}));

vi.mock('@/shared/lib/utils/deepEqual', () => ({
  deepMerge: (...objects: Record<string, unknown>[]) => {
    return Object.assign({}, ...objects);
  },
}));

vi.mock('@/shared/lib/errorHandling/errorUtils', () => ({
  isCancellationError: (err: unknown) =>
    err instanceof DOMException && err.name === 'AbortError',
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

import {
  getUserWithTimeout,
  fetchToolSettingsSupabase,
  fetchToolSettingsSupabaseOrThrow,
  ToolSettingsError,
  setCachedUserId,
  _resetCachedUserForTesting,
} from '../toolSettingsService';

function expectSuccess<T>(result: { ok: true; value: T } | { ok: false; errorCode: string; message: string }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`${result.errorCode}: ${result.message}`);
  }
  return result.value;
}

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

      const result = expectSuccess(await fetchToolSettingsSupabase('test-tool', {}));

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

      const result = expectSuccess(await fetchToolSettingsSupabase('test-tool', {}));

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

      const result = await fetchToolSettingsSupabase('test-tool', {}, controller.signal);
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('Expected cancellation failure result');
      }
      expect(result.errorCode).toBe('cancelled');
      expect(result.message).toContain('cancelled');
    });

    it('skips project query when no projectId provided', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      await fetchToolSettingsSupabase('test-tool', {});

      const fromCalls = mockFrom.mock.calls.map((c: unknown) => c[0]);
      expect(fromCalls).toContain('users');
    });

    it('throws Authentication required when not logged in', async () => {
      setStoredSession(null); // no session in storage, cache already cleared by beforeEach

      const result = await fetchToolSettingsSupabase('test-tool', {});
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('Expected auth_required failure result');
      }
      expect(result.errorCode).toBe('auth_required');
      expect(result.message).toContain('Authentication required');
    });
  });

  describe('fetchToolSettingsSupabaseOrThrow', () => {
    beforeEach(() => {
      setStoredSession('test-user');
    });

    it('returns settings when the structured result is ok', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await fetchToolSettingsSupabaseOrThrow('test-tool', {});

      expect(result.settings).toEqual({
        setting1: 'default1',
        setting2: 42,
      });
      expect(result.hasShotSettings).toBe(false);
    });

    it('throws ToolSettingsError when the structured result is a failure', async () => {
      setStoredSession(null);

      await expect(fetchToolSettingsSupabaseOrThrow('test-tool', {})).rejects.toMatchObject({
        name: 'ToolSettingsError',
        code: 'auth_required',
      } satisfies Partial<ToolSettingsError>);
    });
  });
});
