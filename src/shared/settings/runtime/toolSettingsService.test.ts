import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockGetSession = vi.fn();
const mockUnsubscribe = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: {
    subscription: {
      unsubscribe: mockUnsubscribe,
    },
  },
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  getSupabaseUrl: () => 'https://testproject.supabase.co',
}));

vi.mock('@/tooling/toolDefaultsRegistry', () => {
  const toolDefaultsRegistry = {
    'test-tool': { setting1: 'default1', setting2: 42 },
    'other-tool': { enabled: true },
  };
  return {
    toolDefaultsRegistry,
    getToolDefaults: (toolId: string) =>
      toolDefaultsRegistry[toolId as keyof typeof toolDefaultsRegistry],
  };
});

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
  clearCachedUserId,
  readCachedUserId,
  resolveAndCacheUserId,
  fetchToolSettingsResult,
  fetchToolSettingsSupabase,
  initializeToolSettingsAuthCache,
  ToolSettingsError,
  setCachedUserId,
  _resetCachedUserForTesting,
} from './toolSettingsService';

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

function readStoredSessionUserId(): string | null {
  const raw = localStorage.getItem('sb-testproject-auth-token');
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { user?: { id?: string } };
    return parsed.user?.id ?? null;
  } catch {
    return null;
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createTestSupabaseClient() {
  return {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  };
}

describe('toolSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    _resetCachedUserForTesting();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockEq.mockImplementation(() => ({ maybeSingle: mockMaybeSingle }));
    mockSelect.mockImplementation(() => ({ eq: mockEq }));
    mockFrom.mockImplementation(() => ({ select: mockSelect }));
    mockGetSession.mockImplementation(async () => {
      const storedUserId = readStoredSessionUserId();
      return {
        data: {
          session: storedUserId ? { user: { id: storedUserId } } : null,
        },
      };
    });
    mockOnAuthStateChange.mockImplementation(() => ({
      data: {
        subscription: {
          unsubscribe: mockUnsubscribe,
        },
      },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('resolveAndCacheUserId', () => {
    it('initializes auth cache on demand when bootstrap has not run', async () => {
      setStoredSession('session-user');

      const result = await resolveAndCacheUserId(createTestSupabaseClient() as never);

      expect(result.data.user?.id).toBe('session-user');
      expect(mockGetSession).toHaveBeenCalledTimes(1);
      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    });

    it('returns user from localStorage when cache is cold', async () => {
      setStoredSession('user-from-storage');

      const result = await resolveAndCacheUserId();
      expect(result.data.user?.id).toBe('user-from-storage');
      expect(result.error).toBeNull();
    });

    it('returns cached user within cache window without re-reading localStorage', async () => {
      setCachedUserId('cached-user');

      // Remove from localStorage to confirm cache is used, not storage
      localStorage.clear();

      const result = await resolveAndCacheUserId();
      expect(result.data.user?.id).toBe('cached-user');
    });

    it('re-reads localStorage when cache expires', async () => {
      setCachedUserId('old-cached-user');

      // Advance past 10s cache TTL
      await vi.advanceTimersByTimeAsync(11_000);

      // Update storage with new user (e.g. after re-login)
      setStoredSession('fresh-user');

      const result = await resolveAndCacheUserId(createTestSupabaseClient() as never);
      expect(result.data.user?.id).toBe('fresh-user');
    });

    it('returns null user when no session in storage and cache is stale', async () => {
      setCachedUserId('stale');
      await vi.advanceTimersByTimeAsync(11_000);
      // No session in localStorage

      const result = await resolveAndCacheUserId(createTestSupabaseClient() as never);
      expect(result.data.user).toBeNull();
    });

    it('seeds in-memory cache from localStorage read', async () => {
      setStoredSession('storage-user');
      await vi.advanceTimersByTimeAsync(11_000); // ensure cache is cold

      await resolveAndCacheUserId(createTestSupabaseClient() as never); // first call — reads from localStorage

      // Second call — cache should be warm (localStorage not needed)
      localStorage.clear();
      const result = await resolveAndCacheUserId(createTestSupabaseClient() as never);
      expect(result.data.user?.id).toBe('storage-user');
    });
  });

  describe('initializeToolSettingsAuthCache', () => {
    it('seeds from storage immediately before async session reconciliation', async () => {
      setStoredSession('storage-user');
      const sessionLookup = createDeferred<{
        data: { session: { user: { id: string } } | null };
      }>();
      const getSession = vi.fn().mockReturnValue(sessionLookup.promise);
      const subscribe = vi.fn(() => {
        return () => {};
      });

      initializeToolSettingsAuthCache(
        { auth: { getSession } } as never,
        { subscribe },
      );

      expect((await resolveAndCacheUserId()).data.user?.id).toBe('storage-user');

      sessionLookup.resolve({
        data: {
          session: null,
        },
      });
      await Promise.resolve();
      expect((await resolveAndCacheUserId()).data.user).toBeNull();
      expect(subscribe).toHaveBeenCalledWith('toolSettingsService', expect.any(Function));
    });

    it('reconciles the cache from auth bootstrap and subsequent auth manager events', async () => {
      const getSession = vi.fn().mockResolvedValue({
        data: {
          session: { user: { id: 'session-user' } },
        },
      });
      let authCallback: ((event: string, session: { user?: { id?: string } } | null) => void) | undefined;
      const subscribe = vi.fn((_: string, callback) => {
        authCallback = callback;
        return () => {};
      });

      initializeToolSettingsAuthCache(
        { auth: { getSession } } as never,
        { subscribe },
      );

      await Promise.resolve();
      expect((await resolveAndCacheUserId()).data.user?.id).toBe('session-user');

      authCallback?.('SIGNED_IN', { user: { id: 'next-user' } });
      expect((await resolveAndCacheUserId()).data.user?.id).toBe('next-user');

      authCallback?.('SIGNED_OUT', null);
      expect((await resolveAndCacheUserId()).data.user).toBeNull();
    });
  });

  describe('readCachedUserId', () => {
    it('does not prime cache from localStorage', async () => {
      setStoredSession('user-from-storage');

      const result = await readCachedUserId();
      expect(result.data.user).toBeNull();
    });
  });

  describe('fetchToolSettingsResult', () => {
    beforeEach(() => {
      setStoredSession('test-user');
    });

    it('returns defaults when no settings exist', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = expectSuccess(await fetchToolSettingsResult('test-tool', {}, undefined, createTestSupabaseClient() as never));

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

      const result = expectSuccess(await fetchToolSettingsResult('test-tool', {}, undefined, createTestSupabaseClient() as never));

      expect(result.settings).toEqual(
        expect.objectContaining({
          setting1: 'custom',
          setting2: 42,
        })
      );
    });

    it('applies defaults < user < project < shot precedence', async () => {
      mockFrom.mockImplementation((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: () => {
              if (table === 'users') {
                return Promise.resolve({
                  data: { settings: { 'test-tool': { setting1: 'user', userOnly: true } } },
                  error: null,
                });
              }
              if (table === 'projects') {
                return Promise.resolve({
                  data: { settings: { 'test-tool': { setting1: 'project', projectOnly: true } } },
                  error: null,
                });
              }
              if (table === 'shots') {
                return Promise.resolve({
                  data: { settings: { 'test-tool': { setting1: 'shot', shotOnly: true } } },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
          })),
        })),
      }));

      const result = expectSuccess(await fetchToolSettingsResult('test-tool', {
        projectId: 'project-1',
        shotId: 'shot-1',
      }, undefined, createTestSupabaseClient() as never));

      expect(result.settings).toEqual({
        setting1: 'shot',
        setting2: 42,
        userOnly: true,
        projectOnly: true,
        shotOnly: true,
      });
      expect(result.hasShotSettings).toBe(true);
    });

    it('reuses the same in-flight fetch for concurrent identical requests', async () => {
      setCachedUserId('test-user');
      const deferred = createDeferred<{ data: null; error: null }>();
      mockFrom.mockImplementation((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: () => {
              mockMaybeSingle(table);
              return deferred.promise;
            },
          })),
        })),
      }));

      const first = fetchToolSettingsResult('test-tool', {
        projectId: 'project-1',
        shotId: 'shot-1',
      }, undefined, createTestSupabaseClient() as never);
      const second = fetchToolSettingsResult('test-tool', {
        projectId: 'project-1',
        shotId: 'shot-1',
      }, undefined, createTestSupabaseClient() as never);

      await Promise.resolve();
      expect(mockMaybeSingle).toHaveBeenCalledTimes(3);

      deferred.resolve({ data: null, error: null });
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult).toEqual(secondResult);
      expect(mockMaybeSingle).toHaveBeenCalledTimes(3);
    });

    it('cancels the fetch when auth changes after scope reads start', async () => {
      setCachedUserId('test-user');
      const deferred = createDeferred<{ data: null; error: null }>();
      mockMaybeSingle.mockImplementation(() => deferred.promise);

      const resultPromise = fetchToolSettingsResult('test-tool', {
        projectId: 'project-1',
      }, undefined, createTestSupabaseClient() as never);

      clearCachedUserId();
      setStoredSession(null);
      deferred.resolve({ data: null, error: null });

      const result = await resultPromise;
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('Expected cancellation failure result');
      }
      expect(result.errorCode).toBe('cancelled');
      expect(result.message).toContain('auth state change');
    });

    it('surfaces project scope fetch failures explicitly', async () => {
      mockFrom.mockImplementation((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: () => {
              if (table === 'projects') {
                return Promise.resolve({
                  data: null,
                  error: { message: 'project exploded' },
                });
              }
              if (table === 'users') {
                return Promise.resolve({
                  data: { settings: { 'test-tool': { setting1: 'user' } } },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
          })),
        })),
      }));

      const result = await fetchToolSettingsResult('test-tool', {
        projectId: 'project-1',
        shotId: 'shot-1',
      }, undefined, createTestSupabaseClient() as never);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('Expected scope_fetch_failed result');
      }
      expect(result.errorCode).toBe('scope_fetch_failed');
      expect(result.message).toContain('project settings');
    });

    it('throws on aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await fetchToolSettingsResult('test-tool', {}, controller.signal, createTestSupabaseClient() as never);
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('Expected cancellation failure result');
      }
      expect(result.errorCode).toBe('cancelled');
      expect(result.message).toContain('cancelled');
    });

    it('skips project query when no projectId provided', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      await fetchToolSettingsResult('test-tool', {}, undefined, createTestSupabaseClient() as never);

      const fromCalls = mockFrom.mock.calls.map((c: unknown) => c[0]);
      expect(fromCalls).toContain('users');
    });

    it('throws Authentication required when not logged in', async () => {
      setStoredSession(null); // no session in storage, cache already cleared by beforeEach

      const result = await fetchToolSettingsResult('test-tool', {}, undefined, createTestSupabaseClient() as never);
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('Expected auth_required failure result');
      }
      expect(result.errorCode).toBe('auth_required');
      expect(result.message).toContain('Authentication required');
    });
  });

  describe('fetchToolSettingsSupabase', () => {
    beforeEach(() => {
      setStoredSession('test-user');
    });

    it('returns settings when the structured result is ok', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await fetchToolSettingsSupabase('test-tool', {}, undefined, createTestSupabaseClient() as never);

      expect(result.settings).toEqual({
        setting1: 'default1',
        setting2: 42,
      });
      expect(result.hasShotSettings).toBe(false);
    });

    it('throws ToolSettingsError when the structured result is a failure', async () => {
      setStoredSession(null);

      await expect(fetchToolSettingsSupabase('test-tool', {}, undefined, createTestSupabaseClient() as never)).rejects.toMatchObject({
        name: 'ToolSettingsError',
        code: 'auth_required',
      } satisfies Partial<ToolSettingsError>);
    });
  });
});
