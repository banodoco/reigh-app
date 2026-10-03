import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

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
