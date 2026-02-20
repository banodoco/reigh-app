import { describe, it, expect, beforeEach } from 'vitest';
import { captureRealtimeSnapshot } from '../snapshot';

const testWindow = window as unknown as Record<string, unknown>;

describe('captureRealtimeSnapshot', () => {
  beforeEach(() => {
    // Reset window.supabase before each test
    delete testWindow.supabase;
    delete testWindow.__SUPABASE_WEBSOCKET_INSTANCES__;
  });

  it('returns error when no realtime client exists', () => {
    const result = captureRealtimeSnapshot();
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('NO_REALTIME_CLIENT');
    }
  });

  it('returns error when supabase exists but no realtime', () => {
    testWindow.supabase = {};
    const result = captureRealtimeSnapshot();
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('NO_REALTIME_CLIENT');
    }
  });

  it('returns snapshot with channel information', () => {
    testWindow.supabase = {
      realtime: {
        channels: {
          'test-topic': { state: 'joined', joinRef: '1', ref: '2' },
        },
        isConnected: () => true,
      },
    };

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
    testWindow.supabase = {
      realtime: {
        socket: mockSocket,
        channels: {},
        isConnected: () => true,
      },
    };

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
    testWindow.supabase = {
      realtime: {
        conn: { transport: mockTransport, connectionState: 'open' },
        channels: {},
        isConnected: () => false,
      },
    };

    const result = captureRealtimeSnapshot();
    if (!('error' in result)) {
      expect(result.conn?.connectionState).toBe('open');
      expect(result.conn?.transport?.readyState).toBe(1);
    }
  });

  it('returns null socket when no socket present', () => {
    testWindow.supabase = {
      realtime: {
        channels: {},
        isConnected: () => false,
      },
    };

    const result = captureRealtimeSnapshot();
    if (!('error' in result)) {
      expect(result.socket).toBeNull();
      expect(result.conn).toBeNull();
    }
  });
});
