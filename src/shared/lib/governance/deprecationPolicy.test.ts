import { describe, expect, it } from 'vitest';
import {
  getDeprecationPolicy,
  getDeprecationPolicyImportBudget,
  isPastRemovalTarget,
} from './deprecationPolicy';

describe('deprecationPolicy', () => {
  it('returns phased import budgets by date', () => {
    const policy = getDeprecationPolicy('runtime_error_alias');

    expect(getDeprecationPolicyImportBudget(policy, new Date('2026-03-15T00:00:00Z'))).toBe(28);
    expect(getDeprecationPolicyImportBudget(policy, new Date('2026-05-20T00:00:00Z'))).toBe(10);
    expect(getDeprecationPolicyImportBudget(policy, new Date('2026-07-01T00:00:00Z'))).toBe(0);
  });

  it('detects when policy removal targets have passed', () => {
    const policy = getDeprecationPolicy('travel_structure_legacy');

    expect(isPastRemovalTarget(policy, new Date('2026-05-31T12:00:00Z'))).toBe(false);
    expect(isPastRemovalTarget(policy, new Date('2026-06-01T00:00:00Z'))).toBe(true);
  });
});
