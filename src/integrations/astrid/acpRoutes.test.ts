import { describe, expect, it, vi } from 'vitest';

import { AstridLocalAcpRoutes } from './acpRoutes.ts';
import type { AstridBridgeTransport } from './transport.ts';

describe('AstridLocalAcpRoutes', () => {
  it('keeps project chat association, durable drafts, and owned prompts on the ACP transport', async () => {
    const requestJson = vi.fn(async (path: string, request: unknown, _schema: unknown) => {
      if (path.endsWith('/unassigned?connection_id=connection-1')) return { sessions: [{ id: 'legacy-1' }] };
      if (path.endsWith('/chat/prompt')) return { result: { accepted: true } };
      return {
        project_id: 'project-1', scope_key: 'realm:store:project-1', revision: 2,
        selected_session_id: 'session-1', sessions: [{ id: 'session-1' }],
        draft: { text: 'draft', revision: 1, queued_messages: [] },
      };
    });
    const routes = new AstridLocalAcpRoutes({ requestJson } as unknown as AstridBridgeTransport);

    await routes.projectChat('project-1');
    await routes.createProjectSession('project-1', 'connection-1', 'ensure', 'op-1');
    await expect(routes.unassignedProjectSessions('project-1', 'connection-1')).resolves.toEqual([{ id: 'legacy-1' }]);
    await routes.associateProjectSession('project-1', 'connection-1', 1, 'legacy-1');
    await routes.saveProjectDraft('project-1', 1, 'draft', [{ id: 'q1', text: 'queued', session_id: 'session-1' }]);
    await routes.selectProjectSession('project-1', 2, 'session-1');
    await expect(routes.promptProjectSession('project-1', 'connection-1', 'session-1', [{ type: 'text', text: 'hello' }])).resolves.toEqual({ accepted: true });

    expect(requestJson.mock.calls.map(([path, request]) => ({ path, method: (request as { method?: string }).method ?? 'GET' }))).toEqual([
      { path: '/acp/projects/project-1/chat', method: 'GET' },
      { path: '/acp/projects/project-1/chat/sessions', method: 'POST' },
      { path: '/acp/projects/project-1/chat/unassigned?connection_id=connection-1', method: 'GET' },
      { path: '/acp/projects/project-1/chat/associate', method: 'POST' },
      { path: '/acp/projects/project-1/chat/draft', method: 'PATCH' },
      { path: '/acp/projects/project-1/chat', method: 'PATCH' },
      { path: '/acp/projects/project-1/chat/prompt', method: 'POST' },
    ]);
  });

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
    await expect(routes.promptSession('connection-1', 'omp-session-opaque', [{ type: 'text', text: 'hello' }])).resolves.toEqual({ sessionId: 'omp-session-opaque' });
    await expect(routes.setConfigOption('connection-1', 'omp-session-opaque', 'thinking', 'xhigh')).resolves.toEqual({ sessionId: 'omp-session-opaque' });
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
      { path: '/acp/connection-1/rpc', method: 'POST', body: { method: 'session/prompt', params: { sessionId: 'omp-session-opaque', prompt: [{ type: 'text', text: 'hello' }] } } },
      { path: '/acp/connection-1/rpc', method: 'POST', body: { method: 'session/set_config_option', params: { sessionId: 'omp-session-opaque', configId: 'thinking', value: 'xhigh' } } },
      { path: '/acp/connection-1/cancel', method: 'POST', body: { sessionId: 'omp-session-opaque' } },
      { path: '/acp/connection-1/rpc', method: 'POST', body: { method: 'session/close', params: { sessionId: 'omp-session-opaque' } } },
      { path: '/acp/connection-1/events', method: 'GET', body: undefined },
      { path: '/acp/connection-1', method: 'DELETE', body: undefined },
      { path: '/acp/connection-1/reconnect', method: 'POST', body: {} },
      { path: '/acp/connect', method: 'POST', body: {} },
    ]);
  });
});
