// Corruption timeline ring buffer and helper
import { isCorruptionTraceEnabled } from '@/integrations/supabase/config/env';

export const __CORRUPTION_TIMELINE__: Array<{ event: string; timestamp: number; data: Record<string, unknown>; stack?: string }> = [];

export function addCorruptionEvent(event: string, data: Record<string, unknown> = {}) {
  if (isCorruptionTraceEnabled()) {
    __CORRUPTION_TIMELINE__.push({
      event,
      timestamp: Date.now(),
      data,
      stack: new Error().stack?.split('\n').slice(2, 5).join(' -> '),
    });
    if (__CORRUPTION_TIMELINE__.length > 100) {
      __CORRUPTION_TIMELINE__.shift();
    }
  }
}
