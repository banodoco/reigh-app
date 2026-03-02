import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

export function reportRealtimeCorruption(message: string, logData: Record<string, unknown>) {
  normalizeAndPresentError(new Error(message), {
    context: 'RealtimeInstrumentation',
    showToast: false,
    logData,
  });
}

export function recordRealtimeCorruptionEvent(event: string, data: Record<string, unknown>) {
  addCorruptionEvent(event, data);
}

export function getCorruptionTimelineSnapshot() {
  return [...__CORRUPTION_TIMELINE__];
}
