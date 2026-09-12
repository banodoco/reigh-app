import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  AcpProcessHost,
  AcpProcessHostError,
  type AcpProcessHostCallbacks,
} from '../src/tools/video-editor/runtime/processes/acpProcessHost.ts';
import {
  ASTRID_ACP_SYSTEM_PROMPT_FILE,
  createAstridAcpProcessHost,
  type AstridAcpLauncherOptions,
} from '../src/tools/video-editor/runtime/processes/astridAcpLauncher.ts';
import {
  ASTRID_BRIDGE_PROTOCOL_HEADER,
  ASTRID_BRIDGE_PROTOCOL_VERSION,
} from '../src/tools/video-editor/data/astridBridgeWire.ts';

const DEFAULT_PORT = 17_335;
const MAX_BODY_BYTES = 128 * 1024;
const CLIENT_VERSION = 'reigh-r1-consumer-20260911';
const REQUEST_METHODS = new Set([
  'authenticate',
  'session/new',
  'session/load',
  'session/list',
  'session/resume',
  'session/fork',
  'session/close',
]);

type JsonRecord = Record<string, unknown>;

export type ReighAcpBridgeConfig = {
  readonly token: string;
  readonly port: number;
  readonly cwd: string;
  readonly profile: string;
  readonly sessionDir: string;
  readonly systemPromptFile?: string;
  readonly command?: string;
};

type Connection = {
  readonly host: AcpProcessHost;
  readonly notifications: unknown[];
  disconnected: boolean;
};

type BridgeOptions = {
  readonly config: ReighAcpBridgeConfig;
  readonly hostFactory?: (options: AstridAcpLauncherOptions) => AcpProcessHost;
  readonly idFactory?: () => string;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function parsePort(value: string | undefined): number {
  const candidate = value ?? String(DEFAULT_PORT);
  if (!/^\d{1,5}$/.test(candidate)) throw new Error('ASTRID_ACP_BRIDGE_PORT must be an integer from 1 to 65535');
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('ASTRID_ACP_BRIDGE_PORT must be an integer from 1 to 65535');
  }
  return port;
}

function requiredAbsolute(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = env[key]?.trim();
  if (!value || !value.startsWith('/')) throw new Error(`${key} must be an explicit absolute path`);
  return value;
}

export function resolveReighAcpBridgeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReighAcpBridgeConfig {
  const token = env.ASTRID_BRIDGE_TOKEN?.trim();
  if (!token) throw new Error('ASTRID_BRIDGE_TOKEN is required');
  const profile = env.ASTRID_ACP_PROFILE?.trim();
  if (!profile) throw new Error('ASTRID_ACP_PROFILE is required');
  return {
    token,
    port: parsePort(env.ASTRID_ACP_BRIDGE_PORT),
    cwd: requiredAbsolute(env, 'ASTRID_ACP_CWD'),
    profile,
    sessionDir: requiredAbsolute(env, 'ASTRID_ACP_SESSION_DIR'),
    ...(env.ASTRID_ACP_SYSTEM_PROMPT_FILE?.trim()
      ? { systemPromptFile: env.ASTRID_ACP_SYSTEM_PROMPT_FILE.trim() }
      : { systemPromptFile: ASTRID_ACP_SYSTEM_PROMPT_FILE }),
    ...(env.OMP_BIN?.trim() ? { command: env.OMP_BIN.trim() } : {}),
  };
}

function jsonResponse(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader(ASTRID_BRIDGE_PROTOCOL_HEADER, ASTRID_BRIDGE_PROTOCOL_VERSION);
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) throw new Error('request body exceeds 128 KiB');
    chunks.push(value);
  }
  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('request body is not valid JSON');
  }
}

function hostError(error: unknown): { status: number; body: JsonRecord } {
  if (error instanceof AcpProcessHostError) {
    return { status: 502, body: { error: error.code, detail: error.message } };
  }
  return {
    status: 500,
    body: { error: 'acp_bridge_error', detail: error instanceof Error ? error.message : String(error) },
  };
}

export class ReighAcpBridge {
  private readonly config: ReighAcpBridgeConfig;
  private readonly hostFactory: (options: AstridAcpLauncherOptions) => AcpProcessHost;
  private readonly idFactory: () => string;
  private readonly connections = new Map<string, Connection>();

  constructor(options: BridgeOptions) {
    this.config = options.config;
    this.hostFactory = options.hostFactory ?? createAstridAcpProcessHost;
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.isAuthorized(request)) {
      jsonResponse(response, this.config.token ? 401 : 503, {
        error: this.config.token ? 'unauthorized' : 'acp_auth_not_configured',
        detail: this.config.token ? 'A valid Astrid bridge bearer credential is required' : 'ASTRID_BRIDGE_TOKEN is required',
      });
      return;
    }
    if (request.headers[ASTRID_BRIDGE_PROTOCOL_HEADER.toLowerCase()] !== ASTRID_BRIDGE_PROTOCOL_VERSION) {
      jsonResponse(response, 400, {
        error: 'invalid_protocol',
        detail: `Expected ${ASTRID_BRIDGE_PROTOCOL_HEADER}: ${ASTRID_BRIDGE_PROTOCOL_VERSION}`,
      });
      return;
    }

    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        jsonResponse(response, 200, { status: 'ok', bridge: 'reigh-acp', protocol: ASTRID_BRIDGE_PROTOCOL_VERSION });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/connect') {
        await this.connect(response);
        return;
      }

      const match = url.pathname.match(/^\/([^/]+)(?:\/(rpc|cancel|events|reconnect))?$/);
      if (!match) {
        jsonResponse(response, 404, { error: 'not_found', detail: 'Unknown Reigh ACP route' });
        return;
      }
      const connection = this.connections.get(match[1]);
      if (!connection) {
        jsonResponse(response, 404, { error: 'not_found', detail: 'ACP connection is not available; reconnect' });
        return;
      }
      if (match[2] === 'events' && request.method === 'GET') {
        const notifications = connection.notifications.splice(0);
        jsonResponse(response, 200, { notifications, disconnected: connection.disconnected });
        return;
      }
      if (match[2] === 'rpc' && request.method === 'POST') {
        await this.rpc(connection, request, response);
        return;
      }
      if (match[2] === 'cancel' && request.method === 'POST') {
        await this.cancel(connection, request, response);
        return;
      }
      if (match[2] === 'reconnect' && request.method === 'POST') {
        jsonResponse(response, connection.disconnected ? 502 : 200, connection.disconnected
          ? { error: 'acp_process_exited', detail: 'The live ACP process exited; reconnect requires a new host process' }
          : { connection_id: match[1], reused: true });
        return;
      }
      if (!match[2] && (request.method === 'DELETE' || request.method === 'POST')) {
        await connection.host.dispose();
        this.connections.delete(match[1]);
        jsonResponse(response, 200, { connection_id: match[1], closed: true });
        return;
      }
      jsonResponse(response, 404, { error: 'not_found', detail: 'Unknown Reigh ACP connection route' });
    } catch (error) {
      const result = error instanceof Error && error.message.includes('128 KiB')
        ? { status: 413, body: { error: 'payload_too_large', detail: error.message } }
        : error instanceof Error && (error.message.includes('request body') || error.message.includes('method') || error.message.includes('sessionId'))
          ? { status: 400, body: { error: 'invalid_body', detail: error.message } }
          : hostError(error);
      jsonResponse(response, result.status, result.body);
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.connections.values()].map(({ host }) => host.dispose()));
    this.connections.clear();
  }

  private isAuthorized(request: IncomingMessage): boolean {
    return Boolean(this.config.token) && request.headers.authorization === `Bearer ${this.config.token}`;
  }

  private async connect(response: ServerResponse): Promise<void> {
    const connectionId = this.idFactory();
    const notifications: unknown[] = [];
    let connection: Connection | null = null;
    const callbacks: AcpProcessHostCallbacks = {
      onNotification: (notification) => notifications.push(notification),
      onDisconnect: (error) => {
        if (connection) connection.disconnected = true;
        notifications.push({
          jsonrpc: '2.0',
          method: 'reigh/acp/disconnected',
          params: { code: error.code },
        });
      },
    };
    const host = this.hostFactory({
      cwd: this.config.cwd,
      profile: this.config.profile,
      sessionDir: this.config.sessionDir,
      systemPromptFile: this.config.systemPromptFile,
      command: this.config.command,
      callbacks,
    });
    connection = { host, notifications, disconnected: false };
    this.connections.set(connectionId, connection);
    try {
      const initialize = await host.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: 'reigh-acp-bridge', version: CLIENT_VERSION },
      });
      jsonResponse(response, 200, { connection_id: connectionId, initialize });
    } catch (error) {
      this.connections.delete(connectionId);
      await host.dispose();
      throw error;
    }
  }

  private async rpc(connection: Connection, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = asRecord(await readJson(request));
    const method = body?.method;
    if (typeof method !== 'string' || !REQUEST_METHODS.has(method)) {
      throw new Error(`method must be one of: ${[...REQUEST_METHODS].join(', ')}`);
    }
    let params = body?.params;
    if (method === 'session/new' || method === 'session/load' || method === 'session/resume') {
      const input = asRecord(params) ?? {};
      // The host owns the process cwd; the browser cannot redirect the ACP session.
      params = { ...input, cwd: this.config.cwd, mcpServers: input.mcpServers ?? [] };
    }
    const result = await connection.host.request(method, params);
    jsonResponse(response, 200, { result });
  }

  private async cancel(connection: Connection, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = asRecord(await readJson(request));
    const sessionId = body?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('sessionId is required');
    await connection.host.cancel({ sessionId });
    jsonResponse(response, 200, { cancelled: true, session_id: sessionId });
  }
}

export function createReighAcpHttpServer(options: BridgeOptions): {
  readonly bridge: ReighAcpBridge;
  readonly server: ReturnType<typeof createServer>;
} {
  const bridge = new ReighAcpBridge(options);
  const server = createServer((request, response) => {
    void bridge.handle(request, response);
  });
  server.once('close', () => { void bridge.close(); });
  return { bridge, server };
}

export function startReighAcpBridge(config: ReighAcpBridgeConfig): ReturnType<typeof createServer> {
  const { server } = createReighAcpHttpServer({ config });
  server.listen(config.port, '127.0.0.1');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = resolveReighAcpBridgeConfig();
  const server = startReighAcpBridge(config);
  server.once('listening', () => {
    console.log(`Reigh ACP bridge listening on 127.0.0.1:${config.port}`);
  });
}
