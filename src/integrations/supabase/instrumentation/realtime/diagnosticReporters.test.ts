import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCorruptionTimelineSnapshot,
  recordRealtimeCorruptionEvent,
  reportRealtimeCorruption,
} from './diagnosticReporters';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
  addCorruptionEvent: vi.fn(),
  timeline: [] as Array<{ event: string; data: Record<string, unknown> }>,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/integrations/supabase/utils/timeline', () => ({
  __CORRUPTION_TIMELINE__: mocks.timeline,
  addCorruptionEvent: (...args: unknown[]) => mocks.addCorruptionEvent(...args),
}));

describe('diagnosticReporters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.timeline.length = 0;
  });

  it('normalizes realtime corruption reports with consistent context', () => {
    reportRealtimeCorruption('channel mismatch', { channel: 'project-1' });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        context: 'RealtimeInstrumentation',
        showToast: false,
        logData: { channel: 'project-1' },
      },
    );
  });

  it('records corruption events and returns a defensive timeline snapshot', () => {
    recordRealtimeCorruptionEvent('sequence-gap', { expected: 3, actual: 5 });
    expect(mocks.addCorruptionEvent).toHaveBeenCalledWith('sequence-gap', { expected: 3, actual: 5 });

    mocks.timeline.push({ event: 'event-1', data: { ok: true } });
    const snapshot = getCorruptionTimelineSnapshot();
    expect(snapshot).toEqual([{ event: 'event-1', data: { ok: true } }]);
    expect(snapshot).not.toBe(mocks.timeline);
  });
});
