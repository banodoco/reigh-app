import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSupabaseClient } = vi.hoisted(() => ({
  mockGetSupabaseClient: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

import { captureRealtimeSnapshot } from '../snapshot';

describe('captureRealtimeSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__SUPABASE_WEBSOCKET_INSTANCES__;
  });

  it('returns error when no realtime client exists', () => {
    mockGetSupabaseClient.mockReturnValue({});
    const result = captureRealtimeSnapshot();
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('NO_REALTIME_CLIENT');
    }
  });

  it('returns error when client exists but no realtime', () => {
    mockGetSupabaseClient.mockReturnValue({});
    const result = captureRealtimeSnapshot();
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('NO_REALTIME_CLIENT');
    }
  });

  it('returns snapshot with channel information', () => {
    mockGetSupabaseClient.mockReturnValue({
      realtime: {
        channels: {
          'test-topic': { state: 'joined', joinRef: '1', ref: '2' },
        },
        isConnected: () => true,
      },
    });

    const result = captureRealtimeSnapshot();
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.isConnected).toBe(true);
      expect(result.channelCount).toBe(1);
      expect(result.channelDetails).toHaveLength(1);
      expect(result.channelDetails[0].topic).toBe('test-topic');
      expect(result.channelDetails[0].state).toBe('joined');
      expect(result.timestamp).toBeGreaterThan(0);
    }
  });

  it('handles socket info when available', () => {
    const mockSocket = { readyState: 1, url: 'wss://test.supabase.co/realtime', protocol: 'wss' };
    mockGetSupabaseClient.mockReturnValue({
      realtime: {
        socket: mockSocket,
        channels: {},
        isConnected: () => true,
      },
    });

    const result = captureRealtimeSnapshot();
    if (!('error' in result)) {
      expect(result.socket).toEqual({
        readyState: 1,
        url: 'wss://test.supabase.co/realtime',
        protocol: 'wss',
      });
    }
  });

  it('handles conn transport info', () => {
    const mockTransport = { readyState: 1, url: 'wss://test.supabase.co/realtime' };
    mockGetSupabaseClient.mockReturnValue({
      realtime: {
        conn: { transport: mockTransport, connectionState: 'open' },
        channels: {},
        isConnected: () => false,
      },
    });

    const result = captureRealtimeSnapshot();
    if (!('error' in result)) {
      expect(result.conn?.connectionState).toBe('open');
      expect(result.conn?.transport?.readyState).toBe(1);
    }
  });

  it('returns null socket when no socket present', () => {
    mockGetSupabaseClient.mockReturnValue({
      realtime: {
        channels: {},
        isConnected: () => false,
      },
    });

    const result = captureRealtimeSnapshot();
    if (!('error' in result)) {
      expect(result.socket).toBeNull();
      expect(result.conn).toBeNull();
    }
  });
});
