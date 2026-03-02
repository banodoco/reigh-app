import { __CORRUPTION_TRACE_ENABLED__, __REALTIME_DOWN_FIX_ENABLED__ } from '@/integrations/supabase/config/env';
import { captureRealtimeSnapshot } from '@/integrations/supabase/utils/snapshot';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCorruptionTimelineSnapshot,
  recordRealtimeCorruptionEvent,
  reportRealtimeCorruption,
} from './diagnosticReporters';
import { installRealtimeReferencePatchers } from './referencePatchers';

interface RealtimeClientWithInstrumentation {
  socket: WebSocket | null;
  conn?: { transport?: { ws?: WebSocket | null } };
  __REFERENCE_TRACKING_INSTALLED__?: boolean;
}

export function installRealtimeInstrumentation(supabase: SupabaseClient) {
  if (!__CORRUPTION_TRACE_ENABLED__ && !__REALTIME_DOWN_FIX_ENABLED__) {
    return;
  }

  if (typeof window === 'undefined' || !supabase?.realtime) {
    return;
  }

  const realtime = supabase.realtime as unknown as RealtimeClientWithInstrumentation;

  try {
    installRealtimeReferencePatchers({
      realtime,
      captureSnapshot: captureRealtimeSnapshot,
      reportCorruption: reportRealtimeCorruption,
      recordEvent: recordRealtimeCorruptionEvent,
      getTimelineSnapshot: getCorruptionTimelineSnapshot,
    });
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'RealtimeInstrumentation',
      showToast: false,
    });
  }

  // Reconnect requests are emitted from explicit realtime failure paths
  // (RealtimeConnection / auth lifecycle) rather than global console interception.
}
