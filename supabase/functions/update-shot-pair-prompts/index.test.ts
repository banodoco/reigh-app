import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as UpdateShotPairPromptsEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  withEdgeRequest: vi.fn(),
  verifyShotOwnership: vi.fn(),
  isTimelineEligiblePositionedImage: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  withEdgeRequest: (...args: unknown[]) => mocks.withEdgeRequest(...args),
}));

vi.mock('../_shared/auth.ts', () => ({
  verifyShotOwnership: (...args: unknown[]) => mocks.verifyShotOwnership(...args),
}));

vi.mock('../_shared/http.ts', () => ({
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('../../../src/shared/lib/timelineEligibility.ts', () => ({
  isTimelineEligiblePositionedImage: (...args: unknown[]) => mocks.isTimelineEligiblePositionedImage(...args),
}));

function createLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setDefaultTaskId: vi.fn(),
  };
}

function createSupabaseAdmin(shotGenerations: Array<Record<string, unknown>>) {
  const secondOrder = vi.fn().mockResolvedValue({ data: shotGenerations, error: null });
  const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
  const not = vi.fn().mockReturnValue({ order: firstOrder });
  const eq = vi.fn().mockReturnValue({ not });
  const select = vi.fn().mockReturnValue({ eq });

  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const from = vi.fn().mockReturnValue({ select, update });

  return {
    from,
    select,
    eq,
    not,
    firstOrder,
    secondOrder,
    update,
    updateEq,
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('update-shot-pair-prompts edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(UpdateShotPairPromptsEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.verifyShotOwnership.mockResolvedValue({ success: true });
    mocks.isTimelineEligiblePositionedImage.mockReturnValue(true);

    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler({
          supabaseAdmin: createSupabaseAdmin([]),
          logger: createLogger(),
          body: {
            shot_id: 'shot-1',
            enhanced_prompts: [],
          },
          auth: { isServiceRole: true, userId: null },
        });
      },
    );
  });

  it('returns 400 when enhanced_prompts is missing', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler({
          supabaseAdmin: createSupabaseAdmin([]),
          logger: createLogger(),
          body: { shot_id: 'shot-1' },
          auth: { isServiceRole: true, userId: null },
        });
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/update-shot-pair-prompts', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing or invalid required field: enhanced_prompts (must be array)',
    });
  });

  it('returns success with zero updates when no positioned images exist', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/update-shot-pair-prompts', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'No positioned images found for this shot',
      updated_count: 0,
    });
  });

  it('updates prompts for eligible positioned images', async () => {
    const shotGenerations = [
      {
        id: 'sg-1',
        timeline_frame: 0,
        metadata: {},
        generation: { type: 'image', location: 'https://cdn.example.com/1.png' },
      },
      {
        id: 'sg-2',
        timeline_frame: 1,
        metadata: {},
        generation: { type: 'image', location: 'https://cdn.example.com/2.png' },
      },
    ];

    const supabaseAdmin = createSupabaseAdmin(shotGenerations);
    const logger = createLogger();

    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler({
          supabaseAdmin,
          logger,
          body: {
            shot_id: 'shot-1',
            task_id: 'task-1',
            enhanced_prompts: ['Transition prompt'],
          },
          auth: { isServiceRole: true, userId: null },
        });
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/update-shot-pair-prompts', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Updated 1 shot_generation(s) with enhanced prompts',
      updated_count: 1,
      skipped_count: 1,
      failed_count: 0,
      shot_id: 'shot-1',
    });

    expect(logger.setDefaultTaskId).toHaveBeenCalledWith('task-1');
    expect(supabaseAdmin.update).toHaveBeenCalledWith({ metadata: { enhanced_prompt: 'Transition prompt' } });
    expect(supabaseAdmin.updateEq).toHaveBeenCalledWith('id', 'sg-1');
  });
});
