import {
  getDeprecationPolicy,
  getDeprecationPolicyImportBudget,
  isPastRemovalTarget,
} from '@/shared/lib/governance/deprecationPolicy';

const legacySupabasePolicy = getDeprecationPolicy('legacy_supabase_facade');

export const LEGACY_SUPABASE_ALIAS_REMOVE_BY = legacySupabasePolicy.removeBy;
export const LEGACY_SUPABASE_ALIAS_OWNER = legacySupabasePolicy.owner;
export const LEGACY_SUPABASE_IMPORT_BUDGET_PHASES = legacySupabasePolicy.importBudgetPhases;

export function isLegacySupabaseFacadePastRemovalTarget(now: Date = new Date()): boolean {
  return isPastRemovalTarget(legacySupabasePolicy, now);
}

export function getLegacySupabaseImportBudget(now: Date = new Date()): number {
  return getDeprecationPolicyImportBudget(legacySupabasePolicy, now);
}
