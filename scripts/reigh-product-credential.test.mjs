import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { WebSocketServer } from 'ws';

import {
  authenticateProductCredential,
  readProductCredential,
} from './reigh-product-credential.mjs';

const PRIVILEGE_SCOPES = new Set([
  'credentials:provision',
  'worker:execute',
  'worker:register',
]);

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

test('reads the canonical Runtime bootstrap product credential', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-product-credential-'));
  const value = await canonicalCredential(root);
  assert.deepEqual(readProductCredential(value.path), {
    token: value.token, assertedActorId: value.actorId, source: 'runtime-bootstrap',
  });
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

test('reads raw tokens and treats companion metadata only as an actor assertion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-product-credential-'));
  const rawToken = join(root, 'product.token');
  await writeFile(rawToken, 'opaque-product-token\n', { mode: 0o600 });
  assert.deepEqual(readProductCredential(rawToken), {
    token: 'opaque-product-token', assertedActorId: '', source: 'explicit-token',
  });

  const requiredScopes = [
    'handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write',
    'objects:read', 'objects:write',
  ];
  await writeFile(join(root, 'product.json'), JSON.stringify({
    version: 1, actor: 'product-from-metadata', scopes: requiredScopes,
  }), { mode: 0o600 });
  assert.deepEqual(readProductCredential(rawToken), {
    token: 'opaque-product-token', assertedActorId: 'product-from-metadata', source: 'explicit-token-metadata',
  });
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

test('launcher requires Runtime-authenticated canonical product identity before propagation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-paired-launcher-'));
  const discoveredCredential = await canonicalCredential(root);
  const productScopes = [
    'handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write',
    'objects:read', 'objects:write',
  ];
  const tokens = {
    valid: 'c'.repeat(64),
    owner: 'owner-token',
    admin: 'd'.repeat(64),
    provision: '1'.repeat(64),
    workerExecute: '2'.repeat(64),
    workerRegister: '3'.repeat(64),
    worker: 'worker-token',
    wrongActor: 'e'.repeat(64),
    insufficient: 'f'.repeat(64),
  };
  const identities = new Map([
    [tokens.valid, { actor_id: actor(tokens.valid), scopes: productScopes, heldScopes: productScopes }],
    [tokens.owner, { actor_id: 'owner', scopes: productScopes, heldScopes: ['admin', ...productScopes] }],
    // Runtime returns the negotiated request list, hiding this credential's
    // additional admin authority. The privilege probe must still reject it.
    [tokens.admin, { actor_id: actor(tokens.admin), scopes: productScopes, heldScopes: ['admin', ...productScopes] }],
    [tokens.provision, { actor_id: actor(tokens.provision), scopes: productScopes, heldScopes: ['credentials:provision', ...productScopes] }],
    [tokens.workerExecute, { actor_id: actor(tokens.workerExecute), scopes: productScopes, heldScopes: ['worker:execute', ...productScopes] }],
    [tokens.workerRegister, { actor_id: actor(tokens.workerRegister), scopes: productScopes, heldScopes: ['worker:register', ...productScopes] }],
    [tokens.worker, { actor_id: 'astrid-pack-host', scopes: ['handshake'], heldScopes: ['handshake', 'worker:execute'] }],
    [tokens.wrongActor, { actor_id: 'astrid-wrong', scopes: productScopes, heldScopes: productScopes }],
    [tokens.insufficient, { actor_id: actor(tokens.insufficient), scopes: productScopes.slice(0, -1), heldScopes: productScopes.slice(0, -1) }],
  ]);
  const observed = [];
  let rotateCredentialDuringProbe = false;
  let validCredentialPath = '';
  const server = createServer(async (request, response) => {
    const authorization = request.headers.authorization;
    observed.push({ url: request.url, method: request.method, authorization });
    if (request.url === '/v1/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', protocol: 'workspace.v1' }));
      return;
    }
    if (request.url === '/v1/handshake' && request.method === 'POST') {
      const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7) : '';
      const identity = identities.get(token);
      if (!identity) { response.writeHead(401).end(); return; }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const requestedScopes = requestBody.requested_scopes;
      if (
        Array.isArray(requestedScopes)
        && requestedScopes.length === 1
        && PRIVILEGE_SCOPES.has(requestedScopes[0])
      ) {
        const scope = requestedScopes[0];
        if (identity.heldScopes.includes(scope)) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ actor_id: identity.actor_id, scopes: [scope] }));
          return;
        }
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          code: 'unauthorized',
          message: 'credential cannot negotiate requested scopes',
          details: { scopes: [scope] },
        }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        actor_id: identity.actor_id,
        scopes: identity.scopes,
        protocol: 'workspace.v1',
        realm_id: '00000000-0000-4000-8000-000000000123',
      }));
      return;
    }
    if (request.url === '/v1/backup' && request.method === 'POST') {
      const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7) : '';
      const identity = identities.get(token);
      if (!identity) { response.writeHead(401).end(); return; }
      for await (const _chunk of request) { /* drain request body */ }
      if (rotateCredentialDuringProbe && token === tokens.valid) {
        const replacement = `${validCredentialPath}.replacement`;
        await writeFile(replacement, `${JSON.stringify({
          version: 1, scope: 'astrid', actor_id: actor(token), token,
        })}\n`, { mode: 0o600 });
        await rename(replacement, validCredentialPath);
        rotateCredentialDuringProbe = false;
      }
      if (identity.heldScopes.includes('admin')) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ code: 'protocol_error', message: 'intentionally invalid probe' }));
        return;
      }
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        code: 'unauthorized',
        message: 'credential lacks required scope',
        details: { scope: 'admin' },
      }));
      return;
    }
    response.writeHead(404).end();
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
    REIGH_PAIRED_RELAY_ORIGIN: 'https://relay.example.test',
    HOME: root,
  };
  const credentialRoot = await mkdtemp(join(tmpdir(), 'reigh-paired-credentials-'));
  const paths = {};
  for (const [name, token] of Object.entries(tokens)) {
    const path = join(credentialRoot, name === 'valid' ? 'astrid.json' : `${name}.token`);
    await writeFile(path, name === 'valid'
      ? `${JSON.stringify({ version: 1, scope: 'astrid', actor_id: actor(token), token })}\n`
      : `${token}\n`, { mode: 0o600 });
    paths[name] = path;
  }
  validCredentialPath = paths.valid;
  await writeFile(join(credentialRoot, 'owner.json'), JSON.stringify({
    actor: actor(tokens.owner),
    scopes: productScopes,
  }), { mode: 0o600 });
  const accepted = await runLauncher({
    ...base,
    ASTRID_PRODUCT_TOKEN_FILE: paths.valid,
    REIGH_PAIRED_PRODUCT_ACTOR: actor(tokens.valid),
  });
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.match(accepted.stdout, /workspace\.v1 runtime healthy/);
  rotateCredentialDuringProbe = true;
  const rotated = await runLauncher({
    ...base,
    ASTRID_PRODUCT_TOKEN_FILE: paths.valid,
    REIGH_PAIRED_PRODUCT_ACTOR: actor(tokens.valid),
  });
  assert.equal(rotated.code, 1);
  assert.match(rotated.stderr, /credential source changed during Runtime authentication/);
  const wrongOverride = await runLauncher({
    ...base,
    ASTRID_PRODUCT_TOKEN_FILE: paths.valid,
    REIGH_PAIRED_PRODUCT_ACTOR: 'astrid-wrong',
  });
  assert.equal(wrongOverride.code, 1);
  assert.match(wrongOverride.stderr, /explicit REIGH_PAIRED_PRODUCT_ACTOR/);
  for (const [name, expectedError, override = ''] of [
    ['owner', /reserved owner or Worker actor/, actor(tokens.owner)],
    ['admin', /absence of privileged scope admin/],
    ['provision', /absence of privileged scope credentials:provision/],
    ['workerExecute', /absence of privileged scope worker:execute/],
    ['workerRegister', /absence of privileged scope worker:register/],
    ['worker', /reserved owner or Worker actor/],
    ['wrongActor', /canonical product actor/],
    ['insufficient', /exact product scope set/],
  ]) {
    const rejected = await runLauncher({
      ...base,
      ASTRID_PRODUCT_TOKEN_FILE: paths[name],
      REIGH_PAIRED_PRODUCT_ACTOR: override,
    });
    assert.equal(rejected.code, 1, `${name}: ${rejected.stderr}`);
    assert.match(rejected.stderr, expectedError);
    assert.equal(rejected.stdout.includes(tokens[name]), false);
    assert.equal(rejected.stderr.includes(tokens[name]), false);
  }
  assert.ok(observed.some(({ url, authorization }) => (
    url === '/v1/health' && authorization === undefined
  )));
  assert.ok(observed.some(({ url, authorization }) => (
    url === '/v1/handshake' && authorization === `Bearer ${tokens.owner}`
  )), 'forged owner override must still reach authenticated identity validation');
});

test('real Runtime accepts product-only and rejects every pinned non-product authority without mutation', {
  skip: !process.env.REIGH_RUNTIME_SOURCE_ROOT,
}, async (t) => {
  const runtimeRoot = resolve(process.env.REIGH_RUNTIME_SOURCE_ROOT);
  const python = process.env.REIGH_RUNTIME_PYTHON || 'python3';
  const censusCheck = spawnSync(process.execPath, [
    resolve('scripts/quality/check-astrid-contract-successor.mjs'),
    '--json', '--runtime-root', runtimeRoot,
  ], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: { ...process.env, ASTRID_RUNTIME_SOURCE_ROOT: '' },
  });
  assert.equal(censusCheck.status, 0,
    `Runtime source root failed the bound census before fixture startup: ${censusCheck.stdout}${censusCheck.stderr}`);
  const root = await mkdtemp(join(tmpdir(), 'reigh-runtime-scope-credential-'));
  const tokens = {
    product: '8'.repeat(64),
    admin: '9'.repeat(64),
    provision: '7'.repeat(64),
    workerExecute: '6'.repeat(64),
    workerRegister: '5'.repeat(64),
  };
  const productScopes = [
    'handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write',
    'objects:read', 'objects:write',
  ];
  const script = [
    'import hashlib, json, os, signal, sys, time',
    'from pathlib import Path',
    'from runtime_protocol.daemon import RuntimeDaemon',
    'from runtime_protocol.store import RealmStore',
    'root = Path(sys.argv[1])',
    'realm = root / "realm"',
    'RealmStore.initialize(realm).close()',
    'daemon = RuntimeDaemon(realm, support_root=root / "support").start()',
    'credentials = json.loads(os.environ.pop("REIGH_TEST_CREDENTIALS"))',
    `product_scopes = ${JSON.stringify(productScopes)}`,
    'actors = {}',
    'for name, value in credentials.items():',
    '    token = value["token"]',
    '    actor = "astrid-" + hashlib.sha256(token.encode()).hexdigest()[:24]',
    '    actors[name] = actor',
    '    daemon.credentials.provision_static(actor, token, product_scopes + value["extra_scopes"])',
    'original_backup = daemon.service.backup',
    'def tracked_backup(*args, **kwargs):',
    '    (root / "backup-called").write_text("called")',
    '    return original_backup(*args, **kwargs)',
    'daemon.service.backup = tracked_backup',
    'print(json.dumps({"endpoint": daemon.endpoint, "actors": actors}), flush=True)',
    'stopping = False',
    'def stop(_signal, _frame):',
    '    global stopping',
    '    stopping = True',
    'signal.signal(signal.SIGTERM, stop)',
    'signal.signal(signal.SIGINT, stop)',
    'while not stopping:',
    '    time.sleep(0.05)',
    'daemon.stop()',
  ].join('\n');
  const child = spawn(python, ['-u', '-c', script, root], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      PYTHONPATH: [runtimeRoot, process.env.PYTHONPATH].filter(Boolean).join(':'),
      REIGH_TEST_CREDENTIALS: JSON.stringify({
        product: { token: tokens.product, extra_scopes: [] },
        admin: { token: tokens.admin, extra_scopes: ['admin'] },
        provision: { token: tokens.provision, extra_scopes: ['credentials:provision'] },
        workerExecute: { token: tokens.workerExecute, extra_scopes: ['worker:execute'] },
        workerRegister: { token: tokens.workerRegister, extra_scopes: ['worker:register'] },
      }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise((resolveClose) => child.once('close', resolveClose));
  });
  const ready = await new Promise((resolveReady, rejectReady) => {
    const lines = createInterface({ input: child.stdout });
    const timeout = setTimeout(() => rejectReady(new Error(`Runtime fixture timed out: ${stderr}`)), 10000);
    lines.once('line', (line) => {
      clearTimeout(timeout);
      lines.close();
      resolveReady(JSON.parse(line));
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      rejectReady(new Error(`Runtime fixture exited ${code}: ${stderr}`));
    });
  });
  assert.deepEqual(ready.actors, Object.fromEntries(
    Object.entries(tokens).map(([name, token]) => [name, actor(token)]),
  ));
  const credentialRoot = await mkdtemp(join(tmpdir(), 'reigh-runtime-scope-files-'));
  const credentials = {};
  for (const [name, token] of Object.entries(tokens)) {
    const path = join(credentialRoot, `${name}.json`);
    await writeFile(path, `${JSON.stringify({
      version: 1, scope: 'astrid', actor_id: actor(token), token,
    })}\n`, { mode: 0o600 });
    credentials[name] = readProductCredential(path);
  }
  const response = await fetch(new URL('/v1/handshake', ready.endpoint), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.admin}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      protocol: 'workspace.v1',
      client_name: 'reigh-runtime-backed-regression',
      client_version: '1',
      requested_scopes: productScopes,
    }),
  });
  assert.equal(response.status, 200);
  const negotiated = await response.json();
  assert.equal(negotiated.actor_id, actor(tokens.admin));
  assert.deepEqual([...negotiated.scopes].sort(), [...productScopes].sort());
  const product = await authenticateProductCredential(ready.endpoint, credentials.product);
  assert.equal(product.actorId, actor(tokens.product));
  for (const [name, expectedError] of [
    ['admin', /absence of privileged scope admin/],
    ['provision', /absence of privileged scope credentials:provision/],
    ['workerExecute', /absence of privileged scope worker:execute/],
    ['workerRegister', /absence of privileged scope worker:register/],
  ]) {
    await assert.rejects(
      authenticateProductCredential(ready.endpoint, credentials[name]),
      expectedError,
    );
  }
  assert.equal(await access(join(root, 'backup-called')).then(() => true, () => false), false,
    'invalid admin probe must not invoke Runtime backup');
  assert.equal(Object.values(tokens).some((token) => stderr.includes(token)), false);
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
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        Array.isArray(requestBody.requested_scopes)
        && requestBody.requested_scopes.length === 1
        && PRIVILEGE_SCOPES.has(requestBody.requested_scopes[0])
      ) {
        const scope = requestBody.requested_scopes[0];
        response.writeHead(401);
        response.end(JSON.stringify({
          code: 'unauthorized',
          message: 'credential cannot negotiate requested scopes',
          details: { scopes: [scope] },
        }));
        return;
      }
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
    if (request.url === '/v1/backup' && request.method === 'POST') {
      response.writeHead(401);
      response.end(JSON.stringify({
        code: 'unauthorized',
        message: 'credential lacks required scope',
        details: { scope: 'admin' },
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
