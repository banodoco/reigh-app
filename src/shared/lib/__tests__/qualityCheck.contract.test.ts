/* @vitest-environment node */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageJsonScripts {
  scripts?: Record<string, string>;
}

function readPackageScripts(): Record<string, string> {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as PackageJsonScripts;
  return packageJson.scripts ?? {};
}

describe('quality:check governance contract', () => {
  it('keeps one canonical quality gate that runs all governance checks', () => {
    const scripts = readPackageScripts();
    const qualityCheck = scripts['quality:check'];

    expect(qualityCheck).toBeTypeOf('string');

    const requiredSubcommands = [
      'npm run check:no-smoke-tests',
      'npm run check:shots-shim-usage',
      'npm run check:core-shim-usage',
      'npm run check:legacy-supabase-usage',
      'npm run check:error-runtime-alias-usage',
      'npm run check:contracts',
      'npm run lint',
      'npm run typecheck:strict-probe',
    ];

    for (const command of requiredSubcommands) {
      expect(qualityCheck).toContain(command);
    }
  });
});
