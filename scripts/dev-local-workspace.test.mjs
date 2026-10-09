import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it, test } from 'node:test';
import { readGeneratedSchemaDigest } from './runtime-schema-guard.mjs';

import {
  parseDevLocalWorkspaceArgs,
  validatePreviewOutputDirectory,
  viteChildArgs,
} from './dev-local-workspace-options.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function emittedDirectory({ entry = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'reigh-dev-local-preview-test-'));
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
      () => validatePreviewOutputDirectory('/tmp/reigh-no-such-preview-output'),
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

test('local launcher validates Runtime and exact hosted origin without printing credentials', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'reigh-local-launch-check-'));
  const token = 'synthetic-runtime-test-token';
  let available = true;
  const runtime = createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.writeHead(available ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', protocol: 'workspace.v1', schema_digest: readGeneratedSchemaDigest(resolve('src/integrations/runtime/generated-contract-metadata.ts')) }));
  });
  await new Promise(r => runtime.listen(0, '127.0.0.1', r));
  const credential = join(fixture, 'credential'); writeFileSync(credential, token, { mode: 0o600 });
  const discovery = join(fixture, 'discovery.json');
  writeFileSync(discovery, JSON.stringify({ endpoint: `http://127.0.0.1:${runtime.address().port}`, credential_file: credential }));
  const env = { ASTRID_WORKSPACE_DISCOVERY: discovery, REIGH_LOOPBACK_ORIGIN: '' };
  try {
    const valid = await run(['--check', '--hosted-origin', 'https://hosted.test'], env);
    assert.equal(valid.code, 0); assert.match(valid.stdout, /runtime healthy/); assert(!valid.stdout.includes(token));
    for (const args of [['--check', '--hosted-origin'], ['--check', '--hosted-origin', '--paired'], ['--check', '--hosted-origin', 'http://hosted.test'], ['--check', '--hosted-origin', 'https://hosted.test/path']]) {
      const invalid = await run(args, env); assert.equal(invalid.code, 1); assert.match(invalid.stderr, /origin/); assert(!invalid.stderr.includes(token));
    }
    available = false;
    const offline = await run(['--check'], env); assert.equal(offline.code, 1); assert.match(offline.stderr, /HTTP 503/);
  } finally {
    await new Promise(r => runtime.close(r)); rmSync(fixture, { recursive: true, force: true });
  }
});
