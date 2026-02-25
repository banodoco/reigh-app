import {
  asRecord,
  asString,
  toRecordOrEmpty,
  type UnknownRecord,
} from './taskParamParsers';

/**
 * Contract-first snapshot of task payload sections.
 * Readers should prefer these normalized sections over ad-hoc path probes.
 */
export interface TaskPayloadSnapshot {
  rawParams: UnknownRecord;
  taskViewContract: UnknownRecord;
  orchestrationContract: UnknownRecord;
  familyContract: UnknownRecord;
  orchestratorDetails: UnknownRecord;
  fullOrchestratorPayload: UnknownRecord;
  individualSegmentParams: UnknownRecord;
}

function hasEntries(record: UnknownRecord): boolean {
  return Object.keys(record).length > 0;
}

function toNonEmptyRecord(value: unknown): UnknownRecord | undefined {
  const record = asRecord(value);
  if (!record || !hasEntries(record)) {
    return undefined;
  }
  return record;
}

function pickRecordWithFallback(
  primary: unknown,
  fallback: unknown,
): UnknownRecord {
  return toNonEmptyRecord(primary)
    ?? toNonEmptyRecord(fallback)
    ?? {};
}

export function buildTaskPayloadSnapshot(rawParams: unknown): TaskPayloadSnapshot {
  const params = toRecordOrEmpty(rawParams);
  const taskViewContract = toRecordOrEmpty(params.task_view_contract);
  const orchestrationContract = toRecordOrEmpty(params.orchestration_contract);
  const familyContract = toRecordOrEmpty(params.family_contract);
  const fullOrchestratorPayload = toRecordOrEmpty(params.full_orchestrator_payload);
  const individualSegmentParams = toRecordOrEmpty(params.individual_segment_params);
  const orchestratorDetails = pickRecordWithFallback(
    params.orchestrator_details,
    fullOrchestratorPayload,
  );

  return {
    rawParams: params,
    taskViewContract,
    orchestrationContract,
    familyContract,
    orchestratorDetails,
    fullOrchestratorPayload,
    individualSegmentParams,
  };
}

export function resolveSnapshotOrchestratorTaskId(
  snapshot: TaskPayloadSnapshot,
): string | undefined {
  return asString(snapshot.orchestrationContract.orchestrator_task_id)
    ?? asString(snapshot.rawParams.orchestrator_task_id_ref)
    ?? asString(snapshot.orchestratorDetails.orchestrator_task_id);
}

export function resolveSnapshotRunId(
  snapshot: TaskPayloadSnapshot,
): string | undefined {
  return asString(snapshot.orchestrationContract.run_id)
    ?? asString(snapshot.orchestratorDetails.run_id)
    ?? asString(snapshot.rawParams.run_id);
}
