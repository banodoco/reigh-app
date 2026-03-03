import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GrantCreditsEntrypoint from './index.ts';

function stubEdgeEnv() {
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) => {
        if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
        return undefined;
      },
    },
  });
}

describe('grant-credits edge entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
    stubEdgeEnv();
  });

  it('imports entrypoint module directly', () => {
    expect(GrantCreditsEntrypoint).toBeDefined();
  });

  it('handles CORS preflight OPTIONS requests', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();
    const response = await handler(
      new Request('https://edge.test/grant-credits', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('rejects unsupported GET requests', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();
    const response = await handler(
      new Request('https://edge.test/grant-credits', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
  });
});
