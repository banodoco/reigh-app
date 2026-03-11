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

  it('parses legacy upload payloads through the extracted request helper', async () => {
    const formData = new FormData();
    formData.set('loraStoragePath', 'user-1/uploads/model.safetensors');
    formData.set('loraDetails', JSON.stringify({
      name: 'Test LoRA',
      baseModel: 'wan',
    }));
    formData.set('repoName', 'custom-repo');
    formData.set('isPrivate', 'true');

    const result = await HuggingfaceUploadEntrypoint.__internal.parseUploadRequest(
      new Request('https://edge.test/huggingface-upload', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        storagePaths: { single: 'user-1/uploads/model.safetensors' },
        repoNameOverride: 'custom-repo',
        isPrivate: true,
        loraDetails: {
          name: 'Test LoRA',
          baseModel: 'wan',
        },
      });
    }
  });

  it('rejects malformed loraStoragePaths JSON before touching storage or secrets', async () => {
    const formData = new FormData();
    formData.set('loraStoragePaths', '{bad-json');
    formData.set('loraDetails', JSON.stringify({
      name: 'Test LoRA',
      baseModel: 'wan',
    }));

    const result = await HuggingfaceUploadEntrypoint.__internal.parseUploadRequest(
      new Request('https://edge.test/huggingface-upload', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        error: 'loraStoragePaths must be valid JSON',
      });
    }
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

  it('returns repo and asset URLs from the extracted upload workflow', async () => {
    vi.resetModules();
    __resetServeHandler();

    const huggingFaceHub = await import('../_tests/mocks/huggingfaceHub.ts');
    const createRepoSpy = vi.spyOn(huggingFaceHub, 'createRepo');
    const uploadFileSpy = vi.spyOn(huggingFaceHub, 'uploadFile');

    const download = vi.fn(async (path: string) => ({
      data: path.endsWith('.mp4')
        ? new Blob(['video'], { type: 'video/mp4' })
        : new Blob(['weights'], { type: 'application/octet-stream' }),
      error: null,
    }));
    const remove = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn().mockReturnValue({
      download,
      remove,
    });
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {
          rpc: vi.fn().mockResolvedValue({
            data: [{ key_value: 'hf-token' }],
            error: null,
          }),
          storage: {
            from: storageFrom,
          },
        },
        logger,
        auth: { userId: 'user-1' },
      },
    });

    await import('./index.ts');
    const handler = __getServeHandler();

    const formData = new FormData();
    formData.set('loraStoragePath', 'user-1/uploads/uuid-fancy-model.safetensors');
    formData.set('loraDetails', JSON.stringify({
      name: 'Fancy Model',
      baseModel: 'wan',
    }));
    formData.set('repoName', 'custom-repo');
    formData.set('sampleVideos', JSON.stringify([
      {
        storagePath: 'user-1/uploads/preview.mp4',
        originalFileName: 'preview.mp4',
      },
    ]));

    const response = await handler(
      new Request('https://edge.test/huggingface-upload', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      repoId: 'test-user/custom-repo',
      repoUrl: 'https://huggingface.co/test-user/custom-repo',
      loraUrl: 'https://huggingface.co/test-user/custom-repo/resolve/main/fancy-model.safetensors',
      videoUrls: [
        'https://huggingface.co/test-user/custom-repo/resolve/main/media%2Fpreview.mp4',
      ],
    });
    expect(createRepoSpy).toHaveBeenCalledWith({
      repo: 'test-user/custom-repo',
      private: false,
      credentials: { accessToken: 'hf-token' },
    });
    expect(uploadFileSpy).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledWith([
      'user-1/uploads/uuid-fancy-model.safetensors',
      'user-1/uploads/preview.mp4',
    ]);
    expect(storageFrom).toHaveBeenCalledWith('temporary');
    expect(logger.flush).toHaveBeenCalled();
  });
});
