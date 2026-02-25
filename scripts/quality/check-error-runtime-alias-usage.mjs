#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const args = process.argv.slice(2);
const maxArgIndex = args.indexOf('--max');

const RUNTIME_ERROR_ALIAS_REMOVE_BY = '2026-06-30';
const RUNTIME_ERROR_ALIAS_IMPORT_BUDGET_PHASES = [
  { through: '2026-03-31', max: 28 },
  { through: '2026-04-30', max: 20 },
  { through: '2026-05-31', max: 10 },
  { through: RUNTIME_ERROR_ALIAS_REMOVE_BY, max: 4 },
];

const SPECIFIER = '@/shared/lib/errorHandling/handleError';
const TARGET_NAMES = new Set(['reportRuntimeError', 'RuntimeErrorOptions']);

function getBudgetForDate(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  for (const phase of RUNTIME_ERROR_ALIAS_IMPORT_BUDGET_PHASES) {
    if (date <= phase.through) {
      return phase.max;
    }
  }
  return 0;
}

const maxAllowed = maxArgIndex >= 0
  ? Number(args[maxArgIndex + 1])
  : getBudgetForDate();

if (!Number.isFinite(maxAllowed) || maxAllowed < 0) {
  console.error('[runtime-error-alias-check] Invalid --max value');
  process.exit(1);
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) continue;
    if (fullPath.endsWith('.test.ts') || fullPath.endsWith('.test.tsx')) continue;
    files.push(fullPath);
  }
  return files;
}

function countRuntimeErrorAliasImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const pattern = new RegExp(
    `import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*['"]${SPECIFIER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
    'g',
  );
  let count = 0;
  for (const match of content.matchAll(pattern)) {
    const members = match[1]
      .split(',')
      .map((member) => member.trim())
      .filter(Boolean)
      .map((member) => member.split(/\s+as\s+/i)[0]?.trim() ?? '');
    for (const member of members) {
      if (TARGET_NAMES.has(member)) {
        count += 1;
      }
    }
  }
  return count;
}

const files = walk(srcDir);
let totalImports = 0;
const byFile = [];

for (const filePath of files) {
  const count = countRuntimeErrorAliasImports(filePath);
  if (count <= 0) continue;
  totalImports += count;
  byFile.push({ filePath, count });
}

if (totalImports > maxAllowed) {
  console.error('[runtime-error-alias-check] FAILED: deprecated runtime error alias imports exceed budget.');
  console.error(`  - ${SPECIFIER}: ${totalImports} import(s), max ${maxAllowed}`);
  for (const entry of byFile) {
    console.error(`      ${path.relative(rootDir, entry.filePath)} (${entry.count})`);
  }
  process.exit(1);
}

console.log(
  `[runtime-error-alias-check] OK: ${SPECIFIER} deprecated alias imports = ${totalImports} (max ${maxAllowed}).`,
);
