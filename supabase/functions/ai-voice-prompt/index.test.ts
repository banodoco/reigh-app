import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';

function stubEdgeEnv() {
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) => {
        if (key === 'GROQ_API_KEY') return 'groq-key';
        if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
        return undefined;
      },
    },
  });
}

describe('ai-voice-prompt edge entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
    stubEdgeEnv();
  });

  it('imports entrypoint module directly', async () => {
    const entrypointModule = await import('./index.ts');
    expect(entrypointModule).toBeDefined();
  });

  it('handles CORS preflight OPTIONS requests', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/ai-voice-prompt', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(200);
  });

  it('rejects unsupported HTTP methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/ai-voice-prompt', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });
});
