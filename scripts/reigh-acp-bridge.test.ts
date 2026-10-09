import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReighAcpHttpServer, resolveReighAcpBridgeConfig, assertLocalMediaOnly } from './reigh-acp-bridge.ts';
import { createLoopbackGateway } from './reigh-loopback-gateway.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectChatRegistry } from './reigh-project-chat.ts';
import { ApiError, type Project } from '../src/integrations/runtime/generated.ts';
import type { AcpProcessHostCallbacks } from '../src/tools/video-editor/runtime/processes/acpProcessHost.ts';

const mediaForms = [
  { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
  { type: 'audio', data: 'aGVsbG8=', mimeType: 'audio/wav' },
  { type: 'resource', resource: { uri: 'local:video', mimeType: 'video/mp4', blob: 'aGVsbG8=' } },
  { type: 'resource', resource: { uri: 'local:unknown', blob: 'aGVsbG8=' } },
  { type: 'resource', resource: { uri: 'local:nested', text: 'context', _meta: { embedded: { type: 'resource', resource: { uri: 'local:audio', mimeType: 'audio/wav', blob: 'aGVsbG8=' } } } } },
  { type: 'resource_link', name: 'inline', uri: 'data:video/mp4;base64,aGVsbG8=' },
];
const textMetadata = [
  { type: 'text', text: 'Keep image/audio/video media local. Use object id obj_a.' },
  { type: 'resource', resource: { uri: 'workspace:timeline_a', mimeType: 'application/json', text: '{"project_id":"p"}' } },
  { type: 'resource_link', name: 'video', mimeType: 'video/mp4', uri: 'workspace:object_a', _meta: { project_id: 'p' } },
];

test('ACP uses dedicated token, legacy fallback, explicit hosted-only policy and known binary forms', () => {
  const env = { ASTRID_BRIDGE_TOKEN: 'runtime', ASTRID_ACP_BRIDGE_TOKEN: 'acp', ASTRID_ACP_CWD: '/tmp/project' };
  assert.equal(resolveReighAcpBridgeConfig(env).token, 'acp');
  assert.equal(resolveReighAcpBridgeConfig({ ...env, ASTRID_ACP_BRIDGE_TOKEN: undefined }).token, 'runtime');
  assert.equal(resolveReighAcpBridgeConfig(env).localMediaOnly, false);
  assert.equal(resolveReighAcpBridgeConfig({ ...env, ASTRID_ACP_LOCAL_MEDIA_ONLY: '1' }).localMediaOnly, true);
  assert.throws(() => resolveReighAcpBridgeConfig({ ...env, ASTRID_ACP_LOCAL_MEDIA_ONLY: 'yes' }));
  for (const part of mediaForms) assert.throws(() => assertLocalMediaOnly({ prompt: [part] }), /Hosted local-only ACP/);
  assert.doesNotThrow(() => assertLocalMediaOnly({ prompt: textMetadata }));
});

async function listen(server: import('node:http').Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

test('gateway and real HTTP bridge enforce RPC and project policy and preserve project session/config ownership', async () => {
  const claimDirectory = mkdtempSync(join(tmpdir(), 'reigh-http-chat-'));
  const projects = new Map<string, Project>(['p1', 'p2'].map(project_id => [project_id, {
    project_id, realm_id: 'test-realm', slug: project_id, name: project_id,
    metadata: {}, version: 1, created_at: '', updated_at: '',
  }]));
  const store = {
    getProject: async (id: string) => { const project = projects.get(id); assert.ok(project); return structuredClone(project); },
    listProjects: async () => ({ items: structuredClone([...projects.values()]), next_cursor: null }),
    updateProject: async (id: string, _key: string, version: number, _name?: string, metadata?: Record<string, unknown>) => {
      const project = projects.get(id); assert.ok(project);
      if (project.version !== version) throw new ApiError(409, 'version_conflict', 'changed');
      const updated = { ...project, metadata: metadata ?? project.metadata, version: version + 1 };
      projects.set(id, updated); return structuredClone(updated);
    },
  };
  const registry = new ProjectChatRegistry(store, 'http-test', Date.now, claimDirectory);
  const forwarded: Array<{ method: string; params: unknown }> = [];
  const configOptions = [
    { id: 'model', options: [{ value: 'model-a' }] },
    { id: 'thinking', options: [{ value: 'high' }] },
  ];
  let callbacks: AcpProcessHostCallbacks = {};
  let disposed = 0;
  const { server, bridge } = createReighAcpHttpServer({
    config: { token: 'dedicated', port: 0, cwd: '/tmp/local' },
    chatRegistry: registry,
    idFactory: (() => { let next = 0; return () => `c${++next}`; })(),
    hostFactory: options => {
      const hostCallbacks = options.callbacks ?? {};
      callbacks = hostCallbacks;
      if (options.env) {
        assert.equal(options.env.PI_BASH_NO_LOGIN, '1');
        assert.match(options.env.PI_CONFIG_FILES!, /reigh-acp-local-only.yml$/);
      }
      return {
        initialize: async () => ({ protocolVersion: 1 }),
        request: async (method: string, params: unknown) => {
          forwarded.push({ method, params });
          if (method === 'session/new') return { sessionId: 's1', configOptions };
          if (method === 'session/resume') return { sessionId: (params as { sessionId: string }).sessionId, configOptions };
          if (method === 'session/list') return { sessions: [{ sessionId: 'unassigned' }] };
          if (method !== 'session/prompt') return {};
          hostCallbacks.onNotification?.({ jsonrpc: '2.0', method: 'session/update', params: { text: 'CPU in progress' } });
          await new Promise(resolve => setTimeout(resolve, 60));
          return { stopReason: 'end_turn' };
        },
        cancel: async () => {},
        dispose: async () => { disposed++; },
      } as never;
    },
  });
  let gateway: ReturnType<typeof createLoopbackGateway> | undefined;
  try {
    const acpBase = await listen(server);
    gateway = createLoopbackGateway({ endpoint: acpBase, token: 'runtime', origin: 'https://hosted.test', acpEndpoint: acpBase, acpToken: 'dedicated' });
    const gatewayBase = await listen(gateway.server);
    const base = gatewayBase + gateway.prefix.replace('/api/runtime', '/api/astrid') + '/acp';
    const call = (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => fetch(base + path, {
      method, headers: { Origin: 'https://hosted.test', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // Direct follow-up deliberately omits the hosted-policy header.
    const direct = (path: string, body: unknown) => fetch(acpBase + path, {
      method: 'POST', headers: { Authorization: 'Bearer dedicated', 'X-Astrid-Bridge-Version': 'v1', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await fetch(acpBase + '/health', { headers: { Authorization: 'Bearer runtime', 'X-Astrid-Bridge-Version': 'v1' } })).status, 401);
    assert.equal((await call('/connect', {})).status, 200);
    const hostedCallbacks = callbacks;
    const created = await call('/projects/p1/chat/sessions', { connection_id: 'c1', mode: 'ensure', operation_id: 'create-one' });
    assert.equal(created.status, 200);
    assert.equal((await created.json()).operation_session_id, 's1');
    assert.equal((await registry.get('p1')).selected_session_id, 's1');
    const rpc = (connection: string, configId: string, value: string, sessionId = 's1') => call(`/${connection}/rpc`, { method: 'session/set_config_option', params: { sessionId, configId, value } });
    assert.equal((await rpc('c1', 'model', 'model-a')).status, 200);
    assert.equal((await rpc('c1', 'thinking', 'high')).status, 200);
    const protectedState = await registry.get('p1');
    const forwardedBeforeMedia = forwarded.length;
    for (const form of mediaForms) {
      for (const response of [
        await call('/c1/rpc', { method: 'session/prompt', params: { sessionId: 's1', prompt: [form] } }),
        await call('/projects/p1/chat/prompt', { connection_id: 'c1', session_id: 's1', prompt: [form] }),
        await direct('/projects/p1/chat/prompt', { connection_id: 'c1', session_id: 's1', prompt: [form] }),
        await direct('/projects/p1/chat/sessions', { connection_id: 'c1', mode: 'new', operation_id: 'blocked', _meta: { form } }),
        await direct('/projects/p1/chat/associate', { connection_id: 'c1', session_id: 'unassigned', expected_revision: protectedState.revision, _meta: { form } }),
        await call('/projects/p1/chat/draft', { expected_revision: 0, text: 'blocked', queued_messages: [{ id: 'q', text: 'queued', session_id: 's1', attachments: [form] }] }, 'PATCH'),
      ]) {
        assert.equal(response.status, 415); assert.equal((await response.json()).error, 'local_media_required');
      }
    }
    assert.equal(forwarded.length, forwardedBeforeMedia);
    assert.deepEqual(await registry.get('p1'), protectedState);
    assert.equal((await call('/projects/p2/chat/prompt', { connection_id: 'c1', session_id: 's1', prompt: textMetadata })).status, 403);
    assert.equal((await call('/projects/p2/chat/associate', { connection_id: 'c1', session_id: 's1', expected_revision: 0 })).status, 409);
    assert.equal(forwarded.length, forwardedBeforeMedia);
    const pending = call('/projects/p1/chat/prompt', { connection_id: 'c1', session_id: 's1', prompt: textMetadata });
    await new Promise(resolve => setTimeout(resolve, 20));
    const events = await (await call('/c1/events')).json();
    assert.equal(events.disconnected, false); assert.equal(events.notifications.length, 1);
    assert.equal((await pending).status, 200);
    assert.deepEqual((forwarded[forwarded.length - 1].params as { prompt: unknown }).prompt, textMetadata);
    assert.equal((await direct('/projects/p1/chat/prompt', { connection_id: 'c1', session_id: 's1', prompt: textMetadata })).status, 200);
    assert.equal((await call('/c1/rpc', { method: 'session/prompt', params: { sessionId: 's1', prompt: textMetadata } })).status, 200);
    assert.deepEqual((forwarded[forwarded.length - 1].params as { prompt: unknown }).prompt, textMetadata);
    // Reconnect the saved project session through ensure/resume. Its advertised
    // options must belong to this new connection, not only the creating one.
    assert.equal((await call('/connect', {})).status, 200);
    assert.equal((await rpc('c2', 'model', 'model-a')).status, 400);
    const resumed = await call('/projects/p1/chat/sessions', { connection_id: 'c2', mode: 'ensure', operation_id: 'resume-one' });
    assert.equal(resumed.status, 200); assert.equal((await resumed.json()).operation_session_id, 's1');
    assert.equal(forwarded.filter(item => item.method === 'session/new').length, 1);
    assert.equal(forwarded.filter(item => item.method === 'session/resume').length, 1);
    assert.equal((await rpc('c2', 'model', 'model-a')).status, 200);
    assert.equal((await rpc('c2', 'thinking', 'high')).status, 200);
    const beforeBadConfig = forwarded.length;
    assert.equal((await rpc('c2', 'model', 'unadvertised')).status, 400);
    assert.equal((await rpc('c2', 'thinking', 'high', 'foreign')).status, 400);
    assert.equal(forwarded.length, beforeBadConfig);
    // Separately configured non-hosted ACP preserves supported media prompts.
    assert.equal((await direct('/connect', {})).status, 200);
    assert.equal((await call('/c3/rpc', { method: 'session/list', params: {} })).status, 409);
    assert.equal((await call('/projects/p1/chat/prompt', { connection_id: 'c3', session_id: 's1', prompt: textMetadata })).status, 409);
    assert.equal((await direct('/c3/rpc', { method: 'session/prompt', params: { sessionId: 's1', prompt: [mediaForms[0]] } })).status, 200);
    assert.equal((await direct('/projects/p1/chat/prompt', { connection_id: 'c3', session_id: 's1', prompt: [mediaForms[0]] })).status, 200);
    hostedCallbacks.onNotification?.({ jsonrpc: '2.0', method: 'session/update', params: { text: 'x'.repeat(1024 * 1024) } });
    const overflow = await (await call('/c1/events')).json();
    assert.equal(overflow.disconnected, true); assert.equal(overflow.notifications[0].params.code, 'acp_event_overflow');
    assert.equal(disposed, 1);
    assert.equal((await call('/c1/reconnect', {})).status, 502);
    assert.equal((await call('/c1', undefined, 'DELETE')).status, 200);
  } finally {
    try { await bridge.close(); }
    finally {
      const servers = [server, ...(gateway ? [gateway.server] : [])];
      for (const owned of servers) owned.closeAllConnections();
      try { await Promise.all(servers.map(owned => new Promise<void>(resolve => owned.close(() => resolve())))); }
      finally { rmSync(claimDirectory, { recursive: true, force: true }); }
    }
  }
});
