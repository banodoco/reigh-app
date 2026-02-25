export type TaskParamPath = readonly string[];

export const TASK_PARAM_CONTRACT_PATHS = {
  orchestratorTaskId: [
    ['orchestration_contract', 'orchestrator_task_id'],
    ['orchestrator_task_id_ref'],
    ['orchestrator_task_id'],
    ['orchestrator_details', 'orchestrator_task_id'],
    ['originalParams', 'orchestrator_details', 'orchestrator_task_id'],
  ] as const satisfies readonly TaskParamPath[],
  runId: [
    ['orchestration_contract', 'run_id'],
    ['orchestrator_run_id'],
    ['run_id'],
    ['orchestrator_details', 'run_id'],
    ['originalParams', 'orchestrator_details', 'run_id'],
    ['full_orchestrator_payload', 'run_id'],
  ] as const satisfies readonly TaskParamPath[],
  basedOn: [
    ['orchestration_contract', 'based_on'],
    ['based_on'],
    ['originalParams', 'orchestrator_details', 'based_on'],
    ['orchestrator_details', 'based_on'],
    ['full_orchestrator_payload', 'based_on'],
    ['originalParams', 'based_on'],
  ] as const satisfies readonly TaskParamPath[],
  shotId: [
    ['orchestration_contract', 'shot_id'],
    ['originalParams', 'orchestrator_details', 'shot_id'],
    ['orchestrator_details', 'shot_id'],
    ['shot_id'],
    ['full_orchestrator_payload', 'shot_id'],
    ['shotId'],
  ] as const satisfies readonly TaskParamPath[],
  addInPosition: [
    ['add_in_position'],
    ['originalParams', 'add_in_position'],
    ['orchestrator_details', 'add_in_position'],
    ['originalParams', 'orchestrator_details', 'add_in_position'],
  ] as const satisfies readonly TaskParamPath[],
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolvePathValue(params: unknown, path: TaskParamPath): unknown {
  let value: unknown = params;
  for (const segment of path) {
    const record = asRecord(value);
    if (!record || !(segment in record)) {
      return undefined;
    }
    value = record[segment];
  }
  return value;
}

export function resolveByPrecedence<T>(...candidates: Array<T | null | undefined>): T | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }
  return undefined;
}

export function extractTaskParamValue(
  params: unknown,
  paths: readonly TaskParamPath[],
): unknown {
  for (const path of paths) {
    const value = resolvePathValue(params, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

export function extractTaskParamString(
  params: unknown,
  paths: readonly TaskParamPath[],
): string | null {
  const value = extractTaskParamValue(params, paths);
  if (value === undefined || value === null) return null;
  return String(value);
}

export function extractTaskParamBoolean(
  params: unknown,
  paths: readonly TaskParamPath[],
): boolean | null {
  const value = extractTaskParamValue(params, paths);
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

export function extractOrchestratorTaskIdParam(params: unknown): string | null {
  return extractTaskParamString(params, TASK_PARAM_CONTRACT_PATHS.orchestratorTaskId);
}

export function extractRunIdParam(params: unknown): string | null {
  return extractTaskParamString(params, TASK_PARAM_CONTRACT_PATHS.runId);
}

export function extractBasedOnParam(params: unknown): string | null {
  return extractTaskParamString(params, TASK_PARAM_CONTRACT_PATHS.basedOn);
}

export function extractShotIdParam(params: unknown): string | null {
  return extractTaskParamString(params, TASK_PARAM_CONTRACT_PATHS.shotId);
}

export function extractAddInPositionParam(params: unknown): boolean {
  return extractTaskParamBoolean(params, TASK_PARAM_CONTRACT_PATHS.addInPosition) ?? false;
}
