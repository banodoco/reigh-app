import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installGlobalErrorPatchers,
  installWebSocketProbe,
  type InstrumentedWindow,
} from './globalPatchers';

const eventCollectorMocks = vi.hoisted(() => ({
  isSupabaseRealtimeSocket: vi.fn(),
  isSupabaseWebSocket: vi.fn(),
}));

vi.mock('./eventCollectors', () => ({
  isSupabaseRealtimeSocket: (...args: unknown[]) => eventCollectorMocks.isSupabaseRealtimeSocket(...args),
  isSupabaseWebSocket: (...args: unknown[]) => eventCollectorMocks.isSupabaseWebSocket(...args),
}));

class FakeWebSocket {
  url: string;
  protocols?: string | string[];
  listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
  }

  addEventListener(event: string, handler: (event: unknown) => void) {
    const existing = this.listeners.get(event) ?? [];
    existing.push(handler);
    this.listeners.set(event, existing);
  }

  emit(event: string, payload: unknown) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

function buildInstrumentedWindow(): InstrumentedWindow {
  return {
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    onerror: null,
    onunhandledrejection: null,
  } as InstrumentedWindow;
}

describe('globalPatchers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventCollectorMocks.isSupabaseRealtimeSocket.mockReturnValue(false);
    eventCollectorMocks.isSupabaseWebSocket.mockReturnValue(false);
  });

  it('patches global error handlers while preserving original callbacks', () => {
    const instrumentedWindow = buildInstrumentedWindow();
    const originalOnError = vi.fn(() => true);
    const originalUnhandled = vi.fn();
    instrumentedWindow.onerror = originalOnError;
    instrumentedWindow.onunhandledrejection = originalUnhandled;

    const onWindowError = vi.fn();
    const onUnhandledRejection = vi.fn();

    installGlobalErrorPatchers({
      instrumentedWindow,
      onWindowError,
      onUnhandledRejection,
    });

    const errorResult = instrumentedWindow.onerror?.('boom', 'file.ts', 10, 20, new Error('x'));
    const rejectionEvent = { reason: new Error('reject') } as PromiseRejectionEvent;
    instrumentedWindow.onunhandledrejection?.(rejectionEvent);

    expect(onWindowError).toHaveBeenCalledWith('boom', 'file.ts', 10, 20, expect.any(Error));
    expect(originalOnError).toHaveBeenCalledTimes(1);
    expect(errorResult).toBe(true);
    expect(onUnhandledRejection).toHaveBeenCalledWith(rejectionEvent);
    expect(originalUnhandled).toHaveBeenCalledWith(rejectionEvent);
  });

  it('installs a websocket probe once and captures tracked socket messages', () => {
    const instrumentedWindow = buildInstrumentedWindow();
    eventCollectorMocks.isSupabaseRealtimeSocket.mockImplementation((url: string) => url.includes('realtime'));

    const onTrackedSocketMessage = vi.fn();
    installWebSocketProbe({
      instrumentedWindow,
      onTrackedSocketMessage,
    });
    installWebSocketProbe({
      instrumentedWindow,
      onTrackedSocketMessage,
    });

    const PatchedWebSocket = instrumentedWindow.WebSocket;
    const trackedSocket = new PatchedWebSocket('wss://project.realtime.supabase.co/socket') as unknown as FakeWebSocket;
    trackedSocket.emit('message', { data: 'payload' });

    expect(instrumentedWindow.__WS_PROBE_INSTALLED__).toBe(true);
    expect(instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__).toHaveLength(1);
    expect(instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__?.[0]?.url).toContain('realtime.supabase.co');
    expect(onTrackedSocketMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: 1,
        url: 'wss://project.realtime.supabase.co/socket',
      }),
    );
  });
});
