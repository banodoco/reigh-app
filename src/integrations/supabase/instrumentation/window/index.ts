import { __WS_INSTRUMENTATION_ENABLED__, __CORRUPTION_TRACE_ENABLED__ } from '@/integrations/supabase/config/env';
import { captureRealtimeSnapshot } from '@/integrations/supabase/utils/snapshot';
import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  collectUnhandledRejectionInfo,
  collectWindowErrorInfo,
  isKnownSupabaseSourceLine,
  isSupabaseRealtimeRelated,
  parsePhoenixMessage,
} from './eventCollectors';
import {
  installGlobalErrorPatchers,
  installWebSocketProbe,
  type InstrumentedWindow,
} from './globalPatchers';

function installCorruptionTracePatchers(instrumentedWindow: InstrumentedWindow): void {
  installGlobalErrorPatchers({
    instrumentedWindow,
    onWindowError: (message, source, lineno, colno, error) => {
      const errorInfo = collectWindowErrorInfo({
        message,
        source,
        lineno,
        colno,
        error: error ?? null,
      });

      if (isKnownSupabaseSourceLine(source, lineno)) {
        normalizeAndPresentError(new Error('[RealtimeCorruptionTrace] Supabase error captured'), {
          context: 'WindowInstrumentation',
          showToast: false,
          logData: {
            ...errorInfo,
            realtimeSnapshot: captureRealtimeSnapshot(),
            corruptionTimeline: [...__CORRUPTION_TIMELINE__],
          },
        });
        addCorruptionEvent('SUPABASE_ERROR_2372', errorInfo);
      } else if (isSupabaseRealtimeRelated(message)) {
        addCorruptionEvent('RELATED_ERROR', errorInfo);
      }
    },
    onUnhandledRejection: (event) => {
      const rejectionInfo = collectUnhandledRejectionInfo(event);
      if (isSupabaseRealtimeRelated(event.reason)) {
        addCorruptionEvent('UNHANDLED_REJECTION', rejectionInfo);
      }
    },
  });
}

function installWebSocketInstrumentation(instrumentedWindow: InstrumentedWindow): void {
  installWebSocketProbe({
    instrumentedWindow,
    onTrackedSocketMessage: ({ event }) => {
      try {
        const parsed = parsePhoenixMessage(event.data);
        if (parsed) {
          addCorruptionEvent('PHOENIX_MESSAGE', parsed);
        }

        const snapshot = instrumentedWindow.__REALTIME_SNAPSHOT__ || {};
        instrumentedWindow.__REALTIME_SNAPSHOT__ = {
          ...snapshot,
          lastPhoenixMsgAt: Date.now(),
        };
      } catch {
        // Ignore instrumentation parse failures so realtime flow remains unaffected.
      }
    },
  });
}

export function installWindowOnlyInstrumentation() {
  if (typeof window === 'undefined') {
    return;
  }

  const instrumentedWindow = window as InstrumentedWindow;

  if (__CORRUPTION_TRACE_ENABLED__) {
    installCorruptionTracePatchers(instrumentedWindow);
  }

  if (__WS_INSTRUMENTATION_ENABLED__) {
    installWebSocketInstrumentation(instrumentedWindow);
  }
}
