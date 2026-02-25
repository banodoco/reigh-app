import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  lookupTasksByRunIdWithFallbackMock,
  lookupTasksByOrchestratorIdWithFallbackMock,
  triggerCostCalculationMock,
} = vi.hoisted(() => ({
  lookupTasksByRunIdWithFallbackMock: vi.fn(),
  lookupTasksByOrchestratorIdWithFallbackMock: vi.fn(),
  triggerCostCalculationMock: vi.fn(),
}));

vi.mock('../_shared/orchestratorReferenceLookup.ts', () => ({
  lookupTasksByRunIdWithFallback: (...args: unknown[]) =>
    lookupTasksByRunIdWithFallbackMock(...args),
  lookupTasksByOrchestratorIdWithFallback: (...args: unknown[]) =>
    lookupTasksByOrchestratorIdWithFallbackMock(...args),
}));

vi.mock('./billing.ts', () => ({
  triggerCostCalculation: (...args: unknown[]) =>
    triggerCostCalculationMock(...args),
}));

import { checkOrchestratorCompletion } from './orchestrator.ts';

interface SegmentRow {
  id: string;
  status: string;
  generation_started_at: string | null;
}

interface OrchestratorTaskRow {
  id: string;
  status: string;
  params: Record<string, unknown>;
  result_data: unknown;
}

interface SupabaseHarnessOptions {
  orchestratorResult?: { data: OrchestratorTaskRow | null; error: unknown };
  updateResults?: Array<{ error: unknown; data?: Array<Record<string, unknown>> | null }>;
}

function createSupabaseHarness(options: SupabaseHarnessOptions = {}) {
  const updateResults = [...(options.updateResults ?? [])];
  const updateCalls: Array<Record<string, unknown>> = [];
  const orchestratorResult = options.orchestratorResult ?? {
    data: {
      id: 'orch-1',
      status: 'In Progress',
      params: {
        orchestrator_details: {
          num_new_segments_to_generate: 2,
        },
      },
      result_data: {
        previous: 'value',
      },
    },
    error: null,
  };

  const selectSingle = vi.fn(async () => orchestratorResult);
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({
      single: selectSingle,
    })),
  }));

  const update = vi.fn((payload: Record<string, unknown>) => {
    updateCalls.push(payload);
    const result = updateResults.shift() ?? { error: null, data: [{ id: 'orch-1' }] };
    const inChain = {
      select: vi.fn(async () => ({
        data: result.error ? null : (result.data ?? [{ id: 'orch-1' }]),
        error: result.error,
      })),
    };
    const eqChain = {
      in: vi.fn(() => inChain),
      then: (
        onFulfilled?: (value: { error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve({ error: result.error }).then(onFulfilled, onRejected),
    };
    return {
      eq: vi.fn(() => eqChain),
    };
  });

  const from = vi.fn(() => ({
    select,
    update,
  }));

  const supabase = { from };
  return {
    supabase,
    updateCalls,
    selectSingle,
  };
}

function defaultSegments(): SegmentRow[] {
  return [
    {
      id: 'seg-1',
      status: 'Complete',
      generation_started_at: '2026-01-01T00:00:01Z',
    },
    {
      id: 'seg-2',
      status: 'Complete',
      generation_started_at: '2026-01-01T00:00:03Z',
    },
  ];
}

function buildCompletedTask(
  overrides: Partial<{
    task_type: string;
    project_id: string;
    params: Record<string, unknown>;
  }> = {},
) {
  return {
    task_type: overrides.task_type ?? 'travel_segment',
    project_id: overrides.project_id ?? 'project-1',
    params: overrides.params ?? {
      orchestrator_task_id_ref: 'orch-1',
      orchestrator_run_id: 'run-1',
    },
  };
}

describe('complete_task/orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupTasksByRunIdWithFallbackMock.mockResolvedValue([]);
    lookupTasksByOrchestratorIdWithFallbackMock.mockResolvedValue(defaultSegments());
    triggerCostCalculationMock.mockResolvedValue({
      ok: true,
      value: {
        status: 200,
        skipped: false,
        cost: 4.2,
      },
    });
  });

  it('falls back from run-id lookup to orchestrator-id lookup when run-id siblings are empty', async () => {
    const { supabase, updateCalls } = createSupabaseHarness();

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-1',
      completedTask: buildCompletedTask(),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(lookupTasksByRunIdWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        taskType: 'travel_segment',
      }),
    );
    expect(lookupTasksByOrchestratorIdWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orchestratorTaskId: 'orch-1',
        taskType: 'travel_segment',
      }),
    );
    expect(updateCalls[0]).toMatchObject({
      status: 'Complete',
      generation_started_at: '2026-01-01T00:00:01Z',
    });
  });

  it('waits when sibling segments are still pending', async () => {
    const { supabase, updateCalls } = createSupabaseHarness();
    lookupTasksByOrchestratorIdWithFallbackMock.mockResolvedValue([
      { id: 'seg-1', status: 'Complete', generation_started_at: null },
      { id: 'seg-2', status: 'In Progress', generation_started_at: null },
    ]);

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-2',
      completedTask: buildCompletedTask(),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(updateCalls).toHaveLength(0);
    expect(triggerCostCalculationMock).not.toHaveBeenCalled();
  });

  it('marks orchestrator failed when any sibling segment fails', async () => {
    const { supabase, updateCalls } = createSupabaseHarness();
    lookupTasksByOrchestratorIdWithFallbackMock.mockResolvedValue([
      { id: 'seg-1', status: 'Failed', generation_started_at: null },
    ]);

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-3',
      completedTask: buildCompletedTask(),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(updateCalls[0]).toMatchObject({
      status: 'Failed',
      error_message: '1 of 1 segments failed',
    });
    expect(triggerCostCalculationMock).not.toHaveBeenCalled();
  });

  it('waits for final-stitch task when join-clips segments are complete but final step is pending', async () => {
    const { supabase, updateCalls } = createSupabaseHarness({
      orchestratorResult: {
        data: {
          id: 'orch-1',
          status: 'In Progress',
          params: {
            orchestrator_details: {
              clip_list: ['a', 'b'],
            },
          },
          result_data: {},
        },
        error: null,
      },
    });
    lookupTasksByOrchestratorIdWithFallbackMock.mockImplementation(async (input: {
      taskType: string;
    }) => {
      if (input.taskType === 'join_final_stitch') {
        return [{ id: 'final-1', status: 'Queued' }];
      }
      return [{ id: 'seg-1', status: 'Complete', generation_started_at: null }];
    });

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-4',
      completedTask: buildCompletedTask({ task_type: 'join_clips_segment' }),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(updateCalls).toHaveLength(0);
    expect(triggerCostCalculationMock).not.toHaveBeenCalled();
  });

  it('prefers run-scoped lookup for final-step status before orchestrator-id fallback', async () => {
    const { supabase } = createSupabaseHarness({
      orchestratorResult: {
        data: {
          id: 'orch-1',
          status: 'In Progress',
          params: {
            orchestrator_details: {
              clip_list: ['a', 'b'],
            },
          },
          result_data: {},
        },
        error: null,
      },
    });

    lookupTasksByRunIdWithFallbackMock.mockImplementation(async (input: { taskType: string; runId: string }) => {
      if (input.taskType === 'join_final_stitch') {
        return [{ id: 'final-1', status: 'Queued' }];
      }
      return defaultSegments();
    });
    lookupTasksByOrchestratorIdWithFallbackMock.mockResolvedValue([]);

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-run-scope-final',
      completedTask: buildCompletedTask({ task_type: 'join_clips_segment' }),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(lookupTasksByRunIdWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'join_final_stitch',
        runId: 'run-1',
      }),
    );
  });

  it('marks orchestrator failed when final-stitch task fails', async () => {
    const { supabase, updateCalls } = createSupabaseHarness({
      orchestratorResult: {
        data: {
          id: 'orch-1',
          status: 'In Progress',
          params: {
            orchestrator_details: {
              clip_list: ['a', 'b'],
            },
          },
          result_data: {},
        },
        error: null,
      },
    });
    lookupTasksByOrchestratorIdWithFallbackMock.mockImplementation(async (input: {
      taskType: string;
    }) => {
      if (input.taskType === 'join_final_stitch') {
        return [{ id: 'final-1', status: 'Failed' }];
      }
      return [{ id: 'seg-1', status: 'Complete', generation_started_at: null }];
    });

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-5',
      completedTask: buildCompletedTask({ task_type: 'join_clips_segment' }),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(updateCalls[0]).toMatchObject({
      status: 'Failed',
      error_message: '1 of 1 segments failed',
    });
  });

  it('writes reconciliation metadata for recoverable billing failures', async () => {
    const { supabase, updateCalls } = createSupabaseHarness();
    triggerCostCalculationMock.mockResolvedValue({
      ok: false,
      errorCode: 'cost_calculation_failed',
      message: 'temporary outage',
      recoverable: true,
    });

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-6',
      completedTask: buildCompletedTask(),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1]).toMatchObject({
      result_data: expect.objectContaining({
        billing_outcome: expect.objectContaining({
          status: 'recoverable_failure',
          recoverable: true,
          retry_recommended: true,
        }),
        billing_reconciliation: expect.objectContaining({
          required: true,
          retry_recommended: true,
          reason: 'recoverable_failure',
        }),
      }),
    });
  });

  it('persists fallback error marker when billing-outcome metadata update fails', async () => {
    const { supabase, updateCalls } = createSupabaseHarness({
      updateResults: [
        { error: null },
        { error: new Error('primary persist failed') },
        { error: null },
      ],
    });

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-7',
      completedTask: buildCompletedTask(),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[2]).toMatchObject({
      error_message: expect.stringContaining('Billing outcome persistence failed'),
    });
  });

  it('throws a completion error when billing-outcome fallback marker also fails', async () => {
    const { supabase } = createSupabaseHarness({
      updateResults: [
        { error: null },
        { error: new Error('primary persist failed') },
        { error: new Error('fallback persist failed') },
      ],
    });

    await expect(checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-8',
      completedTask: buildCompletedTask(),
      publicUrl: 'https://public.example/media.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    })).rejects.toMatchObject({
      code: 'orchestrator_completion_failed',
      metadata: expect.objectContaining({
        wrapped_error_code: 'orchestrator_billing_outcome_persist_failed',
      }),
    });
  });

  it('completes final-step tasks directly and writes output_location', async () => {
    const { supabase, updateCalls } = createSupabaseHarness({
      orchestratorResult: {
        data: {
          id: 'orch-1',
          status: 'In Progress',
          params: {
            orchestrator_details: {
              clip_list: ['a', 'b'],
            },
          },
          result_data: {},
        },
        error: null,
      },
    });
    lookupTasksByOrchestratorIdWithFallbackMock.mockResolvedValue([
      { id: 'seg-1', status: 'Complete', generation_started_at: '2026-01-01T00:00:01Z' },
    ]);

    await checkOrchestratorCompletion({
      supabase: supabase as never,
      taskIdString: 'task-9',
      completedTask: buildCompletedTask({ task_type: 'join_final_stitch' }),
      publicUrl: 'https://public.example/final.mp4',
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      authContext: { isServiceRole: true, taskOwnerVerified: false, actorId: 'worker' },
    });

    expect(updateCalls[0]).toMatchObject({
      status: 'Complete',
      output_location: 'https://public.example/final.mp4',
    });
  });
});
