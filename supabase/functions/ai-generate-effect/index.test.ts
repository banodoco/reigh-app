import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as AiGenerateEffectEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  enforceRateLimit: vi.fn(),
  buildGenerateEffectMessages: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
  groqChatCreate: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/rateLimit.ts', () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
  RATE_LIMITS: {
    expensive: { maxRequests: 10, windowSeconds: 60 },
  },
}));

vi.mock('../_shared/http.ts', () => ({
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (...args: unknown[]) => mocks.toErrorMessage(...args),
}));

vi.mock('./templates.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./templates.ts')>();
  return {
    ...actual,
    buildGenerateEffectMessages: (...args: unknown[]) => mocks.buildGenerateEffectMessages(...args),
  };
});

vi.mock('npm:groq-sdk@0.26.0', () => ({
  default: class GroqMock {
    chat = {
      completions: {
        create: (payload: unknown) => mocks.groqChatCreate(payload),
      },
    };

    constructor(_options?: unknown) {}
  },
}));

function stubDenoEnv(): void {
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) => {
        if (key === 'GROQ_API_KEY') return 'groq-test-key';
        return undefined;
      },
    },
  });
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('ai-generate-effect edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(AiGenerateEffectEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    __resetServeHandler();
    stubDenoEnv();

    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.buildGenerateEffectMessages.mockReturnValue({
      systemMsg: 'system message',
      userMsg: 'user message',
    });
    mocks.groqChatCreate.mockResolvedValue({
      model: 'moonshotai/kimi-k2-instruct-0905',
      choices: [{
        message: {
          content: '```ts\nfunction Example(props){ return React.createElement(AbsoluteFill, null, props.children); }\nexports.default = Example;\n```',
        },
      }],
    });
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {},
        logger: { info: vi.fn() },
        auth: { userId: 'user-1' },
        body: {
          prompt: 'Slide the clip in from the left',
          category: 'entrance',
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns bootstrap failure response untouched', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 418 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/ai-generate-effect', { method: 'POST' }));

    expect(response.status).toBe(418);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 401 when auth user is missing', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {},
        logger: { info: vi.fn() },
        auth: { userId: '' },
        body: { prompt: 'Generate an effect', category: 'entrance' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/ai-generate-effect', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication failed' });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it('returns 503 when rate limit service is unavailable', async () => {
    mocks.enforceRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Rate limit service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/ai-generate-effect', { method: 'POST' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Rate limit service unavailable' });
  });

  it('generates an effect and returns cleaned code without markdown fences', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/ai-generate-effect', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: 'function Example(props){ return React.createElement(AbsoluteFill, null, props.children); }\nexports.default = Example;',
      model: 'moonshotai/kimi-k2-instruct-0905',
    });
    expect(mocks.groqChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'moonshotai/kimi-k2-instruct-0905',
      }),
    );
    expect(mocks.buildGenerateEffectMessages).toHaveBeenCalledWith({
      prompt: 'Slide the clip in from the left',
      category: 'entrance',
      existingCode: undefined,
    });
  });

  it('returns 400 for an invalid category before calling Groq', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {},
        logger: { info: vi.fn() },
        auth: { userId: 'user-1' },
        body: { prompt: 'Generate an effect', category: 'spin-up' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/ai-generate-effect', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'category must be one of: entrance, exit, continuous',
    });
    expect(mocks.groqChatCreate).not.toHaveBeenCalled();
  });
});
