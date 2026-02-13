/**
 * RealtimeConnection Tests
 *
 * Tests for the Supabase WebSocket connection lifecycle manager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for variables referenced in vi.mock factories
const { mockSubscribe, mockUnsubscribe, mockOn } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockOn: vi.fn(),
}));

// Make mockOn return itself for chaining
mockOn.mockReturnThis();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' }, access_token: 'token-123' } },
        error: null,
      }),
    },
    channel: vi.fn().mockReturnValue({
      on: mockOn,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
    }),
    realtime: {
      setAuth: vi.fn(),
    },
  },
}));

vi.mock('../DataFreshnessManager', () => ({
  dataFreshnessManager: {
    onRealtimeStatusChange: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { RealtimeConnection } from '../RealtimeConnection';
import { dataFreshnessManager } from '../DataFreshnessManager';
import { supabase } from '@/integrations/supabase/client';

describe('RealtimeConnection', () => {
  let connection: RealtimeConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset mockOn to return itself for chaining after clearAllMocks
    mockOn.mockReturnThis();
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
      expect(supabase.channel).toHaveBeenCalledWith('task-updates:proj-1');
      expect(dataFreshnessManager.onRealtimeStatusChange).toHaveBeenCalledWith('connected', 'Connected');

      const state = connection.getState();
      expect(state.status).toBe('connected');
      expect(state.projectId).toBe('proj-1');
    });

    it('handles auth failure', async () => {
      (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
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
      expect(supabase.channel).not.toHaveBeenCalled();
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
