import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as TriggerAutoTopupEntrypoint from './index.ts';

describe('trigger-auto-topup edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(TriggerAutoTopupEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
  });

  it('registers handler and handles preflight OPTIONS', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/trigger-auto-topup', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"ok":true');
  });

  it('rejects unsupported HTTP methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/trigger-auto-topup', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });
});
