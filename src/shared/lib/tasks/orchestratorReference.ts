type NullFilterQuery<T> = {
  is: (column: string, value: unknown) => T;
};

export const ORCHESTRATOR_REFERENCE_NULL_FILTER_PATHS = [
  'params->orchestrator_task_id_ref',
  'params->orchestration_contract->orchestrator_task_id',
  'params->orchestration_contract->>orchestrator_task_id',
  'params->>orchestrator_task_id',
  'params->orchestrator_details->>orchestrator_task_id',
  'params->originalParams->orchestrator_details->>orchestrator_task_id',
] as const;

export function applyRootTaskFilter<T extends NullFilterQuery<T>>(query: T): T {
  return ORCHESTRATOR_REFERENCE_NULL_FILTER_PATHS.reduce(
    (currentQuery, path) => currentQuery.is(path, null),
    query,
  );
}
