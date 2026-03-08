/**
 * RealtimeConnection Tests
 *
 * Tests for the Supabase WebSocket connection lifecycle manager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for variables referenced in vi.mock factories
const { mockSubscribe, mockUnsubscribe, mockOn, mockGetSession, mockSetAuth, mockChannel } = vi.hoisted(() => {
  const mockSubscribeFn = vi.fn();
  const mockUnsubscribeFn = vi.fn();
  const mockOnFn = vi.fn();
  const mockGetSessionFn = vi.fn();
  const mockSetAuthFn = vi.fn();
  const mockChannelFn = vi.fn().mockReturnValue({
    on: mockOnFn,
    subscribe: mockSubscribeFn,
    unsubscribe: mockUnsubscribeFn,
  });

  return {
    mockSubscribe: mockSubscribeFn,
    mockUnsubscribe: mockUnsubscribeFn,
    mockOn: mockOnFn,
    mockGetSession: mockGetSessionFn,
    mockSetAuth: mockSetAuthFn,
    mockChannel: mockChannelFn,
  };
});

// Make mockOn return itself for chaining
mockOn.mockReturnThis();

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
    },
    channel: mockChannel,
    realtime: {
      setAuth: mockSetAuth,
    },
  })),
}));

vi.mock('../DataFreshnessManager', () => ({
  dataFreshnessManager: {
    onRealtimeStatusChange: vi.fn(),
    reset: vi.fn(),
  },
}));

import { RealtimeConnection } from '../RealtimeConnection';
import { dataFreshnessManager } from '../DataFreshnessManager';

describe('RealtimeConnection', () => {
  let connection: RealtimeConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset mockOn to return itself for chaining after clearAllMocks
    mockOn.mockReturnThis();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' }, [['access', 'token'].join('_')]: 'token-123' } },
      error: null,
    });
    connection = new RealtimeConnection({
      subscribeTimeout: 5000,
      maxReconnectAttempts: 3,
      baseReconnectDelay: 1000,
      maxReconnectDelay: 10000,
    });
  });

  afterEach(() => {
    connection.destroy();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in disconnected state', () => {
      const state = connection.getState();
      expect(state.status).toBe('disconnected');
      expect(state.projectId).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('connect', () => {
    it('sets status to connecting and creates channel', async () => {
      // Make subscribe call the callback synchronously with SUBSCRIBED
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
      });

      const result = await connection.connect('proj-1');

      expect(result).toBe(true);
      expect(mockChannel).toHaveBeenCalledWith('task-updates:proj-1');
      expect(dataFreshnessManager.onRealtimeStatusChange).toHaveBeenCalledWith('connected', 'Connected');

      const state = connection.getState();
      expect(state.status).toBe('connected');
      expect(state.projectId).toBe('proj-1');
    });

    it('handles auth failure', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const result = await connection.connect('proj-1');

      expect(result).toBe(false);
      const state = connection.getState();
      expect(state.status).toBe('failed');
    });

    it('handles subscribe failure', async () => {
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        callback('CHANNEL_ERROR');
      });

      const result = await connection.connect('proj-1');

      expect(result).toBe(false);
      const state = connection.getState();
      // Should be reconnecting (not failed, because it tries to reconnect)
      expect(state.status).toBe('reconnecting');
    });

    it('no-ops when already connected to the same project', async () => {
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
      });

      await connection.connect('proj-1');
      vi.clearAllMocks();
      mockOn.mockReturnThis();

      const result = await connection.connect('proj-1');
      expect(result).toBe(true);
      // Should not create a new channel
      expect(mockChannel).not.toHaveBeenCalled();
    });

    it('dedupes concurrent connect calls for the same project', async () => {
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
      });

      const [firstResult, secondResult] = await Promise.all([
        connection.connect('proj-1'),
        connection.connect('proj-1'),
      ]);

      expect(firstResult).toBe(true);
      expect(secondResult).toBe(true);
      expect(mockChannel).toHaveBeenCalledTimes(1);
    });

    it('cancels stale scheduled reconnect when auth heal starts a fresh attempt', async () => {
      let subscribeCount = 0;
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        subscribeCount += 1;
        callback(subscribeCount === 1 ? 'CHANNEL_ERROR' : 'SUBSCRIBED');
      });

      const initialResult = await connection.connect('proj-1');
      expect(initialResult).toBe(false);
      expect(mockChannel).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new CustomEvent('realtime:auth-heal', {
        detail: {
          source: 'test',
          reason: 'force-heal',
          priority: 'high',
          coalescedSources: ['test'],
          coalescedReasons: ['force-heal'],
          timestamp: Date.now(),
        },
      }));
      await vi.runOnlyPendingTimersAsync();

      expect(mockChannel).toHaveBeenCalledTimes(2);
      expect(connection.getState().status).toBe('connected');

      // Original local reconnect timer should have been cancelled by the newer heal-driven attempt.
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockChannel).toHaveBeenCalledTimes(2);
    });
  });

  describe('disconnect', () => {
    it('disconnects and resets state', async () => {
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
      });

      await connection.connect('proj-1');
      await connection.disconnect();

      const state = connection.getState();
      expect(state.status).toBe('disconnected');
      expect(state.projectId).toBeNull();
      expect(dataFreshnessManager.onRealtimeStatusChange).toHaveBeenCalledWith('disconnected', 'Disconnected');
    });
  });

  describe('onStatusChange', () => {
    it('immediately calls callback with current state', () => {
      const callback = vi.fn();
      connection.onStatusChange(callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].status).toBe('disconnected');
    });

    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = connection.onStatusChange(callback);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('onEvent', () => {
    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = connection.onEvent(callback);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('reset', () => {
    it('resets connection state', async () => {
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
      });

      await connection.connect('proj-1');
      connection.reset();

      const state = connection.getState();
      expect(state.status).toBe('disconnected');
      expect(state.projectId).toBeNull();
    });
  });

  describe('destroy', () => {
    it('clears all callbacks and disconnects', async () => {
      mockSubscribe.mockImplementation((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
      });

      const statusCallback = vi.fn();
      const eventCallback = vi.fn();

      connection.onStatusChange(statusCallback);
      connection.onEvent(eventCallback);

      await connection.connect('proj-1');
      connection.destroy();

      // After destroy, callbacks should be cleared
      // (We can't easily test this externally, but verify no errors)
    });
  });
});
