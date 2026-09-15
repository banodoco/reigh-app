import type { IncomingHttpHeaders } from 'node:http';

export const PAIRED_MAX_FRAME_BYTES = 64 * 1024;
export const PAIRED_MAX_JSON_BYTES = 128 * 1024;
export const PAIRED_MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export const PAIRED_REQUEST_TIMEOUT_MS = 30_000;

export type PairedService = 'runtime' | 'astrid' | 'acp' | 'compose';

export interface PairedRoute {
  readonly service: PairedService;
  readonly upstreamPath: string;
  readonly stream: boolean;
}

const denied = [
  /^\/v1\/(doctor|backup|restore|export)(?:\/|$)/,
  /^\/v1\/realm\/(?:tombstone|recover|purge|replace)(?:\/|$)/,
  /^\/v1\/(?:tasks\/claim|attempts\/|recovery\/|executors(?:\/|$)|capabilities(?:\/|$))/,
];

// This table intentionally describes the product's generated client surface,
// rather than accepting arbitrary Runtime paths. Dynamic ids are checked again
// by Runtime; the relay only decides whether the route belongs to the product.
const runtimeRoutes = [
  /^\/(?:v1\/(?:health|handshake|realm))$/,
  /^\/v1\/projects(?:\/[^/?#]+)?(?:\/(?:documents|timeline-documents|timelines|objects|media-relations|generations|tasks|runs|references|reference-links)(?:\/[^/?#]+)?(?:\/(?:archive|recover|associations|primary|export))?)?(?:\?[^#]*)?$/,
  /^\/v1\/projects\/selection(?:\?[^#]*)?$/,
  /^\/v1\/timelines\/[^/?#]+(?:\/document)?(?:\?[^#]*)?$/,
  /^\/v1\/documents\/[^/?#]+(?:\?[^#]*)?$/,
  /^\/v1\/tasks\/[^/?#]+(?:\/(?:cancel|retry|managed-outputs))?(?:\?[^#]*)?$/,
  /^\/v1\/runs\/[^/?#]+(?:\/(?:cancel|retry|events))?(?:\?[^#]*)?$/,
  /^\/v1\/events(?:\?[^#]*)?$/,
  /^\/v1\/objects(?:\/[^/?#]+)?(?:\?[^#]*)?$/,
  /^\/v1\/generations\/[^/?#]+(?:\/variants)?(?:\?[^#]*)?$/,
  /^\/v1\/variants\/[^/?#]+(?:\?[^#]*)?$/,
  /^\/v1\/managed-outputs\/[^/?#]+(?:\/(?:export|adopt|lifecycle))?(?:\?[^#]*)?$/,
  /^\/v1\/shots\/[^/?#]+(?:\/text-bindings)?(?:\?[^#]*)?$/,
];

const astridRoutes = [
  /^\/v1\/(?:health|handshake|realm)$/,
  /^\/v1\/capabilities(?:\?[^#]*)?$/,
  /^\/v1\/(?:projects|tasks|runs|objects|generations|variants|managed-outputs|timelines|documents)(?:\/[^/?#]+){0,5}(?:\?[^#]*)?$/,
];

const acpRoutes = [
  /^\/acp\/(?:health|connect)$/,
  /^\/acp\/[A-Za-z0-9_-]{1,128}\/(?:rpc|cancel|events|reconnect)$/,
  /^\/acp\/[A-Za-z0-9_-]{1,128}$/,
];

export function isSafeForwardPath(path: string): boolean {
  if (!path || path.length > 4096 || !path.startsWith('/') || path.includes('://')) return false;
  if (path.includes('\\') || path.includes('//') || /%2f|%5c|%2e/i.test(path)) return false;
  const pathname = path.split('?', 1)[0];
  return !pathname.split('/').some((segment) => segment === '.' || segment === '..');
}

export function classifyPairedRoute(
  requestPath: string,
  method: string,
  headers: IncomingHttpHeaders | Readonly<Record<string, string | string[] | undefined>> = {},
): PairedRoute | null {
  if (!['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'].includes(method.toUpperCase())) return null;
  if (!isSafeForwardPath(requestPath)) return null;
  const normalizedMethod = method.toUpperCase();
  const contentLength = headers['content-length'];
  if (Array.isArray(contentLength) || (contentLength && !/^\d+$/.test(String(contentLength)))) return null;
  if (requestPath === '/api/astrid/generation/compose') {
    return normalizedMethod === 'POST' ? { service: 'compose', upstreamPath: requestPath, stream: false } : null;
  }
  if (requestPath.startsWith('/api/astrid/acp')) {
    const upstreamPath = requestPath.replace(/^\/api\/astrid/, '');
    return acpRoutes.some((route) => route.test(upstreamPath))
      ? { service: 'acp', upstreamPath, stream: false }
      : null;
  }
  if (requestPath.startsWith('/api/runtime')) {
    const upstreamPath = requestPath.replace(/^\/api\/runtime/, '') || '/';
    if (!runtimeRoutes.some((route) => route.test(upstreamPath)) || denied.some((route) => route.test(upstreamPath))) return null;
    const stream = /^\/(?:v1\/objects|v1\/projects\/[^/]+\/objects|v1\/managed-outputs\/[^/]+\/export)/.test(upstreamPath);
    return { service: 'runtime', upstreamPath, stream };
  }
  if (requestPath.startsWith('/api/astrid')) {
    const upstreamPath = requestPath.replace(/^\/api\/astrid/, '') || '/';
    if (!astridRoutes.some((route) => route.test(upstreamPath))) return null;
    return { service: 'astrid', upstreamPath, stream: false };
  }
  return null;
}

export const PAIRED_FORWARD_HEADERS = new Set([
  'accept', 'content-type', 'content-length', 'content-range', 'range', 'if-match',
  'if-none-match', 'etag', 'idempotency-key', 'x-filename', 'x-original-name',
  'x-expected-version', 'cache-control', 'accept-encoding',
]);

export function forwardHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!PAIRED_FORWARD_HEADERS.has(lower) || Array.isArray(value) || value === undefined) continue;
    if (lower === 'x-output-binding') continue;
    result[name] = value;
  }
  return result;
}
