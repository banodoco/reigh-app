import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as CalculateTaskCostEntrypoint from './index.ts';

describe('calculate-task-cost parsing contracts', () => {
  it('preserves validated known fields and extra unknown fields', () => {
    const parsed = CalculateTaskCostEntrypoint.__internal.parseTaskCostParams({
      resolution: '1280x720',
      frame_count: 32,
      model_type: 'i2v',
      result: { output_frames: 12 },
      custom_flag: true,
    });

    expect(parsed.resolution).toBe('1280x720');
    expect(parsed.frame_count).toBe(32);
    expect(parsed.model_type).toBe('i2v');
    expect(parsed.result).toEqual({ output_frames: 12 });
    expect(parsed.custom_flag).toBe(true);
  });

  it('drops malformed known billing keys instead of re-injecting raw values', () => {
    const parsed = CalculateTaskCostEntrypoint.__internal.parseTaskCostParams({
      resolution: 123,
      frame_count: '32',
      model_type: 999,
      result: 'not-an-object',
      passthrough: 'ok',
    });

    expect(parsed.resolution).toBeUndefined();
    expect(parsed.frame_count).toBeUndefined();
    expect(parsed.model_type).toBeUndefined();
    expect(parsed.result).toBeUndefined();
    expect(parsed.passthrough).toBe('ok');
  });
});

describe('calculate-task-cost edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(CalculateTaskCostEntrypoint).toBeDefined();
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers handler and handles preflight OPTIONS', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/calculate-task-cost', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"ok":true');
  });

  it('rejects unsupported HTTP methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/calculate-task-cost', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });
});
