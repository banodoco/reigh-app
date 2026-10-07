import { z } from 'zod';

import type { AstridBridgeTransport } from './transport.ts';

const connectionSchema = z.strictObject({
  connection_id: z.string().min(1),
  initialize: z.unknown(),
});
const rpcResponseSchema = z.strictObject({ result: z.unknown() });
const cancelResponseSchema = z.strictObject({
  cancelled: z.literal(true),
  session_id: z.string().min(1),
});
const disconnectResponseSchema = z.strictObject({
  connection_id: z.string().min(1),
  closed: z.literal(true),
});
const reconnectResponseSchema = z.strictObject({
  connection_id: z.string().min(1),
  reused: z.literal(true),
});
const eventsResponseSchema = z.strictObject({
  notifications: z.array(z.unknown()),
  disconnected: z.boolean(),
});

export type AstridAcpConnection = z.infer<typeof connectionSchema>;
export type AstridAcpRpcParams = Record<string, unknown>;
const projectChatSchema = z.object({
  project_id: z.string(),
  scope_key: z.string(),
  revision: z.number().int(),
  selected_session_id: z.string().nullable(),
  operation_session_id: z.string().optional(),
  sessions: z.array(z.object({ id: z.string(), title: z.string().optional(), missing: z.boolean().optional() })),
  draft: z.object({
    text: z.string(), revision: z.number().int(),
    queued_messages: z.array(z.object({ id: z.string(), text: z.string(), session_id: z.string(), attachments: z.array(z.unknown()).optional() })).optional(),
  }),
});
export type ProjectChatState = z.infer<typeof projectChatSchema>;
const unassignedSessionsSchema = z.object({ sessions: z.array(z.object({ id: z.string(), title: z.string().optional() })) });
export type ProjectChatCandidate = z.infer<typeof unassignedSessionsSchema>['sessions'][number];

/**
 * Browser-side controls for the host-owned ACP lifecycle. The connection id
 * is ephemeral and held by the caller; OMP's opaque session id is never
 * rewritten or persisted here.
 */
export class AstridLocalAcpRoutes {
  constructor(private readonly transport: AstridBridgeTransport) {}

  async projectChat(projectId: string): Promise<ProjectChatState> {
    return this.transport.requestJson(`/acp/projects/${encodeURIComponent(projectId)}/chat`, { method: 'GET' }, projectChatSchema, 'Read project chat');
  }

  async createProjectSession(projectId: string, connectionId: string, mode: 'ensure' | 'new', operationId: string): Promise<ProjectChatState> {
    return this.transport.requestJson(`/acp/projects/${encodeURIComponent(projectId)}/chat/sessions`, {
      method: 'POST', body: { connection_id: connectionId, mode, operation_id: operationId },
    }, projectChatSchema, 'Create project chat session');
  }

  async unassignedProjectSessions(projectId: string, connectionId: string): Promise<ProjectChatCandidate[]> {
    const result = await this.transport.requestJson(`/acp/projects/${encodeURIComponent(projectId)}/chat/unassigned?connection_id=${encodeURIComponent(connectionId)}`, { method: 'GET' }, unassignedSessionsSchema, 'List unassigned OMP sessions');
    return result.sessions;
  }

  async associateProjectSession(projectId: string, connectionId: string, expectedRevision: number, sessionId: string): Promise<ProjectChatState> {
    return this.transport.requestJson(`/acp/projects/${encodeURIComponent(projectId)}/chat/associate`, {
      method: 'POST', body: { connection_id: connectionId, expected_revision: expectedRevision, session_id: sessionId },
    }, projectChatSchema, 'Attach existing OMP session');
  }

  async saveProjectDraft(projectId: string, expectedRevision: number, text: string, queuedMessages: ProjectChatState['draft']['queued_messages'] = []): Promise<ProjectChatState> {
    return this.transport.requestJson(`/acp/projects/${encodeURIComponent(projectId)}/chat/draft`, {
      method: 'PATCH', body: { expected_revision: expectedRevision, text, queued_messages: queuedMessages },
    }, projectChatSchema, 'Save project chat draft');
  }

  async selectProjectSession(projectId: string, expectedRevision: number, selectedSessionId: string | null): Promise<ProjectChatState> {
    return this.transport.requestJson(`/acp/projects/${encodeURIComponent(projectId)}/chat`, {
      method: 'PATCH', body: { expected_revision: expectedRevision, selected_session_id: selectedSessionId },
    }, projectChatSchema, 'Select project chat session');
  }

  async promptProjectSession(projectId: string, connectionId: string, sessionId: string, prompt: Array<Record<string, unknown>>): Promise<unknown> {
    const response = await this.transport.requestJson(`/acp/projects/${encodeURIComponent(projectId)}/chat/prompt`, {
      method: 'POST', body: { connection_id: connectionId, session_id: sessionId, prompt },
    }, rpcResponseSchema, 'Prompt project chat session');
    return response.result;
  }

  async connect(): Promise<AstridAcpConnection> {
    return this.transport.requestJson(
      '/acp/connect',
      { method: 'POST', body: {} },
      connectionSchema,
      'ACP connect',
    );
  }

  async reconnect(connectionId?: string): Promise<AstridAcpConnection | z.infer<typeof reconnectResponseSchema>> {
    if (!connectionId) return this.connect();
    return this.transport.requestJson(
      '/acp/' + encodeURIComponent(connectionId) + '/reconnect',
      { method: 'POST', body: {} },
      reconnectResponseSchema,
      'ACP reconnect',
    );
  }

  async createSession<T = unknown>(connectionId: string, params: AstridAcpRpcParams = {}): Promise<T> {
    return this.rpc<T>(connectionId, 'session/new', params);
  }

  async resumeSession<T = unknown>(connectionId: string, sessionId: string, params: AstridAcpRpcParams = {}): Promise<T> {
    return this.rpc<T>(connectionId, 'session/resume', { ...params, sessionId });
  }

  async loadSession<T = unknown>(connectionId: string, sessionId: string, params: AstridAcpRpcParams = {}): Promise<T> {
    return this.rpc<T>(connectionId, 'session/load', { ...params, sessionId });
  }

  async listSessions<T = unknown>(connectionId: string, params: AstridAcpRpcParams = {}): Promise<T> {
    return this.rpc<T>(connectionId, 'session/list', params);
  }

  async promptSession<T = unknown>(
    connectionId: string,
    sessionId: string,
    prompt: Array<Record<string, unknown>>,
  ): Promise<T> {
    return this.rpc<T>(connectionId, 'session/prompt', { sessionId, prompt });
  }

  async setConfigOption<T = unknown>(
    connectionId: string,
    sessionId: string,
    configId: 'model' | 'thinking',
    value: string,
  ): Promise<T> {
    return this.rpc<T>(connectionId, 'session/set_config_option', { sessionId, configId, value });
  }

  async cancelSession(connectionId: string, sessionId: string): Promise<z.infer<typeof cancelResponseSchema>> {
    return this.transport.requestJson(
      `/acp/${encodeURIComponent(connectionId)}/cancel`,
      { method: 'POST', body: { sessionId } },
      cancelResponseSchema,
      'ACP cancel session',
    );
  }

  async closeSession<T = unknown>(connectionId: string, sessionId: string): Promise<T> {
    return this.rpc<T>(connectionId, 'session/close', { sessionId });
  }

  async events(connectionId: string): Promise<z.infer<typeof eventsResponseSchema>> {
    return this.transport.requestJson(
      `/acp/${encodeURIComponent(connectionId)}/events`,
      {},
      eventsResponseSchema,
      'ACP events',
    );
  }

  async disconnect(connectionId: string): Promise<z.infer<typeof disconnectResponseSchema>> {
    return this.transport.requestJson(
      `/acp/${encodeURIComponent(connectionId)}`,
      { method: 'DELETE' },
      disconnectResponseSchema,
      'ACP disconnect',
    );
  }

  private async rpc<T>(connectionId: string, method: string, params: AstridAcpRpcParams): Promise<T> {
    const response = await this.transport.requestJson(
      `/acp/${encodeURIComponent(connectionId)}/rpc`,
      { method: 'POST', body: { method, params } },
      rpcResponseSchema,
      `ACP ${method}`,
    );
    return response.result as T;
  }
}
