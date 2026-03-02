import {
  getDeprecationPolicy,
  getDeprecationPolicyImportBudget,
} from '@/shared/lib/governance/deprecationPolicy';

const runtimeErrorAliasPolicy = getDeprecationPolicy('runtime_error_alias');

export const RUNTIME_ERROR_ALIAS_SPECIFIER = '@/shared/lib/compat/errorHandler';
export const RUNTIME_ERROR_ALIAS_OWNER = runtimeErrorAliasPolicy.owner;
export const RUNTIME_ERROR_ALIAS_REMOVE_BY = runtimeErrorAliasPolicy.removeBy;
export const RUNTIME_ERROR_ALIAS_IMPORT_BUDGET_PHASES = runtimeErrorAliasPolicy.importBudgetPhases;

export function getRuntimeErrorAliasImportBudget(now: Date = new Date()): number {
  return getDeprecationPolicyImportBudget(runtimeErrorAliasPolicy, now);
}
