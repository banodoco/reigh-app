import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as UpdateShotPairPromptsEntrypoint from './index.ts';

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

describe('update-shot-pair-prompts edge entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
    stubEdgeEnv();
  });

  it('imports entrypoint module directly', () => {
    expect(UpdateShotPairPromptsEntrypoint).toBeDefined();
  });

  it('rejects unsupported GET requests', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();
    const response = await handler(
      new Request('https://edge.test/update-shot-pair-prompts', { method: 'GET' }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
