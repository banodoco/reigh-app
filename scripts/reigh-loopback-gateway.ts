#!/usr/bin/env tsx
/** Hosted UI -> loopback gateway -> fixed loopback Runtime. No remote media relay. */
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_MAX_OBJECT_BYTES = 5 * 1024 ** 3;
export function resolveMaxObjectBytes(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_MAX_OBJECT_BYTES;
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > DEFAULT_MAX_OBJECT_BYTES) {
    throw new Error('RUNTIME_MAX_OBJECT_BYTES must be an integer from 1 to 5368709120');
  }
  return Number(raw);
}
export const PRODUCT_SCOPES = ['handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write', 'objects:read', 'objects:write'];
const REQUEST_HEADERS = new Set(['accept', 'content-type', 'content-length', 'range', 'if-match', 'if-none-match', 'idempotency-key', 'x-filename', 'x-original-name', 'x-expected-digest', 'x-media-width', 'x-media-height', 'x-media-duration-seconds']);
const RESPONSE_HEADERS = new Set(['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']);
const ACP_PROTOCOL_HEADER = 'X-Astrid-Bridge-Version';
const ACP_PROTOCOL_VERSION = 'v1';
const ID = '[^/?#]+';
const routes: Array<[string, RegExp]> = [
  ['GET', /^\/v1\/(health|realm|projects)$/], ['POST', /^\/v1\/(handshake|projects)$/],
  ['GET', new RegExp(`^/v1/projects/${ID}$`)], ['PATCH', new RegExp(`^/v1/projects/${ID}$`)],
  ['GET', new RegExp(`^/v1/projects/${ID}/(timelines|objects|generations|tasks|runs|documents|references|media-relations)$`)],
  ['POST', new RegExp(`^/v1/projects/${ID}/(timelines|objects|media-imports)$`)],
  ['GET', new RegExp(`^/v1/projects/${ID}/media-imports/${ID}$`)],
  ['POST', new RegExp(`^/v1/projects/${ID}/timelines/${ID}/(inspect|composition-revisions|replace-parent-media)$`)],
  ['GET', new RegExp(`^/v1/projects/${ID}/timelines/${ID}/(composition-revisions|revisions)/${ID}$`)],
  ['GET', new RegExp(`^/v1/projects/${ID}/shots/${ID}/revisions/${ID}$`)],
  ['GET', new RegExp(`^/v1/projects/${ID}/thumbnails/source-frame$`)],
  ['GET', new RegExp(`^/v1/objects/${ID}$`)], ['HEAD', new RegExp(`^/v1/objects/${ID}$`)],
  ['GET', new RegExp(`^/v1/(generations|variants|tasks|runs)/${ID}$`)],
  ['GET', new RegExp(`^/v1/generations/${ID}/variants$`)],
  ['GET', new RegExp(`^/v1/runs/${ID}/events$`)],
];
const acpRoutes: Array<[string, RegExp]> = [
  ['POST', /^\/acp\/connect$/],
  ['GET', new RegExp(`^/acp/projects/${ID}/chat$`)], ['PATCH', new RegExp(`^/acp/projects/${ID}/chat$`)],
  ['GET', new RegExp(`^/acp/projects/${ID}/chat/unassigned$`)],
  ['PATCH', new RegExp(`^/acp/projects/${ID}/chat/draft$`)],
  ['POST', new RegExp(`^/acp/projects/${ID}/chat/(sessions|associate|prompt)$`)],
  ['GET', new RegExp(`^/acp/${ID}/events$`)],
  ['POST', new RegExp(`^/acp/${ID}/(rpc|cancel|reconnect)$`)],
  ['DELETE', new RegExp(`^/acp/${ID}$`)],
];
function allowedTable(path: string, method: string, table: Array<[string, RegExp]>): boolean {
  if (path.length > 4096 || !path.startsWith('/') || /\\|\/\/|%2f|%5c|%2e|%25|#|:\/\//i.test(path)) return false;
  const pathname = path.split('?', 1)[0];
  if (pathname.split('/').some(part => part === '.' || part === '..')) return false;
  return table.some(([verb, pattern]) => verb === method && pattern.test(pathname));
}
export function allowedRoute(path: string, method: string): boolean {
  return allowedTable(path, method, routes);
}
export function allowedAcpRoute(path: string, method: string): boolean {
  return allowedTable(path, method, acpRoutes);
}
export function loopbackEndpoint(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Runtime must be a fixed http://127.0.0.1:PORT origin');
  return url;
}
export function createLoopbackGateway(config: { endpoint: string; token: string; origin: string; acpEndpoint?: string; acpToken?: string; capability?: string; expiresAt?: number; maxObjectBytes?: number; audit?: (entry: Record<string, unknown>) => void }) {
  const maxObjectBytes = resolveMaxObjectBytes(config.maxObjectBytes === undefined ? undefined : String(config.maxObjectBytes));
  const endpoint = loopbackEndpoint(config.endpoint);
  const acpEndpoint = config.acpEndpoint ? loopbackEndpoint(config.acpEndpoint) : null;
  if (acpEndpoint && !config.acpToken) throw new Error('ACP endpoint requires a dedicated ACP bridge token');
  const origin = new URL(config.origin);
  if (origin.protocol !== 'https:' || origin.origin !== config.origin) throw new Error('An exact hosted HTTPS origin is required');
  const capability = config.capability ?? randomBytes(32).toString('base64url');
  if (!/^[A-Za-z0-9_-]{32,}$/.test(capability)) throw new Error('Invalid session capability');
  const expiresAt = config.expiresAt ?? Date.now() + 8 * 60 * 60 * 1000;
  const prefix = `/session/${capability}/api/runtime`;
  const server = createServer((req, res) => {
    const reject = (status: number, error: string) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error })); };
    const address = server.address();
    if (!address || typeof address === 'string' || req.headers.host !== `127.0.0.1:${address.port}`) return reject(403, 'invalid_host');
    const path = req.url ?? '';
    const astridPrefix = `/session/${capability}/api/astrid`;
    const matchedPrefix = path.startsWith(`${prefix}/`) ? prefix : path.startsWith(`${astridPrefix}/`) ? astridPrefix : null;
    if (!matchedPrefix || Date.now() >= expiresAt) return reject(401, 'session_required');
    const upstreamPath = path.slice(matchedPrefix.length);
    const isAcp = /^\/acp(?:\/|$)/.test(upstreamPath.split('?', 1)[0]);
    const targetPath = isAcp ? upstreamPath.slice('/acp'.length) : upstreamPath;
    const target = isAcp ? acpEndpoint : endpoint;
    const targetToken = isAcp ? config.acpToken : config.token;
    const method = req.method ?? 'GET';
    const allowed = isAcp ? Boolean(target && allowedAcpRoute(upstreamPath, method)) : allowedRoute(upstreamPath, method);
    let responseBytes = 0;
    res.once('finish', () => config.audit?.({ at: new Date().toISOString(), method, path: upstreamPath.split('?', 1)[0], origin: req.headers.origin ?? null, upstream_hostname: '127.0.0.1', status: res.statusCode, response_bytes: responseBytes }));
    if (method !== 'OPTIONS' && !allowed) return reject(404, 'route_not_allowed');
    let acceptedOrigin = req.headers.origin === origin.origin;
    // Native media elements may omit Origin; their browser-generated Referer must match.
    if (!req.headers.origin && ['GET', 'HEAD'].includes(method)) {
      try { acceptedOrigin = typeof req.headers.referer === 'string' && new URL(req.headers.referer).origin === origin.origin; } catch { acceptedOrigin = false; }
    }
    if (!acceptedOrigin) return reject(403, 'hosted_origin_required');
    res.setHeader('Access-Control-Allow-Origin', origin.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Expose-Headers', [...RESPONSE_HEADERS].join(', '));
    if (method === 'OPTIONS') {
      const requestedMethod = String(req.headers['access-control-request-method'] ?? '');
      const preflightAllowed = isAcp ? Boolean(target && allowedAcpRoute(upstreamPath, requestedMethod)) : allowedRoute(upstreamPath, requestedMethod);
      if (!preflightAllowed) return reject(404, 'route_not_allowed');
      const requestedHeaders = String(req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
      if (requestedHeaders.some(header => !REQUEST_HEADERS.has(header))) return reject(403, 'header_not_allowed');
      res.setHeader('Access-Control-Allow-Methods', requestedMethod);
      res.setHeader('Access-Control-Allow-Headers', requestedHeaders.join(', '));
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.setHeader('Access-Control-Max-Age', '300');
      res.writeHead(204); res.end(); return;
    }
    if (req.headers.authorization || req.headers.cookie) return reject(403, 'browser_credentials_forbidden');
    const binaryUpload = method === 'POST' && /\/(objects|media-imports)(?:\?|$)/.test(upstreamPath);
    const maxBytes = isAcp ? 128 * 1024 : binaryUpload ? maxObjectBytes : 1024 * 1024;
    const declared = req.headers['content-length'];
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) return reject(413, 'payload_too_large');
    if (!target || !targetToken) return reject(503, isAcp ? 'acp_unavailable' : 'runtime_unavailable');
    const headers: Record<string, string> = { Authorization: `Bearer ${targetToken}` };
    if (isAcp) {
      headers[ACP_PROTOCOL_HEADER] = ACP_PROTOCOL_VERSION;
      // Authenticated gateway calls always select hosted local-only ACP policy.
      headers['X-Reigh-Local-Media-Only'] = '1';
    }
    for (const [key, value] of Object.entries(req.headers)) if (REQUEST_HEADERS.has(key) && typeof value === 'string') headers[key] = value;
    let upstreamResponse: import('node:http').IncomingMessage | undefined;
    let failed = false;
    const upstream = httpRequest({ hostname: '127.0.0.1', port: target.port, path: targetPath, method, headers }, response => {
      upstreamResponse = response;
      // Never permit an upstream redirect to move a media request off machine.
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.statusCode !== 304) {
        fail(502, 'upstream_redirect_forbidden');
        return;
      }
      for (const [key, value] of Object.entries(response.headers)) if (RESPONSE_HEADERS.has(key) && value !== undefined) res.setHeader(key, value);
      res.statusCode = response.statusCode ?? 502;
      response.on('data', chunk => { responseBytes += chunk.length; });
      response.on('error', () => res.destroy());
      response.on('aborted', () => res.destroy());
      response.pipe(res);
    });
    function fail(status: number, error: string) {
      if (failed) return;
      failed = true;
      req.unpipe(upstream);
      req.resume();
      upstreamResponse?.destroy();
      upstream.destroy();
      if (!res.headersSent) {
        res.removeHeader('Content-Length');
        reject(status, error);
      } else res.destroy();
    }
    upstream.setTimeout(isAcp ? 5 * 60_000 : 60_000, () => fail(504, 'upstream_timeout'));
    upstream.on('error', () => fail(isAcp ? 503 : 502, isAcp ? 'acp_unavailable' : 'runtime_unavailable'));
    let bytes = 0;
    req.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) fail(413, 'payload_too_large'); });
    req.on('error', () => fail(400, 'incomplete_request'));
    req.on('aborted', () => fail(400, 'incomplete_request'));
    res.on('close', () => {
      upstreamResponse?.destroy();
      upstream.destroy();
    });
    // Both pipes use Node's bounded stream buffers and propagate backpressure.
    req.pipe(upstream);
  });
  return { server, prefix, capability, expiresAt };
}
async function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
  for (const name of ['discovery', 'token-file', 'origin']) if (!args.get(name)) throw new Error(`--${name} is required`);
  const discovery = JSON.parse(readFileSync(args.get('discovery')!, 'utf8')) as Record<string, unknown>;
  const endpoint = loopbackEndpoint(String(discovery.endpoint));
  const raw = readFileSync(args.get('token-file')!, 'utf8').trim();
  const credential = raw.startsWith('{') ? JSON.parse(raw) as Record<string, unknown> : {};
  const token = raw.startsWith('{') ? credential.token : raw;
  if (typeof token !== 'string' || !token) throw new Error('Missing product token');
  const actor = args.get('actor') || (typeof credential.actor_id === 'string' ? credential.actor_id : typeof discovery.actor_id === 'string' ? discovery.actor_id : process.env.REIGH_PAIRED_PRODUCT_ACTOR);
  if (!actor) throw new Error('A scoped product actor is required (--actor or credential actor_id)');
  const response = await fetch(new URL('/v1/handshake', endpoint), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ protocol: 'workspace.v1', client_name: 'reigh-loopback-gateway', client_version: '1', requested_scopes: PRODUCT_SCOPES }), signal: AbortSignal.timeout(3000) });
  const identity = await response.json();
  if (!response.ok || identity.protocol !== 'workspace.v1' || identity.actor_id !== actor || ['owner', 'astrid-pack-host'].includes(identity.actor_id) || JSON.stringify([...(identity.scopes ?? [])].sort()) !== JSON.stringify([...PRODUCT_SCOPES].sort()) || (discovery.realm_id && discovery.realm_id !== identity.realm_id)) throw new Error('Scoped runtime product identity did not match');
  const acpEndpointRaw = args.get('acp-endpoint');
  const acpTokenFile = args.get('acp-token-file');
  let acpToken = process.env.ASTRID_ACP_BRIDGE_TOKEN?.trim();
  if (acpTokenFile) {
    const acpRaw = readFileSync(acpTokenFile, 'utf8').trim();
    const acpCredential = acpRaw.startsWith('{') ? JSON.parse(acpRaw) as Record<string, unknown> : {};
    acpToken = typeof acpCredential.token === 'string' ? acpCredential.token : acpRaw;
  }
  if (acpEndpointRaw && !acpToken) throw new Error('ACP endpoint requires ASTRID_ACP_BRIDGE_TOKEN or --acp-token-file');
  const auditPath = args.get('audit-log');
  const gateway = createLoopbackGateway({ endpoint: endpoint.origin, token, origin: args.get('origin')!, maxObjectBytes: resolveMaxObjectBytes(process.env.RUNTIME_MAX_OBJECT_BYTES), ...(acpEndpointRaw ? { acpEndpoint: acpEndpointRaw, acpToken } : {}), ...(auditPath ? { audit: (entry: Record<string, unknown>) => appendFileSync(auditPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 }) } : {}) });
  const port = Number(args.get('port') ?? '0');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  gateway.server.listen(port, '127.0.0.1', () => {
    const address = gateway.server.address();
    if (!address || typeof address === 'string') throw new Error('No loopback address');
    const base = `http://127.0.0.1:${address.port}${gateway.prefix}`;
    console.log(JSON.stringify({ base, expires_at: gateway.expiresAt, open_url: `${args.get('origin')}/#localRuntime=${encodeURIComponent(base)}`, realm_id: identity.realm_id, acp: Boolean(acpEndpointRaw) }));
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { gateway.server.close(); gateway.server.closeAllConnections(); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
