import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { WebSocketServer } from 'ws';

import { readProductCredential } from './reigh-product-credential.mjs';

function actor(token) {
  return `astrid-${createHash('sha256').update(token).digest('hex').slice(0, 24)}`;
}

async function canonicalCredential(root) {
  const token = 'a'.repeat(64);
  const actorId = actor(token);
  const path = join(root, 'astrid.json');
  await writeFile(path, `${JSON.stringify({ version: 1, scope: 'astrid', actor_id: actorId, token })}\n`, { mode: 0o600 });
  return { path, token, actorId };
}

test('accepts the canonical Runtime bootstrap product actor and exact override', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-product-credential-'));
  const value = await canonicalCredential(root);
  assert.deepEqual(readProductCredential(value.path), {
    token: value.token, actorId: value.actorId, source: 'runtime-bootstrap',
  });
  assert.equal(readProductCredential(value.path, value.actorId).actorId, value.actorId);
  assert.throws(
    () => readProductCredential(value.path, 'astrid-wrong'),
    /does not match the authenticated product actor/,
  );
});

test('rejects owner, Worker, admin, and malformed bootstrap metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-product-credential-'));
  for (const [name, value] of Object.entries({
    owner: { version: 1, actor: 'owner', scopes: ['admin'], token: 'owner-token' },
    worker: { version: 1, actor: 'astrid-pack-host', scopes: ['handshake'], token: 'worker-token' },
    admin: { version: 1, actor: 'product', scopes: ['admin'], token: 'admin-token' },
    forgedBootstrap: { version: 1, scope: 'astrid', actor_id: 'astrid-forged', token: 'b'.repeat(64) },
  })) {
    const path = join(root, `${name}.json`);
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
    assert.throws(() => readProductCredential(path), /canonical Runtime bootstrap Astrid credential/);
  }
});

test('validates raw token product metadata and explicit actor overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-product-credential-'));
  const rawToken = join(root, 'product.token');
  await writeFile(rawToken, 'opaque-product-token\n', { mode: 0o600 });
  assert.throws(() => readProductCredential(rawToken), /raw token requires/);
  assert.deepEqual(readProductCredential(rawToken, 'product-explicit'), {
    token: 'opaque-product-token', actorId: 'product-explicit', source: 'explicit-token-override',
  });

  const requiredScopes = [
    'handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write',
    'objects:read', 'objects:write',
  ];
  await writeFile(join(root, 'product.json'), JSON.stringify({
    version: 1, actor: 'product-from-metadata', scopes: requiredScopes,
  }), { mode: 0o600 });
  assert.deepEqual(readProductCredential(rawToken), {
    token: 'opaque-product-token', actorId: 'product-from-metadata', source: 'explicit-token-metadata',
  });

  for (const [name, metadata] of Object.entries({
    owner: { actor: 'owner', scopes: ['admin'] },
    worker: { actor: 'astrid-pack-host', scopes: ['handshake'] },
    admin: { actor: 'product-admin', scopes: ['admin', ...requiredScopes] },
    insufficient: { actor: 'product-limited', scopes: ['handshake'] },
  })) {
    const tokenPath = join(root, `${name}.token`);
    await writeFile(tokenPath, `${name}-token\n`, { mode: 0o600 });
    await writeFile(join(root, `${name}.json`), JSON.stringify({ version: 1, ...metadata }), { mode: 0o600 });
    assert.throws(() => readProductCredential(tokenPath), /forbidden/);
  }
});

function runLauncher(env) {
  const child = spawn(process.execPath, [resolve('scripts/dev-local-workspace.mjs'), '--check', '--paired'], {
    cwd: resolve('.'), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return new Promise((resolveResult) => child.on('close', (code) => resolveResult({ code, stdout, stderr })));
}

test('paired launcher selects one explicit product credential for its health check', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-paired-launcher-'));
  const discoveredCredential = await canonicalCredential(root);
  const overrideRoot = await mkdtemp(join(tmpdir(), 'reigh-paired-override-'));
  const overrideToken = 'c'.repeat(64);
  const overrideActor = actor(overrideToken);
  const overrideCredentialPath = join(overrideRoot, 'astrid.json');
  await writeFile(overrideCredentialPath, `${JSON.stringify({
    version: 1, scope: 'astrid', actor_id: overrideActor, token: overrideToken,
  })}\n`, { mode: 0o600 });
  const observedAuthorization = [];
  const server = createServer((request, response) => {
    if (request.url !== '/v1/health') { response.writeHead(404).end(); return; }
    observedAuthorization.push(request.headers.authorization);
    if (request.headers.authorization !== `Bearer ${overrideToken}`) {
      response.writeHead(401).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', protocol: 'workspace.v1' }));
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const discovery = join(root, 'discovery.json');
  await writeFile(discovery, JSON.stringify({
    endpoint: `http://127.0.0.1:${address.port}`,
    credential_file: discoveredCredential.path,
  }));
  const base = {
    ASTRID_WORKSPACE_DISCOVERY: discovery,
    ASTRID_PRODUCT_TOKEN_FILE: overrideCredentialPath,
    REIGH_PAIRED_RELAY_ORIGIN: 'https://relay.example.test',
    HOME: root,
  };
  const accepted = await runLauncher({ ...base, REIGH_PAIRED_PRODUCT_ACTOR: '' });
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.match(accepted.stdout, /workspace\.v1 runtime healthy/);
  assert.deepEqual(observedAuthorization, [`Bearer ${overrideToken}`]);
  const rejected = await runLauncher({ ...base, REIGH_PAIRED_PRODUCT_ACTOR: 'astrid-wrong' });
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /does not match the authenticated product actor/);
});

test('paired connector authenticates canonical product actor and sends relay hello', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-paired-connector-'));
  const credential = await canonicalCredential(root);
  const realmId = '00000000-0000-4000-8000-000000000123';
  const runtimeRequests = [];
  const runtime = createServer(async (request, response) => {
    runtimeRequests.push({ url: request.url, authorization: request.headers.authorization });
    if (request.headers.authorization !== `Bearer ${credential.token}`) {
      response.writeHead(401).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/health') {
      response.end(JSON.stringify({
        status: 'ok', protocol: 'workspace.v1',
        schema_digest: 'sha256:0fbdd963346d4ec18fcd79f17d3933bcb65f4a5131d1efef94c2d8a0c8b12369',
      }));
      return;
    }
    if (request.url === '/v1/handshake' && request.method === 'POST') {
      response.end(JSON.stringify({
        realm_id: realmId,
        protocol: 'workspace.v1',
        schema_digest: 'sha256:0fbdd963346d4ec18fcd79f17d3933bcb65f4a5131d1efef94c2d8a0c8b12369',
        component_manifest_sha256: 'sha256:7bf3998ea268bc15b2d93397a8c20c627ada8293e07d375cc1c72d515fffe203',
        actor_id: credential.actorId,
        scopes: [
          'handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write',
          'objects:read', 'objects:write',
        ],
        capabilities: ['execution_binding.targeted.v1'],
      }));
      return;
    }
    if (request.url === '/v1/realm') {
      response.end(JSON.stringify({ realm_id: realmId }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolveListen) => runtime.listen(0, '127.0.0.1', resolveListen));
  t.after(() => runtime.close());
  const runtimeAddress = runtime.address();
  assert.ok(runtimeAddress && typeof runtimeAddress !== 'string');

  const relayHttp = createServer();
  const relay = new WebSocketServer({ server: relayHttp, path: '/api/pairing/connector' });
  await new Promise((resolveListen) => relayHttp.listen(0, '127.0.0.1', resolveListen));
  t.after(() => { relay.close(); relayHttp.close(); });
  const relayAddress = relayHttp.address();
  assert.ok(relayAddress && typeof relayAddress !== 'string');

  const discovery = join(root, 'discovery.json');
  await writeFile(discovery, JSON.stringify({
    endpoint: `http://127.0.0.1:${runtimeAddress.port}`,
    credential_file: credential.path,
  }));
  const hello = new Promise((resolveHello, rejectHello) => {
    const timeout = setTimeout(() => rejectHello(new Error('connector hello timed out')), 5000);
    relay.on('connection', (socket) => socket.once('message', (raw) => {
      clearTimeout(timeout);
      resolveHello(JSON.parse(raw.toString()));
    }));
  });
  const child = spawn(resolve('node_modules/.bin/tsx'), [
    resolve('scripts/reigh-local-connector.ts'), '--discovery', discovery,
    '--relay-origin', `http://127.0.0.1:${relayAddress.port}`,
    '--state', join(root, 'connector-state.json'),
  ], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      HOME: root,
      ASTRID_PRODUCT_TOKEN_FILE: '',
      REIGH_PAIRED_PRODUCT_ACTOR: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  const message = await hello;
  assert.equal(message.type, 'connector_hello', stderr);
  assert.equal(message.realm_id, realmId);
  assert.match(message.connector_id, /^reigh-[0-9a-f]{32}$/);
  assert.ok(typeof message.connector_secret === 'string' && message.connector_secret.length > 20);
  assert.ok(runtimeRequests.filter(({ url }) => url === '/v1/handshake').length >= 2);
  assert.ok(runtimeRequests.every(({ authorization }) => authorization === `Bearer ${credential.token}`));
  child.kill('SIGTERM');
  await new Promise((resolveClose) => child.once('close', resolveClose));
});
