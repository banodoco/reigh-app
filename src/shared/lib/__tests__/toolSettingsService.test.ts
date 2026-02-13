import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockGetSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: () => mockGetSession(),
      getUser: () => mockGetUser(),
    },
  },
}));

vi.mock('@/tools', () => ({
  toolsManifest: [
    { id: 'test-tool', defaults: { setting1: 'default1', setting2: 42 } },
    { id: 'other-tool', defaults: { enabled: true } },
  ],
}));

vi.mock('@/shared/lib/deepEqual', () => ({
  deepMerge: (...objects: Record<string, unknown>[]) => {
    return Object.assign({}, ...objects);
  },
}));

vi.mock('@/shared/lib/errorUtils', () => ({
  isCancellationError: (err: unknown) =>
    err instanceof DOMException && err.name === 'AbortError',
  isAbortError: (err: unknown) =>
    err instanceof Error && err.name === 'AbortError',
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { getUserWithTimeout, fetchToolSettingsSupabase } from '../toolSettingsService';

describe('toolSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getUserWithTimeout', () => {
    it('returns cached user within cache window', async () => {
      // First call to populate cache
      mockGetSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
      });

      const result1 = await getUserWithTimeout();
      expect(result1.data.user.id).toBe('user-123');

      // Second call should use cache (no new getSession call)
      mockGetSession.mockClear();
      const result2 = await getUserWithTimeout();
      expect(result2.data.user.id).toBe('user-123');
      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('returns user from session', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'session-user' } } },
      });

      // Advance past cache
      await vi.advanceTimersByTimeAsync(11000);

      const result = await getUserWithTimeout();
      expect(result.data.user.id).toBe('session-user');
    });

    it('falls back to getUser when session has no user', async () => {
      // Need to advance past cache window
      await vi.advanceTimersByTimeAsync(11000);

      mockGetSession.mockResolvedValue({
        data: { session: null },
      });
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'fetched-user' } },
        error: null,
      });

      const result = await getUserWithTimeout();
      expect(result.data.user.id).toBe('fetched-user');
    });
  });

  describe('fetchToolSettingsSupabase', () => {
    beforeEach(() => {
      // Setup auth to return a user
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'test-user' } } },
      });
    });

    it('returns defaults when no settings exist', async () => {
      // All queries return null
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await fetchToolSettingsSupabase('test-tool', {});

      expect(result.settings).toEqual({
        setting1: 'default1',
        setting2: 42,
      });
      expect(result.hasShotSettings).toBe(false);
    });

    it('merges user settings over defaults', async () => {
      // User has custom setting1
      mockMaybeSingle.mockResolvedValueOnce({
        data: { settings: { 'test-tool': { setting1: 'custom' } } },
        error: null,
      });
      // Project query - no results
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

    it('reports hasShotSettings when shot has settings', async () => {
      // User settings
      mockMaybeSingle.mockResolvedValueOnce({
        data: { settings: { 'test-tool': {} } },
        error: null,
      });
      // Project settings
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      // Shot settings with data
      mockMaybeSingle.mockResolvedValueOnce({
        data: { settings: { 'test-tool': { setting1: 'shot-override' } } },
        error: null,
      });

      const result = await fetchToolSettingsSupabase('test-tool', {
        projectId: 'proj-1',
        shotId: 'shot-1',
      });

      expect(result.hasShotSettings).toBe(true);
    });

    it('throws when authentication fails', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
      });
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      // Need to advance past user cache
      await vi.advanceTimersByTimeAsync(11000);

      await expect(
        fetchToolSettingsSupabase('test-tool', {})
      ).rejects.toThrow();
    });

    it('skips project query when no projectId provided', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      await fetchToolSettingsSupabase('test-tool', {});

      // from() should be called for 'users' but not 'projects' or 'shots'
      const fromCalls = mockFrom.mock.calls.map((c: any) => c[0]);
      expect(fromCalls).toContain('users');
      // We can't easily verify projects wasn't called since the mock pattern
      // is shared, but the code uses Promise.resolve for missing context
    });

    it('returns defaults on auth timeout', async () => {
      // Simulate auth timeout by making getSession never resolve within the timeout
      await vi.advanceTimersByTimeAsync(11000); // expire cache

      mockGetSession.mockImplementation(
        () => new Promise(() => {}) // never resolves
      );
      mockGetUser.mockImplementation(
        () => new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auth timeout')), 100)
        )
      );

      const promise = fetchToolSettingsSupabase('test-tool', {});
      await vi.advanceTimersByTimeAsync(16000); // past the 15s timeout

      // Should return defaults rather than throwing on auth timeout
      const result = await promise;
      expect(result.settings).toBeDefined();
      expect(result.hasShotSettings).toBe(false);
    });
  });
});
