#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');

const args = process.argv.slice(2);
const maxArgIndex = args.indexOf('--max');
const LEGACY_SUPABASE_ALIAS_REMOVE_BY = '2026-06-30';
const LEGACY_SUPABASE_IMPORT_BUDGET_PHASES = [
  { through: '2026-03-31', max: 129 },
  { through: '2026-04-30', max: 96 },
  { through: '2026-05-31', max: 64 },
  { through: LEGACY_SUPABASE_ALIAS_REMOVE_BY, max: 32 },
];

function getBudgetForDate(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  for (const phase of LEGACY_SUPABASE_IMPORT_BUDGET_PHASES) {
    if (date <= phase.through) {
      return phase.max;
    }
  }
  return 0;
}

const maxAllowed = maxArgIndex >= 0
  ? Number(args[maxArgIndex + 1])
  : getBudgetForDate();
const allowlistArgIndex = args.indexOf('--allowlist');
const allowlistPath = allowlistArgIndex >= 0
  ? path.resolve(rootDir, args[allowlistArgIndex + 1])
  : path.join(rootDir, 'src', 'integrations', 'supabase', 'legacy', 'legacySupabaseAllowlist.json');
const writeBaseline = args.includes('--write-baseline');

if (!Number.isFinite(maxAllowed) || maxAllowed < 0) {
  console.error('[legacy-supabase-check] Invalid --max value');
  process.exit(1);
}

const SPECIFIER = '@/integrations/supabase/legacy/legacySupabaseFacade';

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

    if (!entry.isFile()) {
      continue;
    }

    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) {
      continue;
    }

    if (fullPath.endsWith('.test.ts') || fullPath.endsWith('.test.tsx')) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function countSpecifierImports(filePath, specifier) {
  const content = fs.readFileSync(filePath, 'utf8');
  const pattern = new RegExp(`from\\s+['"]${specifier.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}['"]`, 'g');
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

const files = walk(srcDir);
let totalImports = 0;
const byFile = [];
const importerFiles = [];

for (const filePath of files) {
  const count = countSpecifierImports(filePath, SPECIFIER);
  if (count <= 0) {
    continue;
  }
  totalImports += count;
  byFile.push({ filePath, count });
  importerFiles.push(path.relative(rootDir, filePath));
}

importerFiles.sort((a, b) => a.localeCompare(b));

if (writeBaseline) {
  const baseline = {
    generated_at: new Date().toISOString(),
    specifier: SPECIFIER,
    files: importerFiles,
  };
  fs.writeFileSync(allowlistPath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`[legacy-supabase-check] Wrote allowlist baseline to ${path.relative(rootDir, allowlistPath)}.`);
}

if (!fs.existsSync(allowlistPath)) {
  console.error(`[legacy-supabase-check] Missing allowlist file: ${path.relative(rootDir, allowlistPath)}`);
  console.error('[legacy-supabase-check] Run with --write-baseline to create it.');
  process.exit(1);
}

const allowlistRaw = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
const allowlistedFiles = Array.isArray(allowlistRaw?.files)
  ? new Set(allowlistRaw.files)
  : new Set();

const unexpectedImporters = importerFiles.filter((filePath) => !allowlistedFiles.has(filePath));

if (totalImports > maxAllowed) {
  console.error('[legacy-supabase-check] FAILED: legacy supabase imports exceed budget.');
  console.error(`  - ${SPECIFIER}: ${totalImports} import(s), max ${maxAllowed}`);
  for (const entry of byFile) {
    const relative = path.relative(rootDir, entry.filePath);
    console.error(`      ${relative} (${entry.count})`);
  }
  process.exit(1);
}

if (unexpectedImporters.length > 0) {
  console.error('[legacy-supabase-check] FAILED: found non-allowlisted legacy supabase importers.');
  for (const filePath of unexpectedImporters) {
    console.error(`      ${filePath}`);
  }
  process.exit(1);
}

console.log(
  `[legacy-supabase-check] OK: ${SPECIFIER} imports = ${totalImports} (max ${maxAllowed}), allowlisted importers only.`,
);
