import { describe, expect, it, vi } from 'vitest';
import { triggerCostCalculationIfNotSubTask } from './billing.ts';

describe('complete_task/billing', () => {
  it('skips trigger when task is a sub-task', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await triggerCostCalculationIfNotSubTask(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  params: {
                    orchestrator_task_id_ref: '11111111-2222-3333-4444-555555555555',
                  },
                },
              }),
            }),
          }),
        }),
      },
      'https://example.supabase.co',
      'service-key',
      'task-id',
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
