import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as BroadcastRealtimeEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  withEdgeRequest: vi.fn(),
  send: vi.fn(),
  channel: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  withEdgeRequest: (...args: unknown[]) => mocks.withEdgeRequest(...args),
}));

vi.mock('../_shared/http.ts', () => ({
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

function createContext(body: Record<string, unknown>) {
  return {
    supabaseAdmin: {
      channel: mocks.channel,
    },
    logger: {
      info: mocks.loggerInfo,
      error: mocks.loggerError,
    },
    body,
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('broadcast-realtime edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(BroadcastRealtimeEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.channel.mockReturnValue({
      send: mocks.send,
    });

    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(
          createContext({
            channel: 'project-updates',
            event: 'task-complete',
            payload: { id: 'task-1' },
          }),
        );
      },
    );
  });

  it('returns 400 when required fields are missing', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({ channel: '', event: '', payload: null }));
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/broadcast-realtime', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing required fields: channel, event, payload',
    });
  });

  it('returns success when broadcast returns ok', async () => {
    mocks.send.mockResolvedValue('ok');

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/broadcast-realtime', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.channel).toHaveBeenCalledWith('project-updates');
    expect(mocks.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'task-complete',
      payload: { id: 'task-1' },
    });
    expect(mocks.loggerInfo).toHaveBeenCalled();
  });

  it('returns 500 when broadcast send fails', async () => {
    mocks.send.mockResolvedValue('timed out');

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/broadcast-realtime', { method: 'POST' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Broadcast failed',
      result: 'timed out',
    });
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});
