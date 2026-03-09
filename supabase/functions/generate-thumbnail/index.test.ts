import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GenerateThumbnailEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
  fetchMock: vi.fn(),
  createImageBitmapMock: vi.fn(),
  drawImageMock: vi.fn(),
  convertToBlobMock: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (...args: unknown[]) => mocks.toErrorMessage(...args),
}));

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createSupabase() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });

  const upload = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/thumb.jpg' } });
  const storageFrom = vi.fn().mockReturnValue({ upload, getPublicUrl });

  const from = vi.fn().mockReturnValue({ update });

  return {
    from,
    update,
    eq,
    storage: {
      from: storageFrom,
    },
    upload,
    getPublicUrl,
    storageFrom,
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('generate-thumbnail edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(GenerateThumbnailEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    class OffscreenCanvasMock {
      getContext = vi.fn().mockReturnValue({
        drawImage: mocks.drawImageMock,
      });

      convertToBlob = mocks.convertToBlobMock;

      constructor(_width: number, _height: number) {}
    }

    mocks.convertToBlobMock.mockResolvedValue(new Blob(['thumb-data'], { type: 'image/jpeg' }));
    mocks.createImageBitmapMock.mockResolvedValue({ width: 900, height: 600 });
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    vi.stubGlobal('fetch', mocks.fetchMock);
    vi.stubGlobal('createImageBitmap', mocks.createImageBitmapMock);
    vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock);

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabase(),
        logger: createLogger(),
        body: {
          generation_id: 'gen-1',
          main_image_url: 'https://cdn.example.com/main.jpg',
          user_id: 'user-1',
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles CORS preflight without bootstrapping', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/generate-thumbnail', { method: 'OPTIONS' }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('ok');
    expect(mocks.bootstrapEdgeHandler).not.toHaveBeenCalled();
  });

  it('returns 400 when required body fields are missing', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabase(),
        logger: createLogger(),
        body: { generation_id: '', main_image_url: '', user_id: '' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/generate-thumbnail', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain('Missing required fields');
  });

  it('generates and stores thumbnail successfully', async () => {
    const supabase = createSupabase();
    const logger = createLogger();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: supabase,
        logger,
        body: {
          generation_id: 'gen-1',
          main_image_url: 'https://cdn.example.com/main.jpg',
          user_id: 'user-1',
        },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/generate-thumbnail', { method: 'POST' }));

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload).toEqual(
      expect.objectContaining({
        success: true,
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        originalSize: '900x600',
        thumbnailSize: '300x200',
      }),
    );

    expect(mocks.fetchMock).toHaveBeenCalledWith('https://cdn.example.com/main.jpg');
    expect(mocks.createImageBitmapMock).toHaveBeenCalled();
    expect(mocks.drawImageMock).toHaveBeenCalled();
    expect(supabase.storageFrom).toHaveBeenCalled();
    expect(supabase.upload).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith('generations');
    expect(logger.flush).toHaveBeenCalled();
  });
});
