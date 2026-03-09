import { describe, expect, it, vi } from 'vitest';
import {
  installGlobalErrorPatchers,
  installWebSocketProbe,
  type InstrumentedWindow,
} from './globalPatchers';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly protocols?: string | string[];
  private readonly listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(listener);
  }

  emitMessage(data: unknown) {
    const handlers = this.listeners.message || [];
    handlers.forEach((handler) => handler({ data }));
  }
}

function createInstrumentedWindow(
  overrides: Partial<InstrumentedWindow> = {},
): InstrumentedWindow {
  return {
    onerror: null,
    onunhandledrejection: null,
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    ...overrides,
  } as unknown as InstrumentedWindow;
}

describe('global window patchers', () => {
  it('installs error handlers that call instrumentation callbacks then original handlers', () => {
    const originalOnError = vi.fn(() => true);
    const originalOnUnhandledRejection = vi.fn();
    const onWindowError = vi.fn();
    const onUnhandledRejection = vi.fn();
    const instrumentedWindow = createInstrumentedWindow({
      onerror: originalOnError as unknown as OnErrorEventHandler,
      onunhandledrejection: originalOnUnhandledRejection as unknown as ((
        ev: PromiseRejectionEvent,
      ) => unknown),
    });

    installGlobalErrorPatchers({
      instrumentedWindow,
      onWindowError,
      onUnhandledRejection,
    });

    const returnValue = instrumentedWindow.onerror?.(
      'boom',
      'source.js',
      10,
      5,
      new Error('boom'),
    );
    const rejectionEvent = { reason: 'oops' } as PromiseRejectionEvent;
    instrumentedWindow.onunhandledrejection?.(rejectionEvent);

    expect(returnValue).toBe(true);
    expect(onWindowError).toHaveBeenCalledWith('boom', 'source.js', 10, 5, expect.any(Error));
    expect(originalOnError).toHaveBeenCalledWith('boom', 'source.js', 10, 5, expect.any(Error));
    expect(onUnhandledRejection).toHaveBeenCalledWith(rejectionEvent);
    expect(originalOnUnhandledRejection).toHaveBeenCalledWith(rejectionEvent);
  });

  it('tracks only supabase-related websocket instances and forwards message captures', () => {
    FakeWebSocket.instances = [];
    const onTrackedSocketMessage = vi.fn();
    const instrumentedWindow = createInstrumentedWindow();

    installWebSocketProbe({
      instrumentedWindow,
      onTrackedSocketMessage,
    });

    const realtimeSocket = new instrumentedWindow.WebSocket(
      'wss://example.supabase.co/realtime/v1/websocket',
    ) as unknown as FakeWebSocket;
    const unrelatedSocket = new instrumentedWindow.WebSocket(
      'wss://example.com/socket',
    ) as unknown as FakeWebSocket;

    realtimeSocket.emitMessage('tracked');
    unrelatedSocket.emitMessage('ignored');

    expect(instrumentedWindow.__WS_PROBE_INSTALLED__).toBe(true);
    expect(instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__).toHaveLength(1);
    expect(instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__?.[0]).toEqual(
      expect.objectContaining({
        wsId: 1,
        url: 'wss://example.supabase.co/realtime/v1/websocket',
        websocketRef: realtimeSocket,
      }),
    );
    expect(onTrackedSocketMessage).toHaveBeenCalledTimes(1);
    expect(onTrackedSocketMessage).toHaveBeenCalledWith(expect.objectContaining({
      wsId: 1,
      url: 'wss://example.supabase.co/realtime/v1/websocket',
      event: expect.objectContaining({ data: 'tracked' }),
    }));
  });

  it('does not reinstall websocket probe after the first install', () => {
    const onTrackedSocketMessage = vi.fn();
    const instrumentedWindow = createInstrumentedWindow({
      __WS_PROBE_INSTALLED__: true,
    });
    const initialWebSocket = instrumentedWindow.WebSocket;

    installWebSocketProbe({
      instrumentedWindow,
      onTrackedSocketMessage,
    });

    expect(instrumentedWindow.WebSocket).toBe(initialWebSocket);
    expect(onTrackedSocketMessage).not.toHaveBeenCalled();
  });
});
