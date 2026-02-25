export const ORCHESTRATOR_REFERENCE_PATHS = {
  contractTaskId: 'params->orchestration_contract->>orchestrator_task_id',
  referenceTaskId: 'params->>orchestrator_task_id_ref',
  contractRunId: 'params->orchestration_contract->>run_id',
} as const;

export const LEGACY_ORCHESTRATOR_REFERENCE_PATHS = {
  taskId: [
    'params->>orchestrator_task_id',
    'params->orchestrator_details->>orchestrator_task_id',
  ],
  runId: [
    'params->>orchestrator_run_id',
    'params->>run_id',
    'params->orchestrator_details->>run_id',
  ],
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function extractOrchestratorRefFromParams(params: unknown): string | null {
  const record = asRecord(params);
  if (!record) {
    return null;
  }

  const contract = asRecord(record.orchestration_contract);
  return (contract?.orchestrator_task_id as string)
    || (record.orchestrator_task_id_ref as string)
    || null;
}

export function buildOrchestratorRefOrFilter(orchestratorTaskId: string): string {
  return [
    `${ORCHESTRATOR_REFERENCE_PATHS.contractTaskId}.eq.${orchestratorTaskId}`,
    `${ORCHESTRATOR_REFERENCE_PATHS.referenceTaskId}.eq.${orchestratorTaskId}`,
  ].join(',');
}

export function buildOrchestratorRunOrFilter(orchestratorRunId: string): string {
  return [
    `${ORCHESTRATOR_REFERENCE_PATHS.contractRunId}.eq.${orchestratorRunId}`,
  ].join(',');
}

export function buildLegacyOrchestratorRefOrFilter(orchestratorTaskId: string): string {
  return LEGACY_ORCHESTRATOR_REFERENCE_PATHS.taskId
    .map((path) => `${path}.eq.${orchestratorTaskId}`)
    .join(',');
}

export function buildLegacyOrchestratorRunOrFilter(orchestratorRunId: string): string {
  return LEGACY_ORCHESTRATOR_REFERENCE_PATHS.runId
    .map((path) => `${path}.eq.${orchestratorRunId}`)
    .join(',');
}
