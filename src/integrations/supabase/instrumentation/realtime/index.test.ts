import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isCorruptionTraceEnabled: vi.fn(() => false),
  isRealtimeDownFixEnabled: vi.fn(() => false),
  captureRealtimeSnapshot: vi.fn(),
  normalizeAndLogError: vi.fn(),
  getCorruptionTimelineSnapshot: vi.fn(() => []),
  recordRealtimeCorruptionEvent: vi.fn(),
  reportRealtimeCorruption: vi.fn(),
  installRealtimeReferencePatchers: vi.fn(),
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  isCorruptionTraceEnabled: () => mocks.isCorruptionTraceEnabled(),
  isRealtimeDownFixEnabled: () => mocks.isRealtimeDownFixEnabled(),
}));

vi.mock('@/integrations/supabase/utils/snapshot', () => ({
  captureRealtimeSnapshot: (...args: unknown[]) => mocks.captureRealtimeSnapshot(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeErrorReporting', () => ({
  normalizeAndLogError: (...args: unknown[]) => mocks.normalizeAndLogError(...args),
}));

vi.mock('./diagnosticReporters', () => ({
  getCorruptionTimelineSnapshot: (...args: unknown[]) => mocks.getCorruptionTimelineSnapshot(...args),
  recordRealtimeCorruptionEvent: (...args: unknown[]) => mocks.recordRealtimeCorruptionEvent(...args),
  reportRealtimeCorruption: (...args: unknown[]) => mocks.reportRealtimeCorruption(...args),
}));

vi.mock('./referencePatchers', () => ({
  installRealtimeReferencePatchers: (...args: unknown[]) => mocks.installRealtimeReferencePatchers(...args),
}));

import { installRealtimeInstrumentation } from './index';

describe('installRealtimeInstrumentation', () => {
  const originalWindow = globalThis.window;

  beforeAll(() => {
    // The production code gates on `typeof window !== 'undefined'`.
    // Provide a minimal stub so the guard passes in Node.
    if (typeof globalThis.window === 'undefined') {
      (globalThis as Record<string, unknown>).window = {};
    }
  });

  afterAll(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCorruptionTraceEnabled.mockReturnValue(false);
    mocks.isRealtimeDownFixEnabled.mockReturnValue(false);
  });

  it('skips installation when realtime diagnostics are disabled', () => {
    installRealtimeInstrumentation({ realtime: {} } as never);

    expect(mocks.installRealtimeReferencePatchers).not.toHaveBeenCalled();
  });

  it('skips installation when the client has no realtime handle', () => {
    mocks.isRealtimeDownFixEnabled.mockReturnValue(true);

    installRealtimeInstrumentation({} as never);

    expect(mocks.installRealtimeReferencePatchers).not.toHaveBeenCalled();
  });

  it('installs realtime reference patchers with the shared reporters', () => {
    const realtime = { socket: null };
    mocks.isCorruptionTraceEnabled.mockReturnValue(true);

    installRealtimeInstrumentation({ realtime } as never);

    const installArgs = mocks.installRealtimeReferencePatchers.mock.calls[0]?.[0];
    expect(installArgs?.realtime).toBe(realtime);

    installArgs?.captureSnapshot('state');
    installArgs?.reportCorruption('broken', { socket: 'a' });
    installArgs?.recordEvent('SOCKET_SET_TO_NULL', { previous: 'a' });
    installArgs?.getTimelineSnapshot();

    expect(mocks.captureRealtimeSnapshot).toHaveBeenCalledWith('state');
    expect(mocks.reportRealtimeCorruption).toHaveBeenCalledWith('broken', { socket: 'a' });
    expect(mocks.recordRealtimeCorruptionEvent).toHaveBeenCalledWith('SOCKET_SET_TO_NULL', { previous: 'a' });
    expect(mocks.getCorruptionTimelineSnapshot).toHaveBeenCalled();
    expect(mocks.normalizeAndLogError).not.toHaveBeenCalled();
  });

  it('normalizes patcher installation failures with the realtime context', () => {
    mocks.isRealtimeDownFixEnabled.mockReturnValue(true);
    mocks.installRealtimeReferencePatchers.mockImplementation(() => {
      throw new Error('patch failure');
    });

    installRealtimeInstrumentation({ realtime: { socket: null } } as never);

    expect(mocks.normalizeAndLogError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        context: 'RealtimeInstrumentation',
      },
    );
  });
});
