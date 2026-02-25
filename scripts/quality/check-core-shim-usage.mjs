#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');

const rules = [
  { specifier: '@/shared/components/ActiveLoRAsDisplay', max: 0 },
  { specifier: '@/shared/hooks/useApiTokens', max: 0 },
  { specifier: '@/shared/hooks/useAutoTopup', max: 0 },
  {
    specifier: '@/types/generationRow',
    max: 0,
    ignoreIn: ['/src/types/'],
  },
  {
    specifier: '@/types/shot',
    max: 0,
    ignoreIn: ['/src/types/'],
  },
  {
    specifier: '@/types/generationMetadata',
    max: 0,
    ignoreIn: ['/src/types/'],
  },
  {
    specifier: '@/types/generationParams',
    max: 0,
    ignoreIn: ['/src/types/'],
  },
  {
    specifier: '@/shared/hooks/mobile/deviceSignals',
    max: 0,
    ignoreIn: ['/src/shared/hooks/mobile/'],
  },
  {
    specifier: '@/shared/hooks/mobile/responsiveViewModel',
    max: 0,
    ignoreIn: ['/src/shared/hooks/mobile/'],
  },
];

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
  const importPattern = new RegExp(`from\\\\s+['"]${specifier.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}['"]`, 'g');
  const matches = content.match(importPattern);
  return matches ? matches.length : 0;
}

function isIgnoredByRule(filePath, rule) {
  if (!Array.isArray(rule.ignoreIn) || rule.ignoreIn.length === 0) {
    return false;
  }
  const normalizedPath = filePath.split(path.sep).join('/');
  return rule.ignoreIn.some((fragment) => normalizedPath.includes(fragment));
}

const files = walk(srcDir);
const failures = [];

for (const rule of rules) {
  let total = 0;
  const byFile = [];

  for (const filePath of files) {
    if (isIgnoredByRule(filePath, rule)) {
      continue;
    }
    const count = countSpecifierImports(filePath, rule.specifier);
    if (count > 0) {
      total += count;
      byFile.push({ filePath, count });
    }
  }

  if (total > rule.max) {
    failures.push({ ...rule, total, byFile });
  }
}

if (failures.length > 0) {
  console.error('[core-shim-check] FAILED: shim usage exceeds allowed maximums.');
  for (const failure of failures) {
    console.error(`  - ${failure.specifier}: ${failure.total} import(s), max ${failure.max}`);
    for (const entry of failure.byFile) {
      const relative = path.relative(rootDir, entry.filePath);
      console.error(`      ${relative} (${entry.count})`);
    }
  }
  process.exit(1);
}

console.log('[core-shim-check] OK: core shim usage is within allowed limits.');
