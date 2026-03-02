export interface DeprecationBudgetPhase {
  through: string;
  max: number;
}

export interface DeprecationPolicy {
  owner: string;
  removeBy: string;
  importBudgetPhases: readonly DeprecationBudgetPhase[];
}

export type DeprecationPolicyId =
  | 'runtime_error_alias'
  | 'legacy_supabase_facade'
  | 'join_clips_compat'
  | 'travel_structure_legacy'
  | 'tool_constants_alias'
  | 'button_theme_variants_alias'
  | 'external_api_keys_hook_alias';

const DEPRECATION_POLICIES: Record<DeprecationPolicyId, DeprecationPolicy> = {
  runtime_error_alias: {
    owner: 'runtime-foundation',
    removeBy: '2026-06-30',
    importBudgetPhases: [
      { through: '2026-03-31', max: 28 },
      { through: '2026-04-30', max: 20 },
      { through: '2026-05-31', max: 10 },
      { through: '2026-06-30', max: 4 },
    ],
  },
  legacy_supabase_facade: {
    owner: 'platform-runtime',
    removeBy: '2026-06-30',
    importBudgetPhases: [
      { through: '2026-03-31', max: 160 },
      { through: '2026-04-30', max: 96 },
      { through: '2026-05-31', max: 64 },
      { through: '2026-06-30', max: 32 },
    ],
  },
  join_clips_compat: {
    owner: 'video-workflow',
    removeBy: '2026-06-30',
    importBudgetPhases: [],
  },
  travel_structure_legacy: {
    owner: 'video-workflow',
    removeBy: '2026-05-31',
    importBudgetPhases: [],
  },
  tool_constants_alias: {
    owner: 'tooling-foundation',
    removeBy: '2026-06-30',
    importBudgetPhases: [],
  },
  button_theme_variants_alias: {
    owner: 'ui-foundation',
    removeBy: '2026-06-30',
    importBudgetPhases: [],
  },
  external_api_keys_hook_alias: {
    owner: 'platform-runtime',
    removeBy: '2026-06-30',
    importBudgetPhases: [],
  },
};

export function getDeprecationPolicy(id: DeprecationPolicyId): DeprecationPolicy {
  return DEPRECATION_POLICIES[id];
}

export function getDeprecationPolicyImportBudget(
  policy: DeprecationPolicy,
  now: Date = new Date(),
): number {
  const date = now.toISOString().slice(0, 10);
  for (const phase of policy.importBudgetPhases) {
    if (date <= phase.through) {
      return phase.max;
    }
  }
  return 0;
}

export function isPastRemovalTarget(
  policy: DeprecationPolicy,
  now: Date = new Date(),
): boolean {
  const timestamp = Date.parse(`${policy.removeBy}T23:59:59Z`);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return now.getTime() > timestamp;
}
