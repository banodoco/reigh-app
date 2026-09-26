#!/usr/bin/env tsx
/**
 * User-local half of the paired transport. It has one fixed destination: the
 * discovered loopback Runtime (and the already configured local Astrid/ACP
 * bridge). It never binds a public listener or accepts a browser credential.
 */
import { readFileSync, mkdirSync, chmodSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { classifyPairedRoute, PAIRED_MAX_FRAME_BYTES, PAIRED_MAX_JSON_BYTES, PAIRED_MAX_UPLOAD_BYTES } from '../config/vite/pairedRoutePolicy';
import {
  ASTRID_BRIDGE_PROTOCOL_HEADER,
  ASTRID_BRIDGE_PROTOCOL_VERSION,
} from '../src/tools/video-editor/data/astridBridgeWire';
import {
  RUNTIME_COMPONENT_MANIFEST_SHA256,
  RUNTIME_PROTOCOL,
  RUNTIME_SCHEMA_DIGEST,
  RUNTIME_TARGETED_EXECUTION_CAPABILITY,
} from '../src/integrations/runtime/contract-metadata';
// @ts-expect-error This run-time helper is shared with the Node .mjs launcher.
import { PRODUCT_SCOPES, readProductCredential } from './reigh-product-credential.mjs';

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith('--')) args.set(value.slice(2), process.argv[index + 1] ?? '');
}
const discoveryPath = resolve(args.get('discovery') || process.env.ASTRID_WORKSPACE_DISCOVERY || `${homedir()}/Library/Application Support/Banodoco/runtime/discovery.json`);
const relayOrigin = args.get('relay-origin') || process.env.REIGH_PAIRED_RELAY_ORIGIN;
const expectedRealm = args.get('realm') || process.env.REIGH_PAIRED_REALM_ID;
const expectedActorOverride = process.env.REIGH_PAIRED_PRODUCT_ACTOR?.trim();
const acpBridgeToken = process.env.ASTRID_ACP_BRIDGE_TOKEN?.trim();
const statePath = resolve(args.get('state') || process.env.REIGH_PAIRED_CONNECTOR_STATE || `${homedir()}/.config/reigh/paired-connector.json`);
const resetPairing = args.has('reset-pairing');
if (!relayOrigin) throw new Error('paired connector requires --relay-origin or REIGH_PAIRED_RELAY_ORIGIN');

function fail(message: string): never { throw new Error(`reigh-local-connector: ${message}`); }
function readJson(path: string, label: string): Record<string, unknown> { try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>; } catch (error) { return fail(`cannot read ${label}: ${error instanceof Error ? error.message : String(error)}`); } }
function runtimeEndpoint(raw: unknown): URL {
  let endpoint: URL; try { endpoint = new URL(String(raw)); } catch { return fail('discovery endpoint is not a URL'); }
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || !endpoint.port) return fail('Runtime endpoint must be an explicit HTTP loopback URL');
  return endpoint;
}
function routePath(service: string, path: string): string {
  if (service === 'runtime') return `/api/runtime${path}`;
  if (service === 'acp') return `/api/astrid${path}`;
  if (service === 'astrid') return `/api/astrid${path}`;
  return '/api/astrid/generation/compose';
}

const discovery = readJson(discoveryPath, 'runtime discovery');
const endpoint = runtimeEndpoint(discovery.endpoint);
const credentialPath = resolve(process.env.ASTRID_PRODUCT_TOKEN_FILE || (typeof discovery.credential_file === 'string' ? discovery.credential_file : fail('discovery has no credential_file')));
const initialCredential = readProductCredential(credentialPath, expectedActorOverride) as {
  token: string; actorId: string; source: string;
};
const expectedActor = initialCredential.actorId;
function validateHandshake(value: unknown): { realmId: string } {
  if (!value || typeof value !== 'object') return fail('Runtime handshake response is malformed');
  const handshake = value as { realm_id?: unknown; protocol?: unknown; schema_digest?: unknown; component_manifest_sha256?: unknown; actor_id?: unknown; scopes?: unknown; capabilities?: unknown };
  const scopes = Array.isArray(handshake.scopes) ? handshake.scopes.filter((scope): scope is string => typeof scope === 'string') : [];
  const capabilities = Array.isArray(handshake.capabilities) ? handshake.capabilities.filter((capability): capability is string => typeof capability === 'string') : [];
  const expectedScopes = [...PRODUCT_SCOPES].sort();
  if (handshake.protocol !== RUNTIME_PROTOCOL || handshake.schema_digest !== RUNTIME_SCHEMA_DIGEST || handshake.component_manifest_sha256 !== RUNTIME_COMPONENT_MANIFEST_SHA256 || typeof handshake.realm_id !== 'string' || (expectedRealm && handshake.realm_id !== expectedRealm) || handshake.actor_id !== expectedActor || JSON.stringify([...scopes].sort()) !== JSON.stringify(expectedScopes) || !capabilities.includes(RUNTIME_TARGETED_EXECUTION_CAPABILITY)) {
    return fail('Runtime handshake actor, realm, protocol, schema, component manifest, product scopes, or capability did not match the explicitly expected contract');
  }
  return { realmId: handshake.realm_id };
}
function validateHealth(value: unknown): void {
  if (!value || typeof value !== 'object') return fail('Runtime health response is malformed');
  const health = value as { status?: unknown; protocol?: unknown; schema_digest?: unknown };
  if (health.status !== 'ok' || health.protocol !== RUNTIME_PROTOCOL || health.schema_digest !== RUNTIME_SCHEMA_DIGEST) {
    fail('Runtime health status, protocol, or schema digest did not match the explicitly expected contract');
  }
}
async function readRuntimeIdentity(runtimeToken: string): Promise<{ realmId: string }> {
  const healthResponse = await fetch(new URL('/v1/health', endpoint), { headers: { Authorization: `Bearer ${runtimeToken}` }, signal: AbortSignal.timeout(3000) });
  if (!healthResponse.ok) fail(`Runtime health returned HTTP ${healthResponse.status}`);
  validateHealth(await healthResponse.json());
  const handshakeResponse = await fetch(new URL('/v1/handshake', endpoint), {
    method: 'POST',
    headers: { Authorization: `Bearer ${runtimeToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ protocol: RUNTIME_PROTOCOL, client_name: 'reigh-paired-connector', client_version: '1', requested_scopes: PRODUCT_SCOPES }),
    signal: AbortSignal.timeout(3000),
  });
  if (!handshakeResponse.ok) fail(`Runtime handshake returned HTTP ${handshakeResponse.status}`);
  const handshake = validateHandshake(await handshakeResponse.json());
  const realmResponse = await fetch(new URL('/v1/realm', endpoint), { headers: { Authorization: `Bearer ${runtimeToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(3000) });
  if (!realmResponse.ok) fail(`Runtime realm returned HTTP ${realmResponse.status}`);
  const realm = await realmResponse.json() as { realm_id?: unknown };
  if (realm.realm_id !== handshake.realmId) fail('Runtime handshake and fetched realm identities did not match');
  return handshake;
}
let token = initialCredential.token;
const realm = { realm_id: (await readRuntimeIdentity(token)).realmId };

let state: { connectorId: string; connectorSecret: string };
if (existsSync(statePath) && !resetPairing) state = readJson(statePath, 'connector state') as typeof state;
else { state = { connectorId: `reigh-${randomBytes(16).toString('hex')}`, connectorSecret: randomBytes(32).toString('base64url') }; mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 }); writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 }); chmodSync(statePath, 0o600); }
if (!state.connectorId || !state.connectorSecret) fail('connector state is malformed');

const wsOrigin = new URL(relayOrigin);
wsOrigin.protocol = wsOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
wsOrigin.pathname = '/api/pairing/connector';
wsOrigin.search = '';
wsOrigin.hash = '';
let socket: WebSocket;
let stopping = false;
const requests = new Map<string, { controller?: ReadableStreamDefaultController<Uint8Array>; abort: AbortController; cancelled: boolean; bytes: number; maxBytes: number }>();
const pausedResponses = new Map<string, Promise<void>>();
const resumeResponses = new Map<string, () => void>();

function send(value: Record<string, unknown>): void { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); }
function connect(): void {
  socket = new WebSocket(wsOrigin, { maxPayload: PAIRED_MAX_FRAME_BYTES });
  socket.on('open', async () => {
    try {
      const refreshed = readProductCredential(credentialPath, expectedActor) as {
        token: string; actorId: string; source: string;
      };
      token = refreshed.token;
      const current = await readRuntimeIdentity(token);
      if (current.realmId !== realm.realm_id) { socket.close(1008, 'local Runtime identity changed'); return; }
    } catch { socket.close(1008, 'local Runtime unavailable'); return; }
    send({ type: 'connector_hello', connector_id: state.connectorId, connector_secret: state.connectorSecret, realm_id: realm.realm_id });
  });
  socket.on('message', async (raw, isBinary) => {
  if (isBinary || raw.byteLength > PAIRED_MAX_FRAME_BYTES) { socket.close(1009, 'frame too large'); return; }
  let message: Record<string, unknown>; try { message = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { socket.close(1002, 'invalid control frame'); return; }
  if (message.type === 'connector_hello_ack') {
    if (typeof message.invitation === 'string') console.log(`Pair this browser at ${new URL(`/pairing#${encodeURIComponent(message.invitation)}`, relayOrigin).toString()}`);
    return;
  }
  if (message.type === 'request_start' && typeof message.id === 'string' && typeof message.service === 'string' && typeof message.path === 'string') {
    await beginRequest(message.id, message.service, message.path, typeof message.method === 'string' ? message.method : 'GET', message.headers && typeof message.headers === 'object' ? message.headers as Record<string, string> : {});
    return;
  }
  if (message.type === 'request_chunk' && typeof message.id === 'string' && typeof message.data === 'string') {
    const request = requests.get(message.id); if (!request || request.cancelled) return;
    const chunk = Buffer.from(message.data, 'base64');
    request.bytes += chunk.byteLength;
    if (request.bytes > request.maxBytes) { request.cancelled = true; request.abort.abort(); request.controller?.error(new Error('paired request body exceeds local bound')); send({ type: 'response_error', id: message.id, detail: 'request body exceeds local bound' }); return; }
    try { request.controller?.enqueue(chunk); } catch { /* request already ended */ }
    return;
  }
  if (message.type === 'request_end' && typeof message.id === 'string') { const request = requests.get(message.id); if (request && !request.cancelled) request.controller?.close(); return; }
  if (message.type === 'request_cancel' && typeof message.id === 'string') { const request = requests.get(message.id); if (request) { request.cancelled = true; request.abort.abort(); request.controller?.error(new Error('paired browser request cancelled')); } }
  if (message.type === 'response_pause' && typeof message.id === 'string' && !pausedResponses.has(message.id)) pausedResponses.set(message.id, new Promise((resolve) => resumeResponses.set(message.id as string, resolve)));
  if (message.type === 'response_resume' && typeof message.id === 'string') { resumeResponses.get(message.id)?.(); resumeResponses.delete(message.id); pausedResponses.delete(message.id); }
  });
  socket.on('close', (_code, reason) => { if (!stopping && !reason.toString().includes('pair revoked')) setTimeout(connect, 1000); });
  socket.on('error', () => { /* close schedules the bounded reconnect */ });
}
connect();

async function beginRequest(id: string, service: string, path: string, method: string, headers: Record<string, string>): Promise<void> {
  const publicPath = routePath(service, path);
  const route = classifyPairedRoute(publicPath, method, headers);
  if (!route || route.upstreamPath !== path) { send({ type: 'response_error', id, detail: 'connector route is outside the closed product table' }); return; }
  const maxBytes = route.service === 'runtime' && route.stream ? PAIRED_MAX_UPLOAD_BYTES : PAIRED_MAX_JSON_BYTES;
  if (headers['content-length'] && (!/^\d+$/.test(headers['content-length']) || Number(headers['content-length']) > maxBytes)) { send({ type: 'response_error', id, detail: 'request body exceeds local bound' }); return; }
  const targetPath = service === 'acp' ? path.replace(/^\/acp(?=\/|$)/, '') || '/' : path;
  const target = service === 'runtime'
    ? new URL(targetPath, endpoint)
    : service === 'compose'
      ? new URL(process.env.ASTRID_LOCAL_COMPOSE_URL || 'http://127.0.0.1:2222/api/astrid/generation/compose')
      : new URL(
        targetPath,
        `http://127.0.0.1:${service === 'acp'
          ? process.env.VITE_ASTRID_ACP_BRIDGE_PORT || '17335'
          : process.env.VITE_ASTRID_BRIDGE_PORT || endpoint.port}`,
      );
  const controller = new AbortController();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = !['GET', 'HEAD'].includes(method) ? new ReadableStream<Uint8Array>({ start(controllerValue) { streamController = controllerValue; } }) : undefined;
  requests.set(id, { controller: streamController, abort: controller, cancelled: false, bytes: 0, maxBytes });
  const outgoing: Record<string, string> = { Accept: headers.accept || 'application/json' };
  for (const key of ['content-type', 'content-length', 'range', 'if-match', 'if-none-match', 'idempotency-key', 'x-filename', 'x-original-name', 'cache-control']) if (headers[key]) outgoing[key] = headers[key];
  const authorizationToken = service === 'acp' ? acpBridgeToken : token;
  if (!authorizationToken) {
    send({ type: 'response_error', id, detail: 'ACP bridge credential is not configured' });
    return;
  }
  outgoing.Authorization = `Bearer ${authorizationToken}`;
  // The local composer is an in-process loopback handler with the same
  // origin guard as the normal Vite proxy. The connector owns this
  // destination, so it supplies that exact local origin after authenticating
  // the paired request; browser Origin/Cookie/Authorization never cross the
  // tunnel.
  if (service === 'compose') outgoing.Origin = target.origin;
  if (service === 'acp' || service === 'astrid') {
    outgoing[ASTRID_BRIDGE_PROTOCOL_HEADER] = ASTRID_BRIDGE_PROTOCOL_VERSION;
  }
  try {
    const response = await fetch(target, { method, headers: outgoing, body, signal: controller.signal, ...(body ? { duplex: 'half' as const } : {}) });
    send({ type: 'response_start', id, status: response.status, headers: Object.fromEntries([...response.headers].filter(([key]) => !['set-cookie', 'connection', 'transfer-encoding'].includes(key))) });
    if (response.body) { const reader = response.body.getReader(); for (;;) { await pausedResponses.get(id); const next = await reader.read(); if (next.done) break; for (let offset = 0; offset < next.value.byteLength; offset += 40 * 1024) send({ type: 'response_chunk', id, data: Buffer.from(next.value.subarray(offset, Math.min(offset + 40 * 1024, next.value.byteLength))).toString('base64') }); } }
    send({ type: 'response_end', id });
  } catch (error) { send({ type: 'response_error', id, detail: error instanceof Error ? error.message : 'local request failed' }); }
  finally { requests.delete(id); }
}

process.on('SIGINT', () => { stopping = true; socket.close(1000, 'connector stopped'); });
process.on('SIGTERM', () => { stopping = true; socket.close(1000, 'connector stopped'); });
