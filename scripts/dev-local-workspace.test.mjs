import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it, test } from 'node:test';
import { readGeneratedSchemaDigest } from './runtime-schema-guard.mjs';

import {
  parseDevLocalWorkspaceArgs,
  validatePreviewOutputDirectory,
  viteChildArgs,
  resolveWorkspaceDiscoveryPath,
} from './dev-local-workspace-options.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function emittedDirectory({ entry = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'astrid-dev-local-preview-test-'));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<!doctype html>');
  if (entry) await writeFile(join(directory, 'assets', 'index-test.js'), '');
  return directory;
}

describe('dev-local preview options', () => {
  it('parses preview mode only with an explicit output directory', () => {
    assert.deepEqual(parseDevLocalWorkspaceArgs(['--preview', '--preview-dir', '/tmp/emitted']), {
      checkOnly: false,
      paired: false,
      resetPairing: false,
      preview: true,
      previewDir: '/tmp/emitted',
    });
    assert.throws(
      () => parseDevLocalWorkspaceArgs(['--preview']),
      /--preview requires --preview-dir/,
    );
    assert.throws(
      () => parseDevLocalWorkspaceArgs(['--preview-dir', '/tmp/emitted']),
      /--preview requires --preview-dir/,
    );
    assert.equal(parseDevLocalWorkspaceArgs(['--historical-ignored-arg']).preview, false);
  });

  it('rejects missing, relative, and non-emitted output directories', async () => {
    assert.throws(
      () => validatePreviewOutputDirectory('relative/dist'),
      /must be an absolute path/,
    );
    assert.throws(
      () => validatePreviewOutputDirectory('/tmp/astrid-no-such-preview-output'),
      /does not exist/,
    );
    const missingEntry = await emittedDirectory({ entry: false });
    assert.throws(
      () => validatePreviewOutputDirectory(missingEntry),
      /missing assets\/index-\*\.js/,
    );
  });

  it('accepts an emitted layout and canonicalizes its explicit directory', async () => {
    const directory = await emittedDirectory();
    assert.equal(validatePreviewOutputDirectory(directory), realpathSync(directory));
  });

  it('dispatches preview and dev to loopback with strict ports', () => {
    assert.deepEqual(viteChildArgs({ preview: false, previewDir: null }), [
      'run', 'dev', '--', '--host', '127.0.0.1', '--strictPort',
    ]);
    assert.deepEqual(viteChildArgs({ preview: true, previewDir: '/tmp/emitted' }), [
      'run', 'preview', '--', '--host', '127.0.0.1', '--strictPort', '--outDir', '/tmp/emitted',
    ]);
  });
});
const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/dev-local-workspace.mjs', ...args], { env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
  child.on('error', reject); child.on('exit', code => resolve({ code, stdout, stderr }));
});

async function launchFixture(overrides = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'astrid-local-launch-check-'));
  const token = 'synthetic-runtime-test-token';
  const actorId = 'astrid-product-r3';
  const realmId = 'realm-r3';
  const runtimeInstanceId = 'runtime-instance-r3';
  const realmRoot = join(fixture, 'realm-root');
  mkdirSync(realmRoot);
  const credential = join(fixture, 'astrid.json');
  writeFileSync(credential, JSON.stringify({ version: 1, scope: 'astrid', actor_id: actorId, token }), { mode: 0o600 });
  const catalog = join(fixture, 'catalog.json');
  writeFileSync(catalog, JSON.stringify({
    selected_realm_id: realmId,
    realms: [{ realm_id: realmId, source_profile: 'astrid', data_root: realmRoot }],
  }));
  const noSpawnBin = join(fixture, 'bin');
  mkdirSync(noSpawnBin);
  const spawnMarker = join(fixture, 'unexpected-child-spawn');
  const fakeNpm = join(noSpawnBin, 'npm');
  writeFileSync(fakeNpm, `#!/bin/sh\nprintf spawned > '${spawnMarker}'\nexit 0\n`, { mode: 0o700 });
  chmodSync(fakeNpm, 0o700);
  let available = true;
  const requests = [];
  const runtime = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    requests.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : undefined });
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    if (!available) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'offline' }));
      return;
    }
    const digest = readGeneratedSchemaDigest(resolve('src/integrations/runtime/generated-contract-metadata.ts'));
    const json = (value) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.url === '/v1/health') return json({
      status: 'ok', protocol: 'workspace.v1', schema_digest: digest,
      runtime_instance_id: overrides.healthInstanceId ?? runtimeInstanceId,
    });
    if (req.url === '/v1/handshake') return json({
      protocol: 'workspace.v1', schema_digest: digest, session_id: 'session-r3',
      actor_id: overrides.handshakeActorId ?? actorId,
      realm_id: overrides.handshakeRealmId ?? realmId,
      scopes: overrides.handshakeScopes ?? ['handshake', 'projects:read', 'projects:write', 'objects:read', 'objects:write', 'tasks:read', 'tasks:write'],
    });
    if (req.url === '/v1/realm') return json({ realm_id: overrides.realmResponseId ?? realmId, display_name: 'Astrid test realm', version: 1, created_at: '2026-09-11T00:00:00Z' });
    res.writeHead(404); res.end();
  });
  await new Promise(r => runtime.listen(0, '127.0.0.1', r));
  const discovery = join(fixture, 'discovery.json');
  writeFileSync(discovery, JSON.stringify({
    endpoint: `http://127.0.0.1:${runtime.address().port}`,
    credential_file: credential,
    runtime_instance_id: runtimeInstanceId,
    active_realm: overrides.discoveryRealmId ?? realmId,
    realm_root: overrides.discoveryRealmRoot ?? realmRoot,
  }));
  if (overrides.credential) writeFileSync(credential, typeof overrides.credential === 'string' ? overrides.credential : JSON.stringify(overrides.credential), { mode: 0o600 });
  if (overrides.catalogSelectedRealmId || overrides.catalogRealmId || overrides.catalogRoot || overrides.sourceProfile) {
    writeFileSync(catalog, JSON.stringify({
      selected_realm_id: overrides.catalogSelectedRealmId ?? realmId,
      realms: [{ realm_id: overrides.catalogRealmId ?? realmId, source_profile: overrides.sourceProfile ?? 'astrid', data_root: overrides.catalogRoot ?? realmRoot }],
    }));
  }
  const env = {
    ASTRID_WORKSPACE_DISCOVERY: discovery,
    ASTRID_APP_LOOPBACK_ORIGIN: '',
    PATH: noSpawnBin,
  };
  return {
    fixture, token, actorId, realmId, runtimeInstanceId, realmRoot, catalog,
    discovery, spawnMarker, requests, runtime, env,
    setAvailable(value) { available = value; },
    async close() {
      await new Promise(r => runtime.close(r));
      rmSync(fixture, { recursive: true, force: true });
    },
  };
}

test('local launcher binds the selected Astrid product credential and profile before startup', async () => {
  const fixture = await launchFixture();
  try {
    const valid = await run(['--check', '--hosted-origin', 'https://hosted.test'], fixture.env);
    assert.equal(valid.code, 0); assert.match(valid.stdout, /runtime healthy/); assert(!valid.stdout.includes(fixture.token));
    assert.deepEqual(fixture.requests.map(({ method, path }) => `${method} ${path}`), [
      'GET /v1/health', 'POST /v1/handshake', 'GET /v1/realm',
    ]);
    assert.deepEqual(fixture.requests[1].body.requested_scopes, ['handshake', 'projects:read', 'projects:write', 'objects:read', 'objects:write', 'tasks:read', 'tasks:write']);
    assert.equal(existsSync(fixture.spawnMarker), false, '--check must not start ACP or Vite');
    for (const args of [['--check', '--hosted-origin'], ['--check', '--hosted-origin', '--paired'], ['--check', '--hosted-origin', 'http://hosted.test'], ['--check', '--hosted-origin', 'https://hosted.test/path']]) {
      const invalid = await run(args, fixture.env); assert.equal(invalid.code, 1); assert.match(invalid.stderr, /origin/); assert(!invalid.stderr.includes(fixture.token));
    }
    fixture.setAvailable(false);
    const offline = await run(['--check'], fixture.env); assert.equal(offline.code, 1); assert.match(offline.stderr, /HTTP 503/);
  } finally { await fixture.close(); }
});

test('local launcher rejects credential, profile, and Runtime identity substitutions before launch', async () => {
  const cases = [
    ['raw owner token', { credential: 'synthetic-owner-token' }, /scoped Astrid product credential/],
    ['owner-scoped credential', { credential: { version: 1, scope: 'owner', actor_id: 'owner', token: 'synthetic-owner-token' } }, /version 1 astrid product scope/],
    ['credential with owner actor', { credential: { version: 1, scope: 'astrid', actor_id: 'owner', token: 'synthetic-owner-token' } }, /forbidden or missing product actor/],
    ['discovery selects a different realm than catalog', { discoveryRealmId: 'other-realm' }, /selected realm in catalog/],
    ['catalog selects a different realm', { catalogSelectedRealmId: 'other-realm' }, /selected realm in catalog/],
    ['catalog has no matching selected realm row', { catalogRealmId: 'other-realm' }, /not one Astrid profile/],
    ['catalog root differs from discovery', { catalogRoot: '/tmp' }, /realm root does not match/],
    ['non-Astrid profile row', { sourceProfile: 'worker' }, /not one Astrid profile/],
    ['health reports another Runtime instance', { healthInstanceId: 'other-runtime' }, /instance does not match/],
    ['handshake reports another actor', { handshakeActorId: 'owner' }, /actor, realm, protocol, or product scopes/],
    ['handshake reports another realm', { handshakeRealmId: 'other-realm' }, /actor, realm, protocol, or product scopes/],
    ['handshake grants an extra admin scope', { handshakeScopes: ['handshake', 'projects:read', 'projects:write', 'objects:read', 'objects:write', 'tasks:read', 'tasks:write', 'admin'] }, /actor, realm, protocol, or product scopes/],
    ['realm endpoint reports another realm', { realmResponseId: 'other-realm' }, /realm does not match/],
  ];
  for (const [label, overrides, expectedError] of cases) {
    const fixture = await launchFixture(overrides);
    try {
      const result = await run(['--check'], fixture.env);
      assert.equal(result.code, 1, `${label}: expected failure`);
      assert.match(result.stderr, expectedError, label);
      assert(!result.stderr.includes(fixture.token), `${label}: credential leaked to stderr`);
      assert.equal(existsSync(fixture.spawnMarker), false, `${label}: launched a child`);
    } finally { await fixture.close(); }
  }
});


test('Runtime discovery selection ignores source checkout and rejects ambiguous roots', () => {
  const home = '/home/fixture';
  assert.equal(resolveWorkspaceDiscoveryPath({ home }), '/home/fixture/Library/Application Support/Astrid Runtime/runtime/discovery.json');
  assert.equal(resolveWorkspaceDiscoveryPath({ home, supportRoot: '/selected/root', dataRoot: '/selected/root' }), '/selected/root/runtime/discovery.json');
  assert.equal(resolveWorkspaceDiscoveryPath({ home, discovery: '/selected/discovery.json', supportRoot: '/unused/root' }), '/selected/discovery.json');
  assert.throws(() => resolveWorkspaceDiscoveryPath({ home, supportRoot: '/one', dataRoot: '/two' }), /different roots/);
  assert.throws(() => resolveWorkspaceDiscoveryPath({ home, discovery: 'relative/discovery.json' }), /absolute path/);
});

test('build handoff carries verified identity into the emitted browser build without launching services', async () => {
  const fixture = await launchFixture();
  const captured = join(fixture.fixture, 'build-environment.json');
  const fakeNpm = join(fixture.fixture, 'bin', 'npm');
  writeFileSync(fakeNpm, `#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(captured)}, JSON.stringify({args:process.argv.slice(2), actor:process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID, realm:process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID, instance:process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID}));
`, { mode: 0o700 });
  try {
    const result = await run(['--build'], fixture.env);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(captured, 'utf8')), { args: ['run', 'build'], actor: fixture.actorId, realm: fixture.realmId, instance: fixture.runtimeInstanceId });
    assert.equal(existsSync(fixture.spawnMarker), false);
    assert(!result.stdout.includes(fixture.token));
  } finally { await fixture.close(); }
});


test('build handoff rejects a Runtime instance change during compilation', async () => {
  let healthReads = 0;
  const fixture = await launchFixture({
    get healthInstanceId() { return ++healthReads === 1 ? undefined : 'restarted-instance'; },
  });
  try {
    const result = await run(['--build'], fixture.env);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /instance does not match/);
    assert.equal(healthReads, 2);
    assert.equal(existsSync(fixture.spawnMarker), true, 'fixture compiler must run between identity checks');
    assert(!result.stdout.includes(fixture.token));
  } finally { await fixture.close(); }
});
