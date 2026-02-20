import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as HuggingfaceUploadEntrypoint from './index.ts';

describe('huggingface-upload edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(HuggingfaceUploadEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
  });

  it('registers a handler and responds to CORS preflight', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/huggingface-upload', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects unsupported methods', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/huggingface-upload', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });
});
