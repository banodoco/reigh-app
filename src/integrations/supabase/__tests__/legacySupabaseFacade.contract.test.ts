import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getSupabaseClient,
} from '@/integrations/supabase/client';
import {
  LEGACY_SUPABASE_ALIAS_REMOVE_BY,
  LEGACY_SUPABASE_IMPORT_BUDGET_PHASES,
  getLegacySupabaseImportBudget,
  isLegacySupabaseFacadePastRemovalTarget,
} from '@/integrations/supabase/legacy/legacySupabasePolicy';

describe('legacy supabase facade governance contract', () => {
  it('exposes only the transitional accessor and no module-level supabase facade', async () => {
    const legacyModule = await import('@/integrations/supabase/client');

    expect(typeof legacyModule.getSupabaseClient).toBe('function');
    expect(getSupabaseClient).toBe(legacyModule.getSupabaseClient);
    expect('supabase' in legacyModule).toBe(false);
    expect('getLegacySupabaseImportBudget' in legacyModule).toBe(false);
    expect('LEGACY_SUPABASE_ALIAS_REMOVE_BY' in legacyModule).toBe(false);
  });

  it('enforces date-aware importer budget against the migration allowlist', () => {
    const allowlistPath = path.join(
      process.cwd(),
      'src/integrations/supabase/legacy/legacySupabaseAllowlist.json',
    );
    const raw = JSON.parse(fs.readFileSync(allowlistPath, 'utf8')) as {
      files?: string[];
    };
    const importerCount = Array.isArray(raw.files) ? raw.files.length : 0;

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
      { through: '2026-03-31', max: 129 },
      { through: '2026-04-30', max: 96 },
      { through: '2026-05-31', max: 64 },
      { through: '2026-06-30', max: 32 },
    ]);
    expect(getLegacySupabaseImportBudget(new Date('2026-03-01T00:00:00Z'))).toBe(129);
    expect(getLegacySupabaseImportBudget(new Date('2026-04-20T00:00:00Z'))).toBe(96);
    expect(getLegacySupabaseImportBudget(new Date('2026-06-20T00:00:00Z'))).toBe(32);
    expect(getLegacySupabaseImportBudget(new Date('2026-07-02T00:00:00Z'))).toBe(0);
  });
});
