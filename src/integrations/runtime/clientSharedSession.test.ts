import { afterEach, describe, expect, it, vi } from 'vitest';
import { AstridRuntimeClient, RUNTIME_CLIENT_SCOPES } from './client.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from './contract-metadata.ts';

// The browser default transport is `fetch`; the App builds clients ad hoc, so
// every client on one base URL must negotiate health/handshake/realm once.
const REALM = 'realm-shared';
const INSTANCE = 'instance-shared';

function stubRuntime(counts: Record<string, number>, instance = () => INSTANCE) {
  const handler = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api\/[^/]+/, '');
    counts[path] = (counts[path] ?? 0) + 1;
    const body = path === '/v1/health'
      ? { status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1, runtime_instance_id: instance() }
      : path === '/v1/handshake'
        ? { protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 's', actor_id: 'astrid-product', realm_id: REALM, scopes: [...RUNTIME_CLIENT_SCOPES], capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }
        : path === '/v1/realm'
          ? { realm_id: REALM, display_name: 'r', version: 1, created_at: '2026-01-01T00:00:00Z' }
          : { items: [], next_cursor: null };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', handler);
  return handler;
}

afterEach(() => vi.unstubAllGlobals());

describe('shared Runtime session', () => {
  it('negotiates one handshake for every concurrent client on a base URL', async () => {
    const counts: Record<string, number> = {};
    stubRuntime(counts);
    const clients = Array.from({ length: 6 }, () => new AstridRuntimeClient({ baseUrl: '/api/shared-a' }));
    await Promise.all(clients.map((client) => client.ensureSession()));
    await Promise.all(clients.map((client) => client.listProjects()));
    expect(counts['/v1/handshake']).toBe(1);
    expect(counts['/v1/health']).toBe(1);
    expect(counts['/v1/realm']).toBe(1);
  });

  it('keeps separate base URLs separate', async () => {
    const counts: Record<string, number> = {};
    stubRuntime(counts);
    await Promise.all([
      new AstridRuntimeClient({ baseUrl: '/api/shared-b' }).ensureSession(),
      new AstridRuntimeClient({ baseUrl: '/api/shared-c' }).ensureSession(),
    ]);
    expect(counts['/v1/handshake']).toBe(2);
  });

  it('reconnect on one client renegotiates for all of them', async () => {
    const counts: Record<string, number> = {};
    stubRuntime(counts);
    const a = new AstridRuntimeClient({ baseUrl: '/api/shared-d' });
    const b = new AstridRuntimeClient({ baseUrl: '/api/shared-d' });
    await a.ensureSession();
    await a.reconnect();
    await b.ensureSession();
    expect(counts['/v1/handshake']).toBe(2);
  });

  it('a failed negotiation is not cached for later clients', async () => {
    const counts: Record<string, number> = {};
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    await expect(new AstridRuntimeClient({ baseUrl: '/api/shared-e' }).ensureSession()).rejects.toBeTruthy();
    stubRuntime(counts);
    await expect(new AstridRuntimeClient({ baseUrl: '/api/shared-e' }).ensureSession()).resolves.toBeTruthy();
    expect(counts['/v1/handshake']).toBe(1);
  });
});

describe('coalesced reads', () => {
  it('shares one request between concurrent identical reads and hands each caller its own copy', async () => {
    const counts: Record<string, number> = {};
    stubRuntime(counts);
    const [a, b, c] = await Promise.all(
      Array.from({ length: 3 }, () => new AstridRuntimeClient({ baseUrl: '/api/shared-f' }).listProjects()),
    );
    expect(counts['/v1/projects']).toBe(1);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    await new AstridRuntimeClient({ baseUrl: '/api/shared-f' }).listProjects();
    expect(counts['/v1/projects']).toBe(2);
  });

  it('does not let a read that starts after a write join one that predates it', async () => {
    const counts: Record<string, number> = {};
    const handler = stubRuntime(counts);
    const first = new AstridRuntimeClient({ baseUrl: '/api/shared-g' });
    await first.ensureSession();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const base = handler.getMockImplementation()!;
    handler.mockImplementation(async (input) => {
      if (String(input).endsWith('/v1/projects?limit=200')) await gate;
      return base(input);
    });
    const stale = first.listProjects();
    await new AstridRuntimeClient({ baseUrl: '/api/shared-g' }).updateProject('p', 'k', 1, undefined, {}).catch(() => undefined);
    const fresh = new AstridRuntimeClient({ baseUrl: '/api/shared-g' }).listProjects();
    release();
    await Promise.all([stale, fresh]);
    expect(counts['/v1/projects']).toBe(2);
  });
});
