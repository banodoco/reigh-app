#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src', 'supabase/functions'];
const smokePattern = /(coverage smoke:|has direct test coverage entry|expect\(true\)\.toBe\(true\))/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.test\.(ts|tsx)$/.test(full)) continue;
    out.push(full);
  }
  return out;
}

const offenders = [];
for (const root of roots) {
  let files = [];
  try {
    files = walk(root);
  } catch {
    continue;
  }

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (smokePattern.test(content)) offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error(`Found ${offenders.length} placeholder smoke test file(s):`);
  for (const file of offenders) console.error(` - ${file}`);
  process.exit(1);
}

console.log('No placeholder smoke tests found.');
