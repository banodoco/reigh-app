import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';
import { normalizeAndLogError } from '@/shared/lib/errorHandling/runtimeErrorReporting';

export function reportRealtimeCorruption(message: string, logData: Record<string, unknown>) {
  normalizeAndLogError(new Error(message), {
    context: 'RealtimeInstrumentation',
        logData,
  });
}

export function recordRealtimeCorruptionEvent(event: string, data: Record<string, unknown>) {
  addCorruptionEvent(event, data);
}

export function getCorruptionTimelineSnapshot() {
  return [...__CORRUPTION_TIMELINE__];
}
