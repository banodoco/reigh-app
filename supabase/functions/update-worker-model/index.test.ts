import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as UpdateWorkerModelEntrypoint from './index.ts';

const {
  authenticateRequestMock,
  loggerWarnMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerCriticalMock,
  loggerFlushMock,
} = vi.hoisted(() => ({
  authenticateRequestMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerCriticalMock: vi.fn(),
  loggerFlushMock: vi.fn().mockResolvedValue(undefined),
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
  },
}));

describe('update-worker-model edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(UpdateWorkerModelEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    __resetServeHandler();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails fast when required environment variables are missing', async () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });

    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/update-worker-model', { method: 'POST' }),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toContain('Server configuration error');
  });

  it('rejects unsupported HTTP methods', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
          if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
          return undefined;
        },
      },
    });

    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/update-worker-model', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
    expect(loggerWarnMock).toHaveBeenCalled();
    expect(loggerFlushMock).toHaveBeenCalled();
  });
});
