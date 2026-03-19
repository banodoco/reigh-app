type TaskParamPath = readonly string[];

/** Inline to avoid @/ alias imports that break Deno edge function bundling. */
function toObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

const TASK_PARAM_CONTRACT_PATHS = {
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

function resolvePathValue(params: unknown, path: TaskParamPath): unknown {
  let value: unknown = params;
  for (const segment of path) {
    const record = toObjectRecord(value);
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

function extractTaskParamValue(
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

function extractTaskParamString(
  params: unknown,
  paths: readonly TaskParamPath[],
): string | null {
  const value = extractTaskParamValue(params, paths);
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseTaskParamBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

function summarizeTaskParamValue(value: unknown): string | number | boolean | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return '[array]';
  }
  if (typeof value === 'object') {
    return '[object]';
  }
  return String(value);
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
  const rawValue = extractTaskParamValue(params, TASK_PARAM_CONTRACT_PATHS.addInPosition);
  const parsed = parseTaskParamBoolean(rawValue);
  if (parsed !== null) {
    return parsed;
  }

  if (rawValue !== undefined && rawValue !== null) {
    console.warn('[TaskParamContract] Invalid add_in_position param encoding', {
      rawType: typeof rawValue,
      rawValue: summarizeTaskParamValue(rawValue),
    });
  }

  return false;
}
