import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';

describe('broadcast-realtime edge entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
          return undefined;
        },
      },
    });
  });

  it('imports entrypoint module directly', async () => {
    const entrypointModule = await import('./index.ts');
    expect(entrypointModule).toBeDefined();
  });

  it('rejects unsupported HTTP methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/broadcast-realtime', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });
});
