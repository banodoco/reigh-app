import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as TrimVideoEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  withEdgeRequest: vi.fn(),
  verifyProjectOwnership: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  withEdgeRequest: (...args: unknown[]) => mocks.withEdgeRequest(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/auth.ts', () => ({
  verifyProjectOwnership: (...args: unknown[]) => mocks.verifyProjectOwnership(...args),
}));

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

function createContext(overrides?: {
  supabaseAdmin?: { from: ReturnType<typeof vi.fn>; storage: { from: ReturnType<typeof vi.fn> } };
  logger?: ReturnType<typeof createLogger>;
  auth?: { isServiceRole?: boolean; userId?: string | null };
  body?: Record<string, unknown>;
}) {
  return {
    supabaseAdmin: overrides?.supabaseAdmin ?? { from: vi.fn(), storage: { from: vi.fn() } },
    logger: overrides?.logger ?? createLogger(),
    auth: overrides?.auth ?? { isServiceRole: false, userId: 'user-1' },
    body: overrides?.body ?? {
      video_url: 'https://cdn.example.com/video.mp4',
      start_time: 0,
      end_time: 2,
      project_id: 'project-1',
      user_id: 'user-should-be-ignored',
      test_mode: true,
    },
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

    mocks.verifyProjectOwnership.mockResolvedValue({ success: true, projectId: 'project-1' });
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext());
      },
    );

    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => (key === 'REPLICATE_API_TOKEN' ? 'replicate-token' : undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the shared lifecycle response untouched', async () => {
    mocks.withEdgeRequest.mockResolvedValue(new Response('preflight', { status: 200 }));

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/trim-video', { method: 'OPTIONS' }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('preflight');
  });

  it('validates required video_url field', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(
          createContext({
            body: {
              video_url: '',
              start_time: 0,
              end_time: 2,
              project_id: 'project-1',
              user_id: 'user-1',
            },
          }),
        );
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/trim-video', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'video_url is required',
      success: false,
    });
  });

  it('returns 403 when project ownership verification fails', async () => {
    mocks.verifyProjectOwnership.mockResolvedValue({
      success: false,
      error: 'Forbidden: Project does not belong to user',
      statusCode: 403,
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/trim-video', { method: 'POST' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden: Project does not belong to user',
      success: false,
    });
  });

  it('returns test-mode response using the authenticated user id', async () => {
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

  it('requires service-role callers to provide user_id explicitly', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(
          createContext({
            auth: { isServiceRole: true, userId: null },
            body: {
              video_url: 'https://cdn.example.com/video.mp4',
              start_time: 0,
              end_time: 2,
              project_id: 'project-1',
              test_mode: true,
            },
          }),
        );
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/trim-video', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'user_id is required',
      success: false,
    });
  });
});
