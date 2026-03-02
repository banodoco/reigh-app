import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installRealtimeInstrumentation } from './index';

const {
  installReferencePatchersMock,
  normalizeAndPresentErrorMock,
} = vi.hoisted(() => ({
  installReferencePatchersMock: vi.fn(),
  normalizeAndPresentErrorMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  __CORRUPTION_TRACE_ENABLED__: true,
  __REALTIME_DOWN_FIX_ENABLED__: false,
}));

vi.mock('./referencePatchers', () => ({
  installRealtimeReferencePatchers: (input: unknown) => installReferencePatchersMock(input),
}));

vi.mock('./diagnosticReporters', () => ({
  getCorruptionTimelineSnapshot: () => [],
  recordRealtimeCorruptionEvent: vi.fn(),
  reportRealtimeCorruption: vi.fn(),
}));

vi.mock('@/integrations/supabase/utils/snapshot', () => ({
  captureRealtimeSnapshot: () => ({ socket: 'ok' }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: normalizeAndPresentErrorMock,
}));

describe('realtime instrumentation behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('installs realtime reference patchers when enabled and realtime exists', () => {
    const realtime = { socket: null };
    installRealtimeInstrumentation({ realtime } as never);

    expect(installReferencePatchersMock).toHaveBeenCalledTimes(1);
    expect(installReferencePatchersMock).toHaveBeenCalledWith(
      expect.objectContaining({ realtime }),
    );
  });

  it('reports patcher failures without throwing', () => {
    installReferencePatchersMock.mockImplementationOnce(() => {
      throw new Error('patch failed');
    });

    expect(() => installRealtimeInstrumentation({ realtime: { socket: null } } as never)).not.toThrow();
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'RealtimeInstrumentation',
        showToast: false,
      }),
    );
  });
});
