import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as DeleteProjectEntrypoint from './index.ts';

describe('delete-project edge entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
          if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
          return undefined;
        },
      },
    });
  });

  it('imports entrypoint module directly', () => {
    expect(DeleteProjectEntrypoint).toBeDefined();
  });

  it('handles CORS preflight OPTIONS requests', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/delete-project', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });
});
