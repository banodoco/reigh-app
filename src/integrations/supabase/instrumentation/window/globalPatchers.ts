import { isSupabaseRealtimeSocket, isSupabaseWebSocket } from './eventCollectors';

/** Window extensions used by instrumentation */
export interface InstrumentedWindow extends Window {
  __WS_PROBE_INSTALLED__?: boolean;
  __SUPABASE_WEBSOCKET_INSTANCES__?: Array<{
    wsId: number;
    url: string;
    protocols?: string | string[];
    createdAt: number;
    websocketRef: WebSocket;
  }>;
  __REALTIME_SNAPSHOT__?: Record<string, unknown>;
  WebSocket: typeof WebSocket;
}

interface InstallGlobalErrorPatchersInput {
  instrumentedWindow: InstrumentedWindow;
  onWindowError: OnWindowError;
  onUnhandledRejection: (event: PromiseRejectionEvent) => void;
}

type OnWindowError = (
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error,
) => boolean | void;

export function installGlobalErrorPatchers({
  instrumentedWindow,
  onWindowError,
  onUnhandledRejection,
}: InstallGlobalErrorPatchersInput): void {
  const originalOnError = instrumentedWindow.onerror;
  const originalOnUnhandledRejection = instrumentedWindow.onunhandledrejection;

  instrumentedWindow.onerror = function patchedOnError(message, source, lineno, colno, error) {
    onWindowError(message, source, lineno, colno, error ?? undefined);
    if (originalOnError) {
      return originalOnError.call(this, message, source, lineno, colno, error);
    }
    return false;
  };

  instrumentedWindow.onunhandledrejection = function patchedUnhandledRejection(event: PromiseRejectionEvent) {
    onUnhandledRejection(event);
    if (originalOnUnhandledRejection) {
      return originalOnUnhandledRejection.call(instrumentedWindow, event);
    }
  };
}

interface WebSocketMessageCapture {
  wsId: number;
  url: string;
  protocols?: string | string[];
  event: MessageEvent;
}

interface InstallWebSocketProbeInput {
  instrumentedWindow: InstrumentedWindow;
  onTrackedSocketMessage: (capture: WebSocketMessageCapture) => void;
}

export function installWebSocketProbe({
  instrumentedWindow,
  onTrackedSocketMessage,
}: InstallWebSocketProbeInput): void {
  if (instrumentedWindow.__WS_PROBE_INSTALLED__) {
    return;
  }

  instrumentedWindow.__WS_PROBE_INSTALLED__ = true;
  const OriginalWebSocket = instrumentedWindow.WebSocket;
  let wsCreationCount = 0;

  instrumentedWindow.WebSocket = function patchedWebSocket(url: string, protocols?: string | string[]) {
    wsCreationCount += 1;
    const wsId = wsCreationCount;

    const trackSocket = isSupabaseRealtimeSocket(url) || isSupabaseWebSocket(url);
    const ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);

    if (trackSocket) {
      instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__ = instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__ || [];
      instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__.push({
        wsId,
        url,
        protocols,
        createdAt: Date.now(),
        websocketRef: ws,
      });
    }

    ws.addEventListener('message', (event: MessageEvent) => {
      if (!trackSocket) {
        return;
      }
      onTrackedSocketMessage({
        wsId,
        url,
        protocols,
        event,
      });
    });

    return ws as WebSocket;
  } as unknown as typeof WebSocket;
}
