import { __CORRUPTION_TRACE_ENABLED__, __REALTIME_DOWN_FIX_ENABLED__ } from '@/integrations/supabase/config/env';
import { captureRealtimeSnapshot } from '@/integrations/supabase/utils/snapshot';
import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { SupabaseClient } from '@supabase/supabase-js';

// Realtime client with instrumentation properties
interface RealtimeClientWithInstrumentation {
  socket: WebSocket | null;
  conn?: { transport?: { ws?: WebSocket | null } };
  __REFERENCE_TRACKING_INSTALLED__?: boolean;
  setAuth: (token: string | null) => void;
  __setAuth?: (token: string | null) => void;
}

function reportRealtimeCorruption(message: string, logData: Record<string, unknown>) {
  handleError(new Error(message), {
    context: 'RealtimeInstrumentation',
    showToast: false,
    logData,
  });
}

export function installRealtimeInstrumentation(supabase: SupabaseClient) {
  // InstrumentationManager removed - calling legacy function directly
  return installRealtimeInstrumentationLegacy(supabase);
}

// Legacy function for backward compatibility - direct implementation
function installRealtimeInstrumentationLegacy(supabase: SupabaseClient) {
  if (typeof window === 'undefined' || !supabase?.realtime) return;
  const realtime = supabase.realtime as unknown as RealtimeClientWithInstrumentation;

  // Reference mutation tracking for realtime.socket and conn.transport
  try {
    if (realtime && !realtime.__REFERENCE_TRACKING_INSTALLED__) {
      let _socket = realtime.socket;
      Object.defineProperty(realtime, 'socket', {
        get() { return _socket; },
        set(value) {
          const before = captureRealtimeSnapshot();
          if (_socket && !value) {
            reportRealtimeCorruption('[RealtimeCorruptionTrace] realtime.socket set to null', {
              previousValue: _socket,
              newValue: value,
              stackTrace: new Error().stack,
              realtimeStateBefore: before,
              corruptionTimeline: [...__CORRUPTION_TIMELINE__],
              timestamp: Date.now(),
            });
            addCorruptionEvent('SOCKET_SET_TO_NULL', { previousValue: _socket, newValue: value });
          } else if (!_socket && value) {
            addCorruptionEvent('SOCKET_SET_TO_WEBSOCKET', { newValue: value });
          } else if (_socket !== value) {
            reportRealtimeCorruption('[RealtimeCorruptionTrace] realtime.socket replaced', {
              previousValue: _socket,
              newValue: value,
              stackTrace: new Error().stack,
              realtimeStateBefore: before,
              timestamp: Date.now(),
            });
            addCorruptionEvent('SOCKET_REPLACED', { previousValue: _socket, newValue: value });
          }
          _socket = value as WebSocket | null;
        },
        configurable: true
      });

      if (realtime.conn) {
        let _transport = realtime.conn.transport;
        Object.defineProperty(realtime.conn, 'transport', {
          get() { return _transport; },
          set(value) {
            const before = captureRealtimeSnapshot();
            if (_transport && !value) {
              reportRealtimeCorruption('[RealtimeCorruptionTrace] conn.transport set to null', {
                previousValue: _transport,
                newValue: value,
                stackTrace: new Error().stack,
                realtimeStateBefore: before,
                corruptionTimeline: [...__CORRUPTION_TIMELINE__],
                timestamp: Date.now(),
              });
              addCorruptionEvent('TRANSPORT_SET_TO_NULL', { previousValue: _transport, newValue: value });
            } else if (!_transport && value) {
              addCorruptionEvent('TRANSPORT_SET_TO_WEBSOCKET', { newValue: value });
            } else if (_transport !== value) {
              reportRealtimeCorruption('[RealtimeCorruptionTrace] conn.transport replaced', {
                previousValue: _transport,
                newValue: value,
                stackTrace: new Error().stack,
                realtimeStateBefore: before,
                timestamp: Date.now(),
              });
              addCorruptionEvent('TRANSPORT_REPLACED', { previousValue: _transport, newValue: value });
            }
            _transport = value as typeof _transport;
          },
          configurable: true
        });
      }
      realtime.__REFERENCE_TRACKING_INSTALLED__ = true;
    }
  } catch (error) {
    handleError(error, { context: 'RealtimeInstrumentation', showToast: false });
  }

  // Heuristic for realtime=down to dispatch provider-led heal
  if (__REALTIME_DOWN_FIX_ENABLED__ && typeof window !== 'undefined') {
    const consoleWithFlag = console as Console & { __WARN_INTERCEPTED__?: boolean };
    if (!consoleWithFlag.__WARN_INTERCEPTED__) {
      consoleWithFlag.__WARN_INTERCEPTED__ = true;
      const originalConsoleWarn = console.warn;
      console.warn = function(...args: unknown[]) {
        const message = args.join(' ');
        if (message.includes('realtime=down') || message.includes('Polling boosted due to realtime=down')) {

          // Use async IIFE to handle dynamic import
          (async () => {
            try {
              const module = await import('@/integrations/supabase/reconnect/ReconnectScheduler');
              const { getReconnectScheduler } = module;

              const scheduler = getReconnectScheduler();

              scheduler.requestReconnect({
                source: 'ConsoleWarnInterceptor',
                reason: 'realtime=down detected in console output',
                priority: 'medium'
              });

            } catch (error) {
              handleError(error, { context: 'RealtimeInstrumentation', showToast: false });
            }
          })();
        }
        return originalConsoleWarn.apply(this, args as Parameters<typeof console.warn>);
      };
    }
  }
}
