import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ProxyOptions } from 'vite';

import { RUNTIME_TOKEN_ENV } from './runtimeProxy';
import { createWorkspaceRuntimeProxyFromEnv } from './vite.config';

function authorization(proxy: Record<string, string | ProxyOptions>): string | undefined {
  const options = proxy['/api/runtime'];
  assert.equal(typeof options, 'object');
  return (options as ProxyOptions).headers?.Authorization as string | undefined;
}

test('Vite Runtime proxy keeps authenticated bytes when the credential file is replaced before config evaluation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reigh-vite-runtime-proxy-'));
  const credentialPath = join(root, 'astrid.json');
  const validatedToken = 'validated-product-token';
  await writeFile(credentialPath, JSON.stringify({
    version: 1,
    scope: 'astrid',
    actor_id: 'astrid-validated',
    token: validatedToken,
  }), { mode: 0o600 });

  const serverEnvironment: NodeJS.ProcessEnv = {
    VITE_WORKSPACE_RUNTIME_URL: 'http://127.0.0.1:43210',
    [RUNTIME_TOKEN_ENV]: validatedToken,
    // A stale legacy path must have no effect on Vite's proxy credential.
    WORKSPACE_RUNTIME_TOKEN_FILE: credentialPath,
  };

  await writeFile(credentialPath, JSON.stringify({
    version: 1,
    scope: 'owner',
    actor_id: 'owner',
    token: 'replacement-owner-token',
  }), { mode: 0o600 });

  const proxy = createWorkspaceRuntimeProxyFromEnv(serverEnvironment);
  assert.equal(authorization(proxy), `Bearer ${validatedToken}`);
  assert.notEqual(authorization(proxy), 'Bearer replacement-owner-token');
});

test('Vite Runtime proxy requires the dedicated server-only validated token', () => {
  assert.equal(RUNTIME_TOKEN_ENV.startsWith('VITE_'), false);
  assert.deepEqual(createWorkspaceRuntimeProxyFromEnv({}), {});
  assert.throws(() => createWorkspaceRuntimeProxyFromEnv({
    VITE_WORKSPACE_RUNTIME_URL: 'http://127.0.0.1:43210',
    WORKSPACE_RUNTIME_TOKEN_FILE: '/tmp/replaced-owner.token',
  }), /WORKSPACE_RUNTIME_TOKEN is required/);
  assert.throws(() => createWorkspaceRuntimeProxyFromEnv({
    VITE_WORKSPACE_RUNTIME_URL: 'http://127.0.0.1:43210',
    VITE_WORKSPACE_RUNTIME_TOKEN: 'browser-visible-token',
  }), /WORKSPACE_RUNTIME_TOKEN is required/);
});

test('launcher, Vite config, and environment example document only the validated server-only handoff', async () => {
  const [launcherSource, viteSource, environmentExample] = await Promise.all([
    readFile(new URL('../../scripts/dev-local-workspace.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./vite.config.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../.env.example', import.meta.url), 'utf8'),
  ]);
  assert.match(launcherSource, /WORKSPACE_RUNTIME_TOKEN:\s*productCredential\.token/);
  assert.doesNotMatch(launcherSource, /WORKSPACE_RUNTIME_TOKEN_FILE/);
  assert.match(viteSource, /env\[RUNTIME_TOKEN_ENV\]/);
  assert.doesNotMatch(viteSource, /WORKSPACE_RUNTIME_TOKEN_FILE|readRuntimeProxyToken/);
  assert.match(environmentExample, /npm run dev:local/);
  assert.match(environmentExample, /launcher injects[\s\S]*server-only WORKSPACE_RUNTIME_TOKEN/);
  assert.match(environmentExample, /Do not configure an owner credential file/);
  assert.match(environmentExample, /VITE_-prefixed token variable/);
  assert.doesNotMatch(environmentExample, /WORKSPACE_RUNTIME_TOKEN_FILE|owner\.token/);
});
