import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as ProcessAutoTopupEntrypoint from './index.ts';

function stubEdgeEnv() {
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) => {
        if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_xxx';
        if (key === 'FRONTEND_URL') return 'https://example.com';
        return undefined;
      },
    },
  });
}

describe('process-auto-topup edge entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
    stubEdgeEnv();
  });

  it('imports entrypoint module directly', () => {
    expect(ProcessAutoTopupEntrypoint).toBeDefined();
  });

  it('rejects unsupported GET requests', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/process-auto-topup', { method: 'GET' }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
