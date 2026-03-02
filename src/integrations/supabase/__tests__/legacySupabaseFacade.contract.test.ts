import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getSupabaseClient,
} from '@/integrations/supabase/client';
import {
  LEGACY_SUPABASE_ALIAS_SPECIFIER,
  LEGACY_SUPABASE_ALIAS_REMOVE_BY,
  LEGACY_SUPABASE_IMPORT_BUDGET_PHASES,
  getLegacySupabaseImportBudget,
  isLegacySupabaseFacadePastRemovalTarget,
} from '@/integrations/supabase/support/legacy/legacySupabasePolicy';

function walkSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.desloppify') {
        return [];
      }
      return walkSourceFiles(resolved);
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    if (/\.test\.(ts|tsx)$/.test(entry.name) || /\.spec\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [resolved];
  });
}

function collectLegacySupabaseImporters(): string[] {
  const srcRoot = path.join(process.cwd(), 'src');
  const escapedSpecifier = LEGACY_SUPABASE_ALIAS_SPECIFIER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const staticImportPattern = new RegExp(
    `\\b(?:import|export)\\s[^;]*\\sfrom\\s*['"]${escapedSpecifier}['"]`,
    'm',
  );
  const sideEffectImportPattern = new RegExp(`\\bimport\\s*['"]${escapedSpecifier}['"]`, 'm');
  const dynamicImportPattern = new RegExp(
    `\\b(?:import|require)\\s*\\(\\s*['"]${escapedSpecifier}['"]\\s*\\)`,
    'm',
  );

  return walkSourceFiles(srcRoot)
    .filter((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      return (
        staticImportPattern.test(content) ||
        sideEffectImportPattern.test(content) ||
        dynamicImportPattern.test(content)
      );
    })
    .map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, '/'))
    .sort();
}

describe('legacy supabase facade governance contract', () => {
  it('exposes only the transitional accessor and no module-level supabase facade', async () => {
    const legacyModule = await import('@/integrations/supabase/client');

    expect(typeof legacyModule.getSupabaseClient).toBe('function');
    expect(getSupabaseClient).toBe(legacyModule.getSupabaseClient);
    expect('supabase' in legacyModule).toBe(false);
    expect('getLegacySupabaseImportBudget' in legacyModule).toBe(false);
    expect('LEGACY_SUPABASE_ALIAS_REMOVE_BY' in legacyModule).toBe(false);
  });

  it('enforces date-aware importer budget against real source imports', () => {
    const importerCount = collectLegacySupabaseImporters().length;

    if (isLegacySupabaseFacadePastRemovalTarget()) {
      expect(importerCount).toBe(0);
      return;
    }

    expect(importerCount).toBeLessThanOrEqual(getLegacySupabaseImportBudget());
  });

  it('keeps removal-target semantics stable for governance automation', () => {
    expect(LEGACY_SUPABASE_ALIAS_REMOVE_BY).toBe('2026-06-30');
    expect(isLegacySupabaseFacadePastRemovalTarget(new Date('2026-06-29T00:00:00Z'))).toBe(false);
    expect(isLegacySupabaseFacadePastRemovalTarget(new Date('2026-07-01T00:00:00Z'))).toBe(true);
  });

  it('keeps descending budget phases explicit before removal', () => {
    expect(LEGACY_SUPABASE_IMPORT_BUDGET_PHASES).toEqual([
      { through: '2026-03-31', max: 160 },
      { through: '2026-04-30', max: 96 },
      { through: '2026-05-31', max: 64 },
      { through: '2026-06-30', max: 32 },
    ]);
    expect(getLegacySupabaseImportBudget(new Date('2026-03-01T00:00:00Z'))).toBe(160);
    expect(getLegacySupabaseImportBudget(new Date('2026-04-20T00:00:00Z'))).toBe(96);
    expect(getLegacySupabaseImportBudget(new Date('2026-06-20T00:00:00Z'))).toBe(32);
    expect(getLegacySupabaseImportBudget(new Date('2026-07-02T00:00:00Z'))).toBe(0);
  });
});
