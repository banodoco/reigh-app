import { describe, expect, it } from 'vitest';
import {
  getRuntimeErrorAliasImportBudget,
  RUNTIME_ERROR_ALIAS_IMPORT_BUDGET_PHASES,
  RUNTIME_ERROR_ALIAS_OWNER,
  RUNTIME_ERROR_ALIAS_REMOVE_BY,
} from '@/shared/lib/governance/runtimeErrorAliasPolicy';

describe('runtime error alias governance contract', () => {
  it('keeps owner/removal metadata stable for migration automation', () => {
    expect(RUNTIME_ERROR_ALIAS_OWNER).toBe('runtime-foundation');
    expect(RUNTIME_ERROR_ALIAS_REMOVE_BY).toBe('2026-06-30');
  });

  it('keeps import budget phases descending until removal target', () => {
    expect(RUNTIME_ERROR_ALIAS_IMPORT_BUDGET_PHASES).toEqual([
      { through: '2026-03-31', max: 28 },
      { through: '2026-04-30', max: 20 },
      { through: '2026-05-31', max: 10 },
      { through: '2026-06-30', max: 4 },
    ]);
    expect(getRuntimeErrorAliasImportBudget(new Date('2026-03-15T00:00:00Z'))).toBe(28);
    expect(getRuntimeErrorAliasImportBudget(new Date('2026-04-10T00:00:00Z'))).toBe(20);
    expect(getRuntimeErrorAliasImportBudget(new Date('2026-05-20T00:00:00Z'))).toBe(10);
    expect(getRuntimeErrorAliasImportBudget(new Date('2026-07-01T00:00:00Z'))).toBe(0);
  });
});
