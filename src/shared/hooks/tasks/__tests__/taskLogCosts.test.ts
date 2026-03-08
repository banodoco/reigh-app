import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  in: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

import { fetchTaskLogCosts } from '../taskLogCosts';

describe('fetchTaskLogCosts', () => {
  it('returns empty result without querying when task ids are empty', async () => {
    const result = await fetchTaskLogCosts([]);
    expect(result).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('queries credits ledger for spend entries', async () => {
    mocks.from.mockReturnValue({
      select: mocks.select.mockReturnValue({
        in: mocks.in.mockReturnValue({
          eq: mocks.eq.mockResolvedValue({
            data: [{ task_id: 'task-1', amount: -0.5, created_at: '2026-01-01T00:00:00Z' }],
          }),
        }),
      }),
    });

    const result = await fetchTaskLogCosts(['task-1']);

    expect(mocks.from).toHaveBeenCalledWith('credits_ledger');
    expect(mocks.select).toHaveBeenCalledWith('task_id, amount, created_at');
    expect(mocks.in).toHaveBeenCalledWith('task_id', ['task-1']);
    expect(mocks.eq).toHaveBeenCalledWith('type', 'spend');
    expect(result).toEqual([
      { task_id: 'task-1', amount: -0.5, created_at: '2026-01-01T00:00:00Z' },
    ]);
  });
});
