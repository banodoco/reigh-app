import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SubTaskLookupError,
  UUID_REGEX,
  buildSubTaskFilter,
  extractOrchestratorRef,
  getSubTaskOrchestratorId,
  lookupCompletedSubTasksForOrchestrator,
  triggerCostCalculation,
  type CompletedSubTaskRow,
} from './billing.ts';

interface QueryResult {
  data: unknown[] | null;
  error: unknown;
}

function createLookupClient(sequence: QueryResult[]) {
  const filters: string[] = [];
  const statuses: Array<{ column: string; value: string }> = [];

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn((filter: string) => ({
          eq: vi.fn(async (column: string, value: string) => {
            filters.push(filter);
            statuses.push({ column, value });
            return sequence.shift() ?? { data: [], error: null };
          }),
        })),
      })),
    })),
  };

  return { client, filters, statuses };
}

describe('_shared/billing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts orchestrator references from known param shapes', () => {
    expect(extractOrchestratorRef({ orchestrator_task_id_ref: 'abc' })).toBe('abc');
    expect(extractOrchestratorRef({ orchestrator_details: { orchestrator_task_id: 'def' } })).toBe('def');
  });

  it('detects valid sub-task orchestrator IDs', () => {
    const orchestratorId = '11111111-2222-3333-4444-555555555555';
    expect(UUID_REGEX.test(orchestratorId)).toBe(true);
    expect(getSubTaskOrchestratorId({ orchestrator_task_id_ref: orchestratorId }, 'task-self')).toBe(orchestratorId);
    expect(getSubTaskOrchestratorId({ orchestrator_task_id_ref: orchestratorId }, orchestratorId)).toBeNull();
  });

  it('builds OR filter across all supported JSON paths', () => {
    const filter = buildSubTaskFilter('orch-id');
    expect(filter).toContain('params->>orchestrator_task_id_ref.eq.orch-id');
    expect(filter).toContain('params->orchestrator_details->>orchestrator_task_id.eq.orch-id');
  });

  it('returns canonical completed tasks without touching legacy fallback', async () => {
    const canonicalRows: CompletedSubTaskRow[] = [{
      id: 'task-1',
      generation_started_at: '2026-01-01T00:00:00Z',
      generation_processed_at: '2026-01-01T00:00:05Z',
      status: 'Complete',
    }];
    const { client, filters, statuses } = createLookupClient([
      { data: canonicalRows, error: null },
    ]);

    const rows = await lookupCompletedSubTasksForOrchestrator(
      client,
      'orch-1',
    );

    expect(rows).toEqual(canonicalRows);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toContain('params->orchestration_contract->>orchestrator_task_id.eq.orch-1');
    expect(statuses).toEqual([{ column: 'status', value: 'Complete' }]);
  });

  it('falls back to legacy query when canonical returns no rows', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const legacyRows: CompletedSubTaskRow[] = [{
      id: 'task-legacy',
      generation_started_at: null,
      generation_processed_at: null,
      status: 'Complete',
    }];
    const { client, filters } = createLookupClient([
      { data: [], error: null },
      { data: legacyRows, error: null },
    ]);

    const rows = await lookupCompletedSubTasksForOrchestrator(client, 'orch-2');

    expect(rows).toEqual(legacyRows);
    expect(filters).toHaveLength(2);
    expect(filters[1]).toContain('params->>orchestrator_task_id.eq.orch-2');
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('throws when canonical lookup fails', async () => {
    const { client } = createLookupClient([
      { data: null, error: new Error('canonical failed') },
    ]);

    await expect(lookupCompletedSubTasksForOrchestrator(client, 'orch-3')).rejects.toMatchObject({
      name: 'SubTaskLookupError',
      stage: 'canonical',
    } satisfies Partial<SubTaskLookupError>);
  });

  it('throws when legacy fallback lookup fails', async () => {
    const { client } = createLookupClient([
      { data: [], error: null },
      { data: null, error: new Error('legacy failed') },
    ]);

    await expect(lookupCompletedSubTasksForOrchestrator(client, 'orch-4')).rejects.toMatchObject({
      name: 'SubTaskLookupError',
      stage: 'legacy',
    } satisfies Partial<SubTaskLookupError>);
  });

  it('returns success envelope for cost trigger 200 responses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ cost: 7.25, skipped: true }), { status: 200 }),
    );

    const result = await triggerCostCalculation({
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      taskId: 'task-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual({
      status: 200,
      skipped: true,
      cost: 7.25,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/calculate-task-cost',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('marks 5xx cost-trigger responses as recoverable failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream unavailable', { status: 503 }),
    );

    const result = await triggerCostCalculation({
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      taskId: 'task-2',
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'cost_calculation_failed',
      recoverable: true,
    });
  });

  it('marks 4xx cost-trigger responses as non-recoverable failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('invalid payload', { status: 400 }),
    );

    const result = await triggerCostCalculation({
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      taskId: 'task-3',
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'cost_calculation_failed',
      recoverable: false,
    });
  });

  it('returns recoverable request error envelope when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await triggerCostCalculation({
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      taskId: 'task-4',
      logTag: 'BillingProbe',
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'cost_calculation_request_error',
      recoverable: true,
    });
    expect(result.message).toContain('[BillingProbe]');
  });

  it('rejects malformed 2xx billing payloads that omit success contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ cost: "7.25" }), { status: 200 }),
    );

    const result = await triggerCostCalculation({
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      taskId: 'task-5',
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'cost_calculation_invalid_response',
      recoverable: true,
    });
  });
});
