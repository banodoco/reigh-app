import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as HuggingfaceUploadEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

describe('huggingface-upload edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(HuggingfaceUploadEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {
          rpc: vi.fn().mockResolvedValue({
            data: [{ key_value: 'hf-token' }],
            error: null,
          }),
          storage: {
            from: vi.fn().mockReturnValue({
              download: vi.fn(),
              remove: vi.fn(),
            }),
          },
        },
        logger: {
          info: vi.fn(),
          error: vi.fn(),
          flush: vi.fn().mockResolvedValue(undefined),
        },
        auth: { userId: 'user-1' },
      },
    });
  });

  it('registers a handler and responds to CORS preflight', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/huggingface-upload', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects unsupported methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/huggingface-upload', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });

  it('rejects LoRA paths that do not belong to the authenticated user before reading secrets', async () => {
    const rpc = vi.fn();
    const download = vi.fn();
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {
          rpc,
          storage: {
            from: vi.fn().mockReturnValue({
              download,
              remove: vi.fn(),
            }),
          },
        },
        logger,
        auth: { userId: 'user-1' },
      },
    });

    await import('./index.ts');
    const handler = __getServeHandler();
    const formData = new FormData();
    formData.set('loraStoragePath', 'user-2/uploads/not-owned.safetensors');
    formData.set('loraDetails', JSON.stringify({
      name: 'Test LoRA',
      baseModel: 'wan',
    }));

    const response = await handler(
      new Request('https://edge.test/huggingface-upload', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden: storage path does not belong to authenticated user',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(logger.flush).toHaveBeenCalled();
  });

  it('rejects sample video paths that do not belong to the authenticated user', async () => {
    const rpc = vi.fn();
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {
          rpc,
          storage: {
            from: vi.fn().mockReturnValue({
              download: vi.fn(),
              remove: vi.fn(),
            }),
          },
        },
        logger,
        auth: { userId: 'user-1' },
      },
    });

    await import('./index.ts');
    const handler = __getServeHandler();
    const formData = new FormData();
    formData.set('loraStoragePath', 'user-1/uploads/owned.safetensors');
    formData.set('loraDetails', JSON.stringify({
      name: 'Test LoRA',
      baseModel: 'wan',
    }));
    formData.set('sampleVideos', JSON.stringify([
      {
        storagePath: 'user-2/uploads/not-owned.mp4',
        originalFileName: 'preview.mp4',
      },
    ]));

    const response = await handler(
      new Request('https://edge.test/huggingface-upload', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden: storage path does not belong to authenticated user',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(logger.flush).toHaveBeenCalled();
  });
});
