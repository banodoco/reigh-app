import { describe, expect, it } from 'vitest';
import {
  lookupTasksByOrchestratorIdWithFallback,
  lookupTasksByRunIdWithFallback,
} from './orchestratorReferenceLookup.ts';

interface QueryResponse {
  data: unknown[] | null;
  error: unknown;
}

function createSupabaseMock(responses: QueryResponse[]) {
  let callIndex = 0;
  const orFilters: string[] = [];

  const client = {
    from: () => ({
      select: () => {
        const builder = {
          eq: () => builder,
          or: async (filter: string) => {
            orFilters.push(filter);
            return responses[callIndex++] ?? { data: [], error: null };
          },
        };
        return builder;
      },
    }),
  };

  return { client, orFilters };
}

describe('orchestratorReferenceLookup', () => {
  it('returns canonical run-id matches without falling back', async () => {
    const { client, orFilters } = createSupabaseMock([
      { data: [{ id: 'task-1' }], error: null },
    ]);

    const rows = await lookupTasksByRunIdWithFallback({
      supabase: client,
      taskType: 'travel_segment',
      projectId: 'project-1',
      select: 'id',
      runId: 'run-1',
      contextLabel: 'TEST',
    });

    expect(rows).toEqual([{ id: 'task-1' }]);
    expect(orFilters).toHaveLength(1);
  });

  it('falls back to legacy orchestrator-id lookup when canonical has no rows', async () => {
    const { client, orFilters } = createSupabaseMock([
      { data: [], error: null },
      { data: [{ id: 'legacy-task' }], error: null },
    ]);

    const rows = await lookupTasksByOrchestratorIdWithFallback({
      supabase: client,
      taskType: 'travel_segment',
      projectId: 'project-1',
      select: 'id',
      orchestratorTaskId: 'orch-1',
      contextLabel: 'TEST',
    });

    expect(rows).toEqual([{ id: 'legacy-task' }]);
    expect(orFilters).toHaveLength(2);
  });

  it('throws contextual errors on canonical query failures', async () => {
    const { client } = createSupabaseMock([
      { data: null, error: new Error('db unavailable') },
    ]);

    await expect(
      lookupTasksByRunIdWithFallback({
        supabase: client,
        taskType: 'travel_segment',
        projectId: 'project-1',
        select: 'id',
        runId: 'run-1',
        contextLabel: 'LOOKUP',
      }),
    ).rejects.toThrow('[LOOKUP] Error querying tasks by contract run_id: db unavailable');
  });
});
