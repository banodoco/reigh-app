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

/**
 * Browser-side controls for the host-owned ACP lifecycle. The connection id
 * is ephemeral and held by the caller; OMP's opaque session id is never
 * rewritten or persisted here.
 */
export class AstridLocalAcpRoutes {
  constructor(private readonly transport: AstridBridgeTransport) {}

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
