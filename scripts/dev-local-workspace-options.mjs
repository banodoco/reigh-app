import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const VITE_ENTRY_RE = /^index-[A-Za-z0-9_-]+\.js$/;

export function parseDevLocalWorkspaceArgs(args) {
  let preview = false;
  let previewDir = null;
  let checkOnly = false;
  let paired = false;
  let resetPairing = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check') {
      checkOnly = true;
      continue;
    }
    if (argument === '--paired') {
      paired = true;
      continue;
    }
    if (argument === '--reset-pairing') {
      resetPairing = true;
      continue;
    }
    if (argument === '--preview') {
      preview = true;
      continue;
    }
    if (argument === '--preview-dir') {
      if (previewDir !== null) {
        throw new Error('--preview-dir may be provided only once');
      }
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--preview-dir requires an absolute emitted output directory');
      }
      previewDir = value;
      index += 1;
      continue;
    }
    // Preserve the launcher's historical behavior for unrelated arguments;
    // npm/Vite-owned options are not interpreted by this wrapper.
  }

  if (preview !== (previewDir !== null)) {
    throw new Error('--preview requires --preview-dir <absolute emitted output directory>');
  }

  return Object.freeze({
    checkOnly,
    paired,
    resetPairing,
    preview,
    previewDir,
  });
}

/**
 * Resolve only an explicitly selected, already-emitted Vite output.
 * Requiring the index and hashed entry prevents silently serving a source tree
 * or an arbitrary directory when preview mode is requested.
 */
export function validatePreviewOutputDirectory(value) {
  if (!isAbsolute(value)) {
    throw new Error('--preview-dir must be an absolute path');
  }

  let outputDirectory;
  try {
    outputDirectory = realpathSync(value);
  } catch {
    throw new Error(`--preview-dir does not exist: ${value}`);
  }
  try {
    if (!statSync(outputDirectory).isDirectory()) {
      throw new Error(`--preview-dir is not a directory: ${value}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('--preview-dir is not a directory:')) {
      throw error;
    }
    throw new Error(`--preview-dir does not exist: ${value}`);
  }

  const indexPath = join(outputDirectory, 'index.html');
  const assetsDirectory = join(outputDirectory, 'assets');
  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    throw new Error(`--preview-dir is not an emitted Vite output (missing index.html): ${value}`);
  }
  let assetsAreDirectory = false;
  try {
    assetsAreDirectory = statSync(assetsDirectory).isDirectory();
  } catch {
    assetsAreDirectory = false;
  }
  if (!assetsAreDirectory) {
    throw new Error(`--preview-dir is not an emitted Vite output (missing assets/): ${value}`);
  }
  let entry;
  try {
    entry = readdirSync(assetsDirectory).find((name) => VITE_ENTRY_RE.test(name));
  } catch {
    throw new Error(`--preview-dir is not an emitted Vite output (unreadable assets/): ${value}`);
  }
  if (!entry || !statSync(join(assetsDirectory, entry)).isFile()) {
    throw new Error(`--preview-dir is not an emitted Vite output (missing assets/index-*.js): ${value}`);
  }

  return outputDirectory;
}

export function viteChildArgs(options) {
  if (options.preview) {
    return [
      'run',
      'preview',
      '--',
      '--host',
      '127.0.0.1',
      '--strictPort',
      '--outDir',
      options.previewDir,
    ];
  }
  return ['run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'];
}
