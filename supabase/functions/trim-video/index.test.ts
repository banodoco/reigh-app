import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as TrimVideoEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('trim-video edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(TrimVideoEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: { from: vi.fn(), storage: { from: vi.fn() } },
        logger: createLogger(),
        auth: { isServiceRole: false, userId: 'user-1' },
        body: {
          video_url: 'https://cdn.example.com/video.mp4',
          start_time: 0,
          end_time: 2,
          project_id: 'project-1',
          user_id: 'user-1',
          test_mode: true,
        },
      },
    });

    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => (key === 'REPLICATE_API_TOKEN' ? 'replicate-token' : undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles CORS preflight without bootstrapping', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/trim-video', { method: 'OPTIONS' }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('ok');
    expect(mocks.bootstrapEdgeHandler).not.toHaveBeenCalled();
  });

  it('validates required video_url field', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: { from: vi.fn(), storage: { from: vi.fn() } },
        logger: createLogger(),
        auth: { isServiceRole: false, userId: 'user-1' },
        body: {
          video_url: '',
          start_time: 0,
          end_time: 2,
          project_id: 'project-1',
          user_id: 'user-1',
        },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/trim-video', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'video_url is required',
      success: false,
    });
  });

  it('returns test-mode response after validation', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/trim-video', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      test_mode: true,
      message: 'Test mode - validation passed, no processing performed',
      input: {
        video_url: 'https://cdn.example.com/video.mp4',
        start_time: 0,
        end_time: 2,
        project_id: 'project-1',
        user_id: 'user-1',
      },
    });
  });
});
