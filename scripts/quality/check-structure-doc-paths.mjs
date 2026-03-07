import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const structureDocPath = resolve(repoRoot, 'structure.md');

function fail(message) {
  console.error(`[check-structure-doc-paths] ${message}`);
  process.exit(1);
}

if (!existsSync(structureDocPath)) {
  fail(`Missing structure document: ${structureDocPath}`);
}

const structureDoc = readFileSync(structureDocPath, 'utf8');

const criticalPaths = [
  'src/shared/lib/queryKeys/index.ts',
  'src/shared/lib/errorHandling/errors.ts',
  'src/shared/lib/errorHandling/runtimeError.ts',
  'src/shared/lib/debug/debugConfig.ts',
  'src/app/components/error/AppErrorBoundary.tsx',
  'src/shared/components/ModalContainer.tsx',
  'src/shared/components/dialogs/ConfirmDialog.tsx',
  'src/shared/lib/settingsResolution.ts',
  'src/shared/lib/settingsWriteQueue.ts',
  'src/shared/lib/taskConfig.ts',
];

const errors = [];

for (const relativePath of criticalPaths) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`Referenced path does not exist: ${relativePath}`);
  }

  if (!structureDoc.includes(`\`${relativePath}\``)) {
    errors.push(`structure.md is missing path reference: ${relativePath}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[check-structure-doc-paths] ${error}`);
  }
  process.exit(1);
}

console.log('[check-structure-doc-paths] ok');
