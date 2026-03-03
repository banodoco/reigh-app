import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as CompleteTaskEntrypoint from './index.ts';
import { completeTaskHandler } from './index.ts';

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

describe('complete_task edge entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    stubEdgeEnv();
  });

  it('imports entrypoint module directly', () => {
    expect(CompleteTaskEntrypoint).toBeDefined();
  });

  it('rejects unsupported GET requests', async () => {
    const response = await completeTaskHandler(
      new Request('https://edge.test/complete-task', { method: 'GET' }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
