import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GetTaskOutputEntrypoint from './index.ts';

describe('get-task-output edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(GetTaskOutputEntrypoint).toBeDefined();
  });

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

  it('rejects unsupported HTTP methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/get-task-output', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });

  it('requires task_id in request body', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/get-task-output', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('authentication_failed');
  });
});
