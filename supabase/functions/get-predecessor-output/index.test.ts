import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import { __resetCreateClientImpl, __setCreateClientImpl } from '../_tests/mocks/supabaseClient.ts';

const {
  authenticateRequestMock,
  loggerWarnMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerCriticalMock,
  loggerFlushMock,
  loggerSetTaskIdMock,
  loggerDebugMock,
} = vi.hoisted(() => ({
  authenticateRequestMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerCriticalMock: vi.fn(),
  loggerFlushMock: vi.fn().mockResolvedValue(undefined),
  loggerSetTaskIdMock: vi.fn(),
  loggerDebugMock: vi.fn(),
}));

vi.mock('../_shared/auth.ts', () => ({
  authenticateRequest: authenticateRequestMock,
}));

vi.mock('../_shared/systemLogger.ts', () => ({
  SystemLogger: class {
    warn = loggerWarnMock;
    error = loggerErrorMock;
    info = loggerInfoMock;
    critical = loggerCriticalMock;
    flush = loggerFlushMock;
    setDefaultTaskId = loggerSetTaskIdMock;
    debug = loggerDebugMock;
  },
}));

describe('get-predecessor-output edge entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    __resetServeHandler();
    __resetCreateClientImpl();
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
          if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
          return undefined;
        },
      },
    });
    __setCreateClientImpl(() => ({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers a handler and rejects non-POST methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(new Request('https://edge.test/get-predecessor-output', { method: 'GET' }));

    expect(response.status).toBe(405);
    expect(loggerWarnMock).toHaveBeenCalled();
    expect(loggerFlushMock).toHaveBeenCalled();
  });

  it('requires task_id in JSON body', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/get-predecessor-output', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('task_id is required');
  });
});
