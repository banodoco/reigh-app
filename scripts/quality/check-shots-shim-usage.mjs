#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const defaultMax = 0;

function parseMax(argv) {
  const maxFlagIndex = argv.findIndex((arg) => arg === '--max');
  if (maxFlagIndex === -1) return defaultMax;
  const value = argv[maxFlagIndex + 1];
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --max value: ${value}`);
  }
  return parsed;
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

    if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }
  return files;
}

function countShotsAliasImports(files) {
  const importPattern = /from\s+['"]@\/types\/shots['"]/g;
  let count = 0;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(importPattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

const maxAllowed = parseMax(process.argv.slice(2));
const files = walk(srcDir);
const importCount = countShotsAliasImports(files);

if (importCount > maxAllowed) {
  console.error(
    `[shots-shim-check] FAILED: found ${importCount} imports of "@/types/shots" (max allowed: ${maxAllowed}).`,
  );
  process.exit(1);
}

console.log(
  `[shots-shim-check] OK: found ${importCount} imports of "@/types/shots" (max allowed: ${maxAllowed}).`,
);
