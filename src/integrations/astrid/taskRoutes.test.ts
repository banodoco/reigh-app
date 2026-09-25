import { describe, expect, it, vi } from 'vitest';

vi.mock('./capabilityCensus.ts', () => ({
  observeAstridCapabilityFailure: vi.fn(),
}));

import { AstridLocalTaskRoutes } from './taskRoutes';
import type { AstridBridgeTransport } from './transport';

const event = {
  event_id: 'event-1', sequence: 1, cursor: 'cursor-1', event_type: 'core.task.created',
  aggregate_type: 'task', aggregate_id: 'task/1', payload: { state: 'queued' },
  occurred_at: '2026-09-24T10:00:00.000Z',
};

describe('Astrid task event reads', () => {
  it('forwards a bounded limit and opaque cursor as a Runtime read', async () => {
    const requestJson = vi.fn(async () => ({ items: [event], next_cursor: 'cursor-2' }));
    const routes = new AstridLocalTaskRoutes(
      { requestJson } as unknown as AstridBridgeTransport,
      { projectSlug: 'demo' },
    );

    await expect(routes.events('task/1', { cursor: 'cursor/opaque', limit: 12 }))
      .resolves.toMatchObject({ items: [event], next_cursor: 'cursor-2' });
    expect(requestJson).toHaveBeenCalledWith(
      '/v1/events?aggregate_id=task%2F1&limit=12&cursor=cursor%2Fopaque',
      {}, expect.anything(), 'task events',
    );
  });

  it('rejects an unbounded or invalid event limit before transport', async () => {
    const requestJson = vi.fn();
    const routes = new AstridLocalTaskRoutes(
      { requestJson } as unknown as AstridBridgeTransport,
      { projectSlug: 'demo' },
    );
    await expect(routes.events('task-1', { limit: 101 })).rejects.toThrow('1 to 100');
    expect(requestJson).not.toHaveBeenCalled();
  });
});
