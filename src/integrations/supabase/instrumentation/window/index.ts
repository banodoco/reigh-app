import { __WS_INSTRUMENTATION_ENABLED__, __CORRUPTION_TRACE_ENABLED__ } from '@/integrations/supabase/config/env';
import { captureRealtimeSnapshot } from '@/integrations/supabase/utils/snapshot';
import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';

/** Shape of a Phoenix channel message received over WebSocket */
interface PhoenixMessage {
  event?: string;
  topic?: string;
  ref?: string;
  payload?: Record<string, unknown>;
}

/** Window extensions used by instrumentation */
interface InstrumentedWindow extends Window {
  __WS_PROBE_INSTALLED__?: boolean;
  __SUPABASE_WEBSOCKET_INSTANCES__?: Array<{
    wsId: number;
    url: string;
    protocols?: string | string[];
    createdAt: number;
    websocketRef: WebSocket;
  }>;
  __REALTIME_SNAPSHOT__?: Record<string, unknown>;
}

export function installWindowOnlyInstrumentation() {
  // InstrumentationManager removed - calling legacy function directly
  installWindowOnlyInstrumentationLegacy();
  return;
}

// Legacy function for backward compatibility - now delegates to InstrumentationManager
function installWindowOnlyInstrumentationLegacy() {
  if (typeof window === 'undefined') return;
  const instrumentedWindow = window as InstrumentedWindow;

  // localStorage monitoring removed - not needed in production

  // Global error capture (Supabase realtime related)
  if (__CORRUPTION_TRACE_ENABLED__) {
    const originalOnError = window.onerror;
    const originalOnUnhandledRejection = window.onunhandledrejection;

    window.onerror = function(message, source, lineno, colno, error) {
      const errorInfo = {
        message: String(message),
        source: String(source),
        lineno,
        colno,
        error: error ? { name: error.name, message: error.message, stack: error.stack } : null,
        timestamp: Date.now(),
        userAgent: navigator.userAgent.slice(0, 100)
      };

      const SUPABASE_JS_KNOWN_ERROR_LINE = 2372;
      if (source && source.includes('supabase-js.js') && lineno === SUPABASE_JS_KNOWN_ERROR_LINE) {
        console.error('[RealtimeCorruptionTrace] SUPABASE ERROR CAPTURED!', {
          ...errorInfo,
          realtimeSnapshot: captureRealtimeSnapshot(),
          corruptionTimeline: [...__CORRUPTION_TIMELINE__]
        });
        addCorruptionEvent('SUPABASE_ERROR_2372', errorInfo);
      } else if (message && (String(message).includes('supabase') || String(message).includes('realtime') || String(message).includes('websocket'))) {
        addCorruptionEvent('RELATED_ERROR', errorInfo);
      }

      if (originalOnError) return originalOnError.call(this, message, source, lineno, colno, error);
      return false;
    };

    window.onunhandledrejection = function(event: PromiseRejectionEvent) {
      const rejectionInfo = {
        reason: event.reason,
        promise: '[PROMISE_OBJECT]',
        timestamp: Date.now()
      };

      if (event.reason && (String(event.reason).includes('supabase') || String(event.reason).includes('realtime'))) {
        addCorruptionEvent('UNHANDLED_REJECTION', rejectionInfo);
      }

      if (originalOnUnhandledRejection) return originalOnUnhandledRejection.call(this, event);
    };
  }

  if (!__WS_INSTRUMENTATION_ENABLED__) {
    return;
  }

  if (instrumentedWindow.__WS_PROBE_INSTALLED__) return;

  instrumentedWindow.__WS_PROBE_INSTALLED__ = true;
  const OriginalWS = window.WebSocket;

  let wsCreationCount = 0;
  let wsDestroyedCount = 0;

  instrumentedWindow.WebSocket = function(url: string, protocols?: string | string[]) {
    wsCreationCount++;
    const wsId = wsCreationCount;

    const isSupabaseRealtime = url.includes('supabase.co/realtime');
    const isSupabaseWebSocket = url.includes('supabase.co') && url.includes('websocket');

    let ws: WebSocket;
    try {
      ws = protocols ? new OriginalWS(url, protocols) : new OriginalWS(url);

      if (isSupabaseRealtime || isSupabaseWebSocket) {
        instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__ = instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__ || [];
        instrumentedWindow.__SUPABASE_WEBSOCKET_INSTANCES__.push({
          wsId,
          url,
          protocols,
          createdAt: Date.now(),
          websocketRef: ws
        });
      }

      ws.addEventListener('message', (event: MessageEvent) => {
        if (isSupabaseRealtime || isSupabaseWebSocket) {
          try {
            const messageData = typeof event.data === 'string' ? event.data : '[BINARY_DATA]';
            if (typeof messageData === 'string') {
              try {
                const parsed = JSON.parse(messageData) as PhoenixMessage;
                if (parsed.event) {
                  addCorruptionEvent('PHOENIX_MESSAGE', {
                    event: parsed.event,
                    topic: parsed.topic,
                    ref: parsed.ref,
                    payload: parsed.payload ? Object.keys(parsed.payload) : null
                  });
                }
              } catch {}
            }
            const snap = instrumentedWindow.__REALTIME_SNAPSHOT__ || {};
            instrumentedWindow.__REALTIME_SNAPSHOT__ = { ...snap, lastPhoenixMsgAt: Date.now() };
          } catch {}
        }
      });

      ws.addEventListener('close', () => {
        wsDestroyedCount++;
      });
    } catch (error: unknown) {
      throw error;
    }

    return ws as WebSocket;
  } as unknown as typeof WebSocket;

  // Global fetch instrumentation removed - not needed in production
}

