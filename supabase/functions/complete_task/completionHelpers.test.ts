import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  edgeErrorResponse: vi.fn((payload: unknown, status: number) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/edgeRequest.ts', () => ({
  edgeErrorResponse: (...args: unknown[]) => mocks.edgeErrorResponse(...args),
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (...args: unknown[]) => mocks.toErrorMessage(...args),
}));

import {
  completeTaskErrorResponse,
  fetchTaskContext,
  markTaskFailed,
  persistCompletionFollowUpIssues,
} from './completionHelpers.ts';

function createTaskUpdateChain(error: unknown = null) {
  const inFn = vi.fn().mockResolvedValue({ error });
  const eq = vi.fn().mockReturnValue({ in: inFn });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, update, eq, inFn };
}

function createSelectSingleChain({ data, error }: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, single };
}

describe('completionHelpers', () => {
  it('builds edge error responses with default code and recoverable flag', async () => {
    const response = completeTaskErrorResponse('Too many requests', 429);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      errorCode: 'rate_limited',
      message: 'Too many requests',
      recoverable: true,
    });
  });

  it('allows explicit error code overrides', async () => {
    const response = completeTaskErrorResponse('Forbidden', 403, 'custom_forbidden');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      errorCode: 'custom_forbidden',
      message: 'Forbidden',
      recoverable: false,
    });
  });

  it('marks tasks failed best-effort and swallows update errors', async () => {
    const chain = createTaskUpdateChain();

    await expect(markTaskFailed({ from: chain.from } as never, 'task-1', 'boom')).resolves.toBeUndefined();
    expect(chain.from).toHaveBeenCalledWith('tasks');
    expect(chain.eq).toHaveBeenCalledWith('id', 'task-1');
    expect(chain.inFn).toHaveBeenCalledWith('status', ['Queued', 'In Progress']);

    const failingChain = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('db down');
      }),
    };
    await expect(markTaskFailed(failingChain as never, 'task-2', 'err')).resolves.toBeUndefined();
  });

  it('persists completion follow-up issues and merges result_data object', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    const result = await persistCompletionFollowUpIssues(
      { from } as never,
      'task-1',
      { existing: true },
      [{ step: 'validation', code: 'invalid_params', message: 'Missing field' }],
    );

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith('tasks');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        result_data: expect.objectContaining({
          existing: true,
          completion_follow_up: expect.objectContaining({
            status: 'degraded',
            issues: [{ step: 'validation', code: 'invalid_params', message: 'Missing field' }],
          }),
        }),
      }),
    );
    expect(eq).toHaveBeenCalledWith('id', 'task-1');
  });

  it('returns early when there are no follow-up issues', async () => {
    const from = vi.fn();
    const result = await persistCompletionFollowUpIssues({ from } as never, 'task-1', {}, []);

    expect(result).toEqual({ ok: true });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns null when task context cannot be fetched', async () => {
    const chain = createSelectSingleChain({ data: null, error: { message: 'not found' } });
    const logger = { error: vi.fn() };

    const context = await fetchTaskContext({ from: chain.from } as never, 'task-404', logger as never);

    expect(context).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('normalizes fetched task context defaults', async () => {
    const task = {
      id: 'task-1',
      task_type: 'image_generation',
      project_id: 'project-1',
      params: null,
      result_data: { out: true },
      task_types: {
        tool_type: 'wan',
        category: 'image',
        content_type: 'image',
        variant_type: null,
      },
    };
    const chain = createSelectSingleChain({ data: task, error: null });

    const context = await fetchTaskContext({ from: chain.from } as never, 'task-1');

    expect(context).toEqual({
      id: 'task-1',
      task_type: 'image_generation',
      project_id: 'project-1',
      params: {},
      result_data: { out: true },
      tool_type: 'wan',
      category: 'image',
      content_type: 'image',
      variant_type: null,
    });
  });
});
