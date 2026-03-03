import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GetTaskStatusEntrypoint from './index.ts';

describe('get-task-status edge entrypoint', () => {
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
    expect(GetTaskStatusEntrypoint).toBeDefined();
  });

  it('rejects unsupported HTTP methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/get-task-status', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });
});
