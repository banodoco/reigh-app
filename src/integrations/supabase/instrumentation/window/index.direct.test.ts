import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installWindowOnlyInstrumentation } from './index';

const {
  installGlobalErrorPatchersMock,
  installWebSocketProbeMock,
  addCorruptionEventMock,
  parsePhoenixMessageMock,
  normalizeAndPresentErrorMock,
} = vi.hoisted(() => ({
  installGlobalErrorPatchersMock: vi.fn(),
  installWebSocketProbeMock: vi.fn(),
  addCorruptionEventMock: vi.fn(),
  parsePhoenixMessageMock: vi.fn(),
  normalizeAndPresentErrorMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  __WS_INSTRUMENTATION_ENABLED__: true,
  __CORRUPTION_TRACE_ENABLED__: true,
}));

vi.mock('./globalPatchers', () => ({
  installGlobalErrorPatchers: (input: unknown) => installGlobalErrorPatchersMock(input),
  installWebSocketProbe: (input: unknown) => installWebSocketProbeMock(input),
}));

vi.mock('./eventCollectors', () => ({
  collectUnhandledRejectionInfo: vi.fn(() => ({ reason: 'err' })),
  collectWindowErrorInfo: vi.fn(() => ({ msg: 'window-error' })),
  isKnownSupabaseSourceLine: vi.fn(() => true),
  isSupabaseRealtimeRelated: vi.fn(() => true),
  parsePhoenixMessage: (payload: unknown) => parsePhoenixMessageMock(payload),
}));

vi.mock('@/integrations/supabase/utils/timeline', () => ({
  __CORRUPTION_TIMELINE__: [],
  addCorruptionEvent: (event: string, data: unknown) => addCorruptionEventMock(event, data),
}));

vi.mock('@/integrations/supabase/utils/snapshot', () => ({
  captureRealtimeSnapshot: () => ({ snapshot: true }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: normalizeAndPresentErrorMock,
}));

describe('window instrumentation behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parsePhoenixMessageMock.mockReturnValue({ event: 'phx_reply' });
    delete (window as Window & { __REALTIME_SNAPSHOT__?: Record<string, unknown> }).__REALTIME_SNAPSHOT__;
  });

  it('installs global error and websocket patchers when enabled', () => {
    installWindowOnlyInstrumentation();
    expect(installGlobalErrorPatchersMock).toHaveBeenCalledTimes(1);
    expect(installWebSocketProbeMock).toHaveBeenCalledTimes(1);
  });

  it('captures phoenix message events and updates realtime snapshot timestamp', () => {
    installWebSocketProbeMock.mockImplementation(({ onTrackedSocketMessage }) => {
      onTrackedSocketMessage({
        wsId: 1,
        url: 'wss://example.supabase.co/realtime',
        event: { data: '{"event":"phx_reply"}' },
      });
    });

    installWindowOnlyInstrumentation();

    expect(addCorruptionEventMock).toHaveBeenCalledWith(
      'PHOENIX_MESSAGE',
      expect.objectContaining({ event: 'phx_reply' }),
    );
    expect(window.__REALTIME_SNAPSHOT__).toEqual(
      expect.objectContaining({
        lastPhoenixMsgAt: expect.any(Number),
      }),
    );
  });

  it('records known supabase window errors with diagnostics', () => {
    installWindowOnlyInstrumentation();
    const installArgs = installGlobalErrorPatchersMock.mock.calls[0][0];
    installArgs.onWindowError(
      'socket failed',
      'https://cdn.example.com/supabase-js.js',
      2372,
      10,
      new Error('boom'),
    );

    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'WindowInstrumentation',
        showToast: false,
      }),
    );
    expect(addCorruptionEventMock).toHaveBeenCalledWith(
      'SUPABASE_ERROR_2372',
      expect.any(Object),
    );
  });

  it('swallows websocket parse failures so realtime flow is unaffected', () => {
    parsePhoenixMessageMock.mockImplementationOnce(() => {
      throw new Error('bad payload');
    });
    installWebSocketProbeMock.mockImplementation(({ onTrackedSocketMessage }) => {
      onTrackedSocketMessage({
        wsId: 1,
        url: 'wss://example.supabase.co/realtime',
        event: { data: '{bad-json' },
      });
    });

    expect(() => installWindowOnlyInstrumentation()).not.toThrow();
  });
});
