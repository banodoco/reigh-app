import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from './contract-metadata.ts';
import { readWorkspaceRuntimeConfig } from '../../../scripts/runtime-discovery-proxy.mjs';

const baked = { actorId: 'baked-actor', realmId: 'baked-realm', runtimeInstanceId: 'baked-instance' };
const live = { actorId: 'live-actor', realmId: 'live-realm', runtimeInstanceId: 'live-instance' };
const scopes = ['handshake', 'projects:read', 'projects:write', 'objects:read', 'objects:write', 'tasks:read', 'tasks:write'];

function runtimeFetch(config: unknown, runtime = live) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), window.location.origin).pathname;
    calls.push(path);
    if (path === '/runtime-config/v1/workspace.json') {
      return config === null
        ? new Response('missing', { status: 404 })
        : new Response(JSON.stringify(config), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const body = path === '/api/runtime/v1/health'
      ? { status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_instance_id: runtime.runtimeInstanceId }
      : path === '/api/runtime/v1/handshake'
        ? { protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, actor_id: runtime.actorId, realm_id: runtime.realmId, session_id: 'test', scopes, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }
        : { realm_id: runtime.realmId, display_name: 'Test realm', version: 1, created_at: '2026-01-01T00:00:00Z' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('workspace Runtime launch binding', () => {
  it('loads runtime config before the first Runtime call and prefers it over baked ids', async () => {
    const { AstridRuntimeClient } = await import('./client.ts');
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID', baked.actorId);
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID', baked.realmId);
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID', baked.runtimeInstanceId);
    const calls = runtimeFetch({ schemaVersion: 1, endpoint: 'http://127.0.0.1:17890', ...live });
    const first = new AstridRuntimeClient();
    const second = new AstridRuntimeClient();
    await expect(first.ensureSession()).resolves.toBeTruthy();
    await expect(second.updateProject('project', 'test-key', 1, undefined, {})).resolves.toBeTruthy();
    expect(calls[0]).toBe('/runtime-config/v1/workspace.json');
    expect(calls).toContain('/api/runtime/v1/handshake');
    expect(calls.filter((path) => path === '/runtime-config/v1/workspace.json')).toHaveLength(1);

    const restarted = { ...live, runtimeInstanceId: 'restarted-instance' };
    const restartCalls = runtimeFetch({ schemaVersion: 1, endpoint: 'http://127.0.0.1:17891', ...restarted }, restarted);
    await expect(new AstridRuntimeClient().ensureSession())
      .rejects.toMatchObject({ code: 'runtime_incompatible' });
    expect(restartCalls).not.toContain('/runtime-config/v1/workspace.json');

    vi.resetModules(); // A new module instance models a full page reload.
    const { AstridRuntimeClient: ReloadedClient } = await import('./client.ts');
    await expect(new ReloadedClient().ensureSession()).resolves.toBeTruthy();
    expect(restartCalls.filter((path) => path === '/runtime-config/v1/workspace.json')).toHaveLength(1);
  });

  it('still refuses a handshake or instance that disagrees with runtime config', async () => {
    const { AstridRuntimeClient } = await import('./client.ts');
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID', baked.actorId);
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID', baked.realmId);
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID', baked.runtimeInstanceId);
    runtimeFetch({ schemaVersion: 1, endpoint: 'http://127.0.0.1:17890', ...live }, { ...live, runtimeInstanceId: 'other-instance' });
    await expect(new AstridRuntimeClient({ identityStore: new Map() }).ensureSession())
      .rejects.toMatchObject({ code: 'runtime_incompatible' });
  });

  it('uses baked ids when the runtime config is absent', async () => {
    const { AstridRuntimeClient } = await import('./client.ts');
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID', baked.actorId);
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID', baked.realmId);
    vi.stubEnv('VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID', baked.runtimeInstanceId);
    const calls = runtimeFetch(null, baked);
    await expect(new AstridRuntimeClient({ identityStore: new Map() }).ensureSession()).resolves.toBeTruthy();
    expect(calls[0]).toBe('/runtime-config/v1/workspace.json');
  });
});

it('serves only non-secret identity and rereads discovery after a restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'astrid-app-workspace-config-'));
  try {
    const root = join(directory, 'realm');
    mkdirSync(root);
    const credential = join(directory, 'credential.json');
    const discovery = join(directory, 'discovery.json');
    writeFileSync(credential, JSON.stringify({ version: 1, scope: 'astrid', actor_id: live.actorId, token: 'must-stay-private' }));
    writeFileSync(join(directory, 'catalog.json'), JSON.stringify({ selected_realm_id: live.realmId, realms: [{ realm_id: live.realmId, source_profile: 'astrid', data_root: root }] }));
    const writeDiscovery = (runtimeInstanceId: string) => writeFileSync(discovery, JSON.stringify({ endpoint: 'http://127.0.0.1:17890', credential_file: credential, active_realm: live.realmId, realm_root: root, runtime_instance_id: runtimeInstanceId }));
    writeDiscovery(live.runtimeInstanceId);
    expect(readWorkspaceRuntimeConfig(discovery)).toEqual({ schemaVersion: 1, endpoint: 'http://127.0.0.1:17890', ...live });
    writeDiscovery('restarted-instance');
    expect(readWorkspaceRuntimeConfig(discovery).runtimeInstanceId).toBe('restarted-instance');
    expect(JSON.stringify(readWorkspaceRuntimeConfig(discovery))).not.toContain('must-stay-private');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
