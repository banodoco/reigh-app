import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as DiscordDailyStatsEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (...args: unknown[]) => mocks.toErrorMessage(...args),
}));

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    debug: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createSupabaseAdmin(rows: unknown[] = []) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    from: vi.fn(),
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('discord-daily-stats edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(DiscordDailyStatsEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();
    vi.stubGlobal('fetch', vi.fn());

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin([]),
        logger: createLogger(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns bootstrap failure response untouched', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => (key === 'DISCORD_STATS_WEBHOOK_URL' ? 'https://discord.test/webhook' : undefined),
      },
    });

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 401 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/discord-daily-stats', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 500 when webhook env var is missing', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: () => undefined,
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/discord-daily-stats', { method: 'POST' }));

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toContain('DISCORD_STATS_WEBHOOK_URL not configured');
  });

  it('returns no-data response when stats are empty', async () => {
    const logger = createLogger();
    const supabaseAdmin = createSupabaseAdmin([]);

    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => (key === 'DISCORD_STATS_WEBHOOK_URL' ? 'https://discord.test/webhook' : undefined),
      },
    });

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/discord-daily-stats', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'No data' });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('func_daily_task_stats');
    expect(logger.flush).toHaveBeenCalled();
  });
});
