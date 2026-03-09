import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as TaskCountsEntrypoint from './index.ts';

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
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createServiceRoleSupabase() {
  const queuedLimit = vi.fn().mockResolvedValue({ data: [], error: null });
  const queuedOrder = vi.fn().mockReturnValue({ limit: queuedLimit });
  const queuedEq = vi.fn().mockReturnValue({ order: queuedOrder });

  const activeLimit = vi.fn().mockResolvedValue({ data: [], error: null });
  const activeOrder = vi.fn().mockReturnValue({ limit: activeLimit });
  const activeNot = vi.fn().mockReturnValue({ order: activeOrder });
  const activeEq = vi.fn().mockReturnValue({ not: activeNot });

  let tasksSelectCount = 0;
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'tasks') {
      return {
        select: vi.fn().mockImplementation(() => {
          tasksSelectCount += 1;
          if (tasksSelectCount === 1) {
            return { eq: queuedEq };
          }
          return { eq: activeEq };
        }),
      };
    }

    return { select: vi.fn() };
  });

  const rpc = vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === 'count_eligible_tasks_service_role') {
      if (args.p_include_active === false) {
        return Promise.resolve({ data: 3, error: null });
      }
      return Promise.resolve({ data: 5, error: null });
    }

    if (fn === 'count_queued_tasks_breakdown_service_role') {
      return Promise.resolve({
        data: [
          {
            claimable_now: 3,
            blocked_by_capacity: 2,
            blocked_by_deps: 1,
            blocked_by_settings: 1,
            total_queued: 7,
          },
        ],
        error: null,
      });
    }

    if (fn === 'per_user_capacity_stats_service_role') {
      return Promise.resolve({ data: [], error: null });
    }

    throw new Error(`Unexpected rpc: ${fn}`);
  });

  return { rpc, from };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('task-counts edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(TaskCountsEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createServiceRoleSupabase(),
        logger: createLogger(),
        auth: { isServiceRole: true, userId: null },
        body: {},
      },
    });
  });

  it('returns bootstrap failure response untouched', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 401 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/task-counts', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns service-role aggregate counts payload', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/task-counts', { method: 'POST' }));

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.mode).toBe('count');
    expect(payload.run_type_filter_requested).toBeNull();
    expect(payload.run_type_filter).toBeNull();
    expect(payload.totals).toEqual({
      queued_only: 3,
      active_only: 2,
      queued_plus_active: 5,
      blocked_by_capacity: 2,
      blocked_by_deps: 1,
      blocked_by_settings: 1,
      potentially_claimable: 5,
    });
    expect(payload.queued_tasks).toEqual([]);
    expect(payload.active_tasks).toEqual([]);
    expect(payload.users).toEqual([]);
  });
});
