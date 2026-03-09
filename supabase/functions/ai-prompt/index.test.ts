import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as AiPromptEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  checkRateLimit: vi.fn(),
  isRateLimitExceededFailure: vi.fn(),
  rateLimitFailureResponse: vi.fn(),
  buildGeneratePromptsMessages: vi.fn(),
  buildEditPromptMessages: vi.fn(),
  buildEnhanceSegmentUserPrompt: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
  groqChatCreate: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/rateLimit.ts', () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
  isRateLimitExceededFailure: (...args: unknown[]) => mocks.isRateLimitExceededFailure(...args),
  rateLimitFailureResponse: (...args: unknown[]) => mocks.rateLimitFailureResponse(...args),
  RATE_LIMITS: {
    expensive: { max: 10, windowMs: 60_000 },
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

vi.mock('./templates.ts', () => ({
  buildGeneratePromptsMessages: (...args: unknown[]) => mocks.buildGeneratePromptsMessages(...args),
  buildEditPromptMessages: (...args: unknown[]) => mocks.buildEditPromptMessages(...args),
  buildEnhanceSegmentUserPrompt: (...args: unknown[]) => mocks.buildEnhanceSegmentUserPrompt(...args),
  ENHANCE_SEGMENT_SYSTEM_PROMPT: 'enhance-system',
}));

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
        if (key === 'OPENAI_API_KEY') return 'openai-test-key';
        return undefined;
      },
    },
  });
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('ai-prompt edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(AiPromptEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    __resetServeHandler();
    stubDenoEnv();

    mocks.checkRateLimit.mockResolvedValue({ ok: true });
    mocks.isRateLimitExceededFailure.mockReturnValue(false);
    mocks.rateLimitFailureResponse.mockReturnValue(new Response('rate limited', { status: 429 }));

    mocks.buildGeneratePromptsMessages.mockReturnValue({
      systemMsg: 'system message',
      userMsg: 'user message',
    });
    mocks.buildEditPromptMessages.mockReturnValue({
      systemMsg: 'edit system',
      userMsg: 'edit user',
    });
    mocks.buildEnhanceSegmentUserPrompt.mockReturnValue('enhance user');

    mocks.groqChatCreate.mockResolvedValue({
      choices: [{ message: { content: 'first\nsecond\nthird' } }],
      usage: { total_tokens: 123 },
    });

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {},
        auth: { userId: 'user-1' },
        body: {
          task: 'generate_prompts',
          overallPromptText: 'main prompt',
          rulesToRememberText: '',
          numberToGenerate: 2,
          existingPrompts: [],
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
    const response = await handler(new Request('https://edge.test/ai-prompt', { method: 'POST' }));

    expect(response.status).toBe(418);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 401 when auth user is missing', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: {},
        auth: { userId: '' },
        body: { task: 'generate_prompts' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/ai-prompt', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication failed' });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it('returns 503 when rate limit service is unavailable', async () => {
    mocks.checkRateLimit.mockResolvedValue({ ok: false, reason: 'service-down' });
    mocks.isRateLimitExceededFailure.mockReturnValue(false);

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/ai-prompt', { method: 'POST' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Rate limit service unavailable' });
  });

  it('generates prompts and trims extra lines to requested count', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/ai-prompt', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      prompts: ['first', 'second'],
      usage: { total_tokens: 123 },
    });
    expect(mocks.groqChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'moonshotai/kimi-k2-instruct',
      }),
    );
  });
});
