import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import {
  classifyPairedRoute,
  forwardHeaders,
  PAIRED_MAX_FRAME_BYTES,
  PAIRED_MAX_JSON_BYTES,
  PAIRED_MAX_UPLOAD_BYTES,
  PAIRED_REQUEST_TIMEOUT_MS,
  type PairedRoute,
} from './pairedRoutePolicy';
import { PairingError, PairingRegistry } from './pairedRegistry';

const CONNECTOR_PATH = '/api/pairing/connector';
const SESSION_COOKIE = '__Host-reigh_pair';
const CHUNK_BYTES = 40 * 1024;

export interface PairedRelayConfig {
  readonly origin: string;
  readonly loopbackTest: boolean;
  readonly enabled: boolean;
}

export function resolvePairedRelayConfig(env: Readonly<Record<string, string | undefined>>): PairedRelayConfig | null {
  const raw = env.REIGH_PAIRED_RELAY_ORIGIN?.trim();
  if (!raw) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('REIGH_PAIRED_RELAY_ORIGIN must be an absolute URL'); }
  const loopbackTest = env.REIGH_PAIRED_RELAY_LOOPBACK_TEST === '1';
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (!loopbackTest && parsed.protocol !== 'https:') throw new Error('paired relay origin must use HTTPS outside loopback test mode');
  if (loopbackTest && (!loopback || !['http:', 'https:'].includes(parsed.protocol))) throw new Error('loopback paired relay tests require a loopback HTTP(S) origin');
  if (!parsed.pathname || parsed.pathname !== '/') throw new Error('paired relay origin must not include a path');
  return Object.freeze({ origin: parsed.origin, loopbackTest, enabled: env.REIGH_PAIRED_RELAY_ENABLED !== '0' });
}

function json(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  const text = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', Buffer.byteLength(text));
  response.end(text);
}
function parseCookie(request: IncomingMessage): string | null {
  const raw = request.headers.cookie;
  if (!raw) return null;
  const item = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return item ? decodeURIComponent(item.slice(SESSION_COOKIE.length + 1)) : null;
}
function sameOrigin(request: IncomingMessage, origin: string): boolean {
  const supplied = request.headers.origin;
  return supplied === undefined || supplied === origin;
}

interface RelayRequest {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly route: PairedRoute;
  readonly connector: ConnectorSocket;
  readonly id: string;
  bytes: number;
  done: boolean;
}

type ConnectorSocket = WebSocket & { connectorId?: string; generation?: number; connectorSecret?: string };

function send(socket: WebSocket, value: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function incomingPath(request: IncomingMessage): string {
  const raw = request.url ?? '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export class PairedRelay {
  readonly registry = new PairingRegistry();
  private readonly connectors = new Map<string, ConnectorSocket>();
  private readonly pending = new Map<string, RelayRequest>();
  private readonly redemptionAttempts = new Map<string, { windowStarted: number; count: number }>();
  private readonly ws = new WebSocketServer({ noServer: true, maxPayload: PAIRED_MAX_FRAME_BYTES });

  constructor(readonly config: PairedRelayConfig) {
    this.ws.on('connection', (socket: ConnectorSocket) => this.onConnector(socket));
  }

  /** Middleware shared by Vite dev and preview. */
  handler(): Connect.NextHandleFunction {
    return (request, response, next) => {
      const path = incomingPath(request);
      if (!path.startsWith('/api/pairing/') && !path.startsWith('/api/runtime') && !path.startsWith('/api/astrid')) { next(); return; }
      void this.handleHttp(request, response, next);
    };
  }

  installUpgrade(server: NonNullable<ViteDevServer['httpServer']>): void {
    server.on('upgrade', (request, socket, head) => {
      if (new URL(request.url ?? '/', 'http://localhost').pathname !== CONNECTOR_PATH) return;
      this.ws.handleUpgrade(request, socket, head, (client) => this.ws.emit('connection', client, request));
    });
  }

  restart(): void {
    for (const socket of this.connectors.values()) socket.close(1012, 'relay restarted');
    this.connectors.clear();
    this.registry.clear();
    for (const item of this.pending.values()) item.response.destroy();
    this.pending.clear();
  }

  private async handleHttp(request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction): Promise<void> {
    const path = incomingPath(request);
    if (path.startsWith('/api/pairing/')) { await this.handlePairing(request, response); return; }
    if (!sameOrigin(request, this.config.origin)) { json(response, 403, { error: 'same_origin_required', detail: 'the configured relay origin is required' }); return; }
    const route = classifyPairedRoute(path, request.method ?? 'GET', request.headers);
    if (!route) { json(response, 404, { error: 'paired_route_not_allowed', detail: 'route is outside the paired product surface' }); return; }
    const session = parseCookie(request);
    if (!session) { json(response, 401, { error: 'paired_session_required', detail: 'pair this browser with an explicitly started local connector' }); return; }
    let pair;
    try { pair = this.registry.authorizeSession(session); } catch (error) { this.sendPairingError(response, error); return; }
    const connector = this.connectors.get(pair.connectorId);
    if (!connector || connector.readyState !== WebSocket.OPEN || connector.generation !== pair.generation) {
      json(response, 503, { error: 'paired_connector_unavailable', detail: 'the local connector is disconnected; reconnect it and retry explicitly' }); return;
    }
    await this.forward(request, response, route, connector);
    void next;
  }

  private async handlePairing(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!sameOrigin(request, this.config.origin) && request.method !== 'GET') { json(response, 403, { error: 'same_origin_required' }); return; }
    const path = incomingPath(request).split('?', 1)[0];
    if (path === '/api/pairing/redeem' && request.method === 'POST') {
      if (!this.allowRedemption(request)) { json(response, 429, { error: 'pairing_rate_limited', detail: 'too many pairing attempts; wait before trying again' }); return; }
      try {
        const body = await readBoundedJson(request, PAIRED_MAX_JSON_BYTES);
        if (!body || typeof body.invitation !== 'string' || body.invitation.length < 32 || body.invitation.length > 256) throw new PairingError('invalid_invitation');
        const { pair, sessionToken } = this.registry.redeemInvitation(body.invitation);
        const connector = this.connectors.get(pair.connectorId);
        if (connector) send(connector, { type: 'paired', pair_id: pair.pairId, realm_id: pair.realmId, generation: pair.generation });
        const secure = !this.config.loopbackTest;
        response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure ? '; Secure' : ''}`);
        json(response, 200, { pair_id: pair.pairId, realm_id: pair.realmId, expires_at: pair.expiresAt });
      } catch (error) { this.sendPairingError(response, error); }
      return;
    }
    const session = parseCookie(request);
    if (path === '/api/pairing/status' && request.method === 'GET') {
      if (!session) { json(response, 401, { error: 'paired_session_required' }); return; }
      try { const pair = this.registry.authorizeSession(session); json(response, 200, { pair_id: pair.pairId, realm_id: pair.realmId, expires_at: pair.expiresAt }); }
      catch (error) { this.sendPairingError(response, error); }
      return;
    }
    if (path === '/api/pairing/revoke' && request.method === 'POST') {
      if (!session) { json(response, 401, { error: 'paired_session_required' }); return; }
      try {
        const pair = this.registry.authorizeSession(session);
        const connector = this.registry.revoke(pair.pairId);
        if (connector?.activeConnection && typeof (connector.activeConnection as ConnectorSocket).close === 'function') (connector.activeConnection as ConnectorSocket).close(1000, 'pair revoked');
        this.connectors.delete(pair.connectorId);
        response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${this.config.loopbackTest ? '' : '; Secure'}`);
        json(response, 200, { revoked: true, pair_id: pair.pairId });
      } catch (error) { this.sendPairingError(response, error); }
      return;
    }
    json(response, 404, { error: 'pairing_route_not_found' });
  }

  private allowRedemption(request: IncomingMessage): boolean {
    const key = request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const previous = this.redemptionAttempts.get(key);
    if (!previous || now - previous.windowStarted >= 60_000) { this.redemptionAttempts.set(key, { windowStarted: now, count: 1 }); return true; }
    if (previous.count >= 20) return false;
    previous.count += 1;
    return true;
  }

  private onConnector(socket: ConnectorSocket): void {
    let hello = false;
    socket.on('message', (raw, isBinary) => {
      if (isBinary || Buffer.byteLength(raw.toString()) > PAIRED_MAX_FRAME_BYTES) { socket.close(1009, 'frame too large'); return; }
      let message: Record<string, unknown>;
      try { message = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { socket.close(1002, 'invalid control frame'); return; }
      if (!hello) {
        if (message.type !== 'connector_hello' || typeof message.connector_id !== 'string' || typeof message.realm_id !== 'string' || typeof message.connector_secret !== 'string') { socket.close(1008, 'connector authentication required'); return; }
        try {
          const result = this.registry.connectConnector({ connectorId: message.connector_id, realmId: message.realm_id, connectorSecret: message.connector_secret, connection: socket });
          const prior = this.connectors.get(result.connector.connectorId);
          if (prior && prior !== socket) prior.close(1012, 'replaced by a newer connection');
          socket.connectorId = result.connector.connectorId; socket.generation = result.connector.generation; socket.connectorSecret = message.connector_secret;
          this.connectors.set(result.connector.connectorId, socket);
          hello = true;
          send(socket, { type: 'connector_hello_ack', connector_id: result.connector.connectorId, generation: result.connector.generation, invitation: result.invitation?.code, realm_id: result.connector.realmId, expires_at: result.invitation?.expiresAt });
        } catch { socket.close(1008, 'connector authentication rejected'); }
        return;
      }
      this.onConnectorMessage(socket, message);
    });
    socket.on('close', () => { if (socket.connectorId && this.connectors.get(socket.connectorId) === socket) this.connectors.delete(socket.connectorId); });
  }

  private onConnectorMessage(socket: ConnectorSocket, message: Record<string, unknown>): void {
    const type = message.type;
    if (type === 'response_start' && typeof message.id === 'string') {
      const item = this.pending.get(message.id); if (!item) return;
      item.response.statusCode = Number.isInteger(message.status) ? Number(message.status) : 502;
      if (message.headers && typeof message.headers === 'object') for (const [key, value] of Object.entries(message.headers as Record<string, unknown>)) if (typeof value === 'string') item.response.setHeader(key, value);
      return;
    }
    if (type === 'response_chunk' && typeof message.id === 'string' && typeof message.data === 'string') {
      const item = this.pending.get(message.id); if (!item || item.done) return;
      const data = Buffer.from(message.data, 'base64');
      if (data.byteLength > CHUNK_BYTES) { item.response.destroy(new Error('paired response chunk exceeds bound')); return; }
      if (!item.response.write(data)) send(socket, { type: 'response_pause', id: item.id });
      return;
    }
    if (type === 'response_end' && typeof message.id === 'string') {
      const item = this.pending.get(message.id); if (!item) return;
      item.done = true; this.pending.delete(message.id); item.response.end(); return;
    }
    if (type === 'response_error' && typeof message.id === 'string') {
      const item = this.pending.get(message.id); if (!item) return;
      item.done = true; this.pending.delete(message.id); json(item.response, 502, { error: 'paired_connector_error', detail: typeof message.detail === 'string' ? message.detail : 'local connector request failed' });
    }
  }

  private async forward(request: IncomingMessage, response: ServerResponse, route: PairedRoute, socket: ConnectorSocket): Promise<void> {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const item: RelayRequest = { request, response, route, connector: socket, id, bytes: 0, done: false };
    this.pending.set(id, item);
    const declared = request.headers['content-length'];
    const max = route.service === 'runtime' && route.stream ? PAIRED_MAX_UPLOAD_BYTES : PAIRED_MAX_JSON_BYTES;
    if (declared && Number(declared) > max) { this.pending.delete(id); json(response, 413, { error: 'payload_too_large', detail: 'paired request exceeds its bounded body limit' }); return; }
    send(socket, { type: 'request_start', id, method: request.method ?? 'GET', path: route.upstreamPath, service: route.service, headers: forwardHeaders(request.headers) });
    const timer = setTimeout(() => { if (!item.done) { item.done = true; this.pending.delete(id); send(socket, { type: 'request_cancel', id }); json(response, 504, { error: 'paired_request_timeout' }); } }, PAIRED_REQUEST_TIMEOUT_MS);
    const cleanup = () => clearTimeout(timer);
    response.on('close', () => { if (!item.done) { send(socket, { type: 'request_cancel', id }); this.pending.delete(id); cleanup(); } });
    response.on('drain', () => send(socket, { type: 'response_resume', id }));
    request.on('data', (chunk: Buffer | string) => {
      if (item.done) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      item.bytes += buffer.byteLength;
      if (item.bytes > max) { item.done = true; this.pending.delete(id); send(socket, { type: 'request_cancel', id }); json(response, 413, { error: 'payload_too_large', detail: 'paired request exceeds its bounded body limit' }); return; }
      for (let offset = 0; offset < buffer.byteLength; offset += CHUNK_BYTES) send(socket, { type: 'request_chunk', id, data: buffer.subarray(offset, Math.min(offset + CHUNK_BYTES, buffer.byteLength)).toString('base64') });
    });
    request.on('end', () => { if (!item.done) send(socket, { type: 'request_end', id }); });
    request.on('error', () => { if (!item.done) send(socket, { type: 'request_cancel', id }); });
  }

  private sendPairingError(response: ServerResponse, error: unknown): void {
    const code = error instanceof PairingError ? error.code : 'invalid_pairing_request';
    const statuses: Record<string, number> = { invalid_invitation: 400, expired_invitation: 410, already_redeemed: 409, invalid_connector: 401, revoked: 401, expired_session: 401, unknown_session: 401 };
    json(response, statuses[code] ?? 400, { error: code, detail: 'pairing credentials are invalid, expired or revoked' });
  }
}

async function readBoundedJson(request: IncomingMessage, maximum: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.byteLength; if (size > maximum) throw new PairingError('invalid_invitation'); chunks.push(value); }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new PairingError('invalid_invitation');
  return parsed as Record<string, unknown>;
}

export function createPairedRelayPlugin(config: PairedRelayConfig | null): Plugin | null {
  if (!config?.enabled) return null;
  const relay = new PairedRelay(config);
  const register = (server: { middlewares: Connect.Server; httpServer: NonNullable<ViteDevServer['httpServer']> | null }) => {
    server.middlewares.use(relay.handler());
    if (server.httpServer) relay.installUpgrade(server.httpServer);
  };
  return { name: 'reigh-paired-relay', configureServer: register, configurePreviewServer: register };
}

export { CONNECTOR_PATH, SESSION_COOKIE };
