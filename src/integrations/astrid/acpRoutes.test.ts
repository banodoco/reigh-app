import { describe, expect, it, vi } from 'vitest';

import { AstridLocalAcpRoutes } from './acpRoutes.ts';
import type { AstridBridgeTransport } from './transport.ts';

describe('AstridLocalAcpRoutes', () => {
  it('keeps browser lifecycle controls on the same-origin ACP transport', async () => {
    let connectionCount = 0;
    const requestJson = vi.fn(async (
      _path: string,
      _request: unknown,
      _schema: unknown,
      what: string,
    ) => {
      if (what === 'ACP connect') {
        connectionCount += 1;
        return { connection_id: `connection-${connectionCount}`, initialize: { protocolVersion: 1 } };
      }
      if (what === 'ACP cancel session') return { cancelled: true, session_id: 'omp-session-opaque' };
      if (what === 'ACP disconnect') return { connection_id: 'connection-1', closed: true };
      if (what === 'ACP reconnect') return { connection_id: 'connection-1', reused: true };
      if (what === 'ACP events') return { notifications: [], disconnected: false };
      return { result: { sessionId: 'omp-session-opaque' } };
    });
    const routes = new AstridLocalAcpRoutes({ requestJson } as unknown as AstridBridgeTransport);

    await expect(routes.connect()).resolves.toMatchObject({ connection_id: 'connection-1' });
    await expect(routes.createSession('connection-1', { mcpServers: [] })).resolves.toEqual({ sessionId: 'omp-session-opaque' });
    await expect(routes.resumeSession('connection-1', 'omp-session-opaque')).resolves.toEqual({ sessionId: 'omp-session-opaque' });
    await expect(routes.cancelSession('connection-1', 'omp-session-opaque')).resolves.toEqual({
      cancelled: true,
      session_id: 'omp-session-opaque',
    });
    await expect(routes.closeSession('connection-1', 'omp-session-opaque')).resolves.toEqual({ sessionId: 'omp-session-opaque' });
    await expect(routes.events('connection-1')).resolves.toEqual({ notifications: [], disconnected: false });
    await expect(routes.disconnect('connection-1')).resolves.toEqual({ connection_id: 'connection-1', closed: true });
    await expect(routes.reconnect('connection-1')).resolves.toEqual({ connection_id: 'connection-1', reused: true });
    await expect(routes.reconnect()).resolves.toMatchObject({ connection_id: 'connection-2' });

    expect(requestJson.mock.calls.map(([path, request]) => ({
      path,
      method: (request as { method?: string }).method ?? 'GET',
      body: (request as { body?: unknown }).body,
    }))).toEqual([
      { path: '/acp/connect', method: 'POST', body: {} },
      { path: '/acp/connection-1/rpc', method: 'POST', body: { method: 'session/new', params: { mcpServers: [] } } },
      { path: '/acp/connection-1/rpc', method: 'POST', body: { method: 'session/resume', params: { sessionId: 'omp-session-opaque' } } },
      { path: '/acp/connection-1/cancel', method: 'POST', body: { sessionId: 'omp-session-opaque' } },
      { path: '/acp/connection-1/rpc', method: 'POST', body: { method: 'session/close', params: { sessionId: 'omp-session-opaque' } } },
      { path: '/acp/connection-1/events', method: 'GET', body: undefined },
      { path: '/acp/connection-1', method: 'DELETE', body: undefined },
      { path: '/acp/connection-1/reconnect', method: 'POST', body: {} },
      { path: '/acp/connect', method: 'POST', body: {} },
    ]);
  });
});
