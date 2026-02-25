interface UnknownRecord {
  [key: string]: unknown;
}

export interface TaskPayloadSnapshot {
  rawParams: UnknownRecord;
  orchestrationContract: UnknownRecord;
  orchestratorDetails: UnknownRecord;
  fullOrchestratorPayload: UnknownRecord;
  individualSegmentParams: UnknownRecord;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = asString(value);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

export function buildTaskPayloadSnapshot(rawParams: unknown): TaskPayloadSnapshot {
  const params = asRecord(rawParams);
  const orchestrationContract = asRecord(params.orchestration_contract);
  const fullOrchestratorPayload = asRecord(params.full_orchestrator_payload);
  const orchestratorDetails = asRecord(
    params.orchestrator_details ?? fullOrchestratorPayload,
  );
  const individualSegmentParams = asRecord(params.individual_segment_params);

  return {
    rawParams: params,
    orchestrationContract,
    orchestratorDetails,
    fullOrchestratorPayload,
    individualSegmentParams,
  };
}

export function resolveSnapshotBasedOn(snapshot: TaskPayloadSnapshot): string | null {
  return pickFirstString(
    snapshot.orchestrationContract.based_on,
    snapshot.rawParams.based_on,
    snapshot.orchestratorDetails.based_on,
    snapshot.fullOrchestratorPayload.based_on,
    snapshot.individualSegmentParams.based_on,
  );
}

export function resolveSnapshotChildGenerationId(snapshot: TaskPayloadSnapshot): string | null {
  return pickFirstString(
    snapshot.orchestrationContract.child_generation_id,
    snapshot.rawParams.child_generation_id,
    snapshot.individualSegmentParams.child_generation_id,
  );
}

export function resolveSnapshotParentGenerationId(snapshot: TaskPayloadSnapshot): string | null {
  return pickFirstString(
    snapshot.orchestrationContract.parent_generation_id,
    snapshot.rawParams.parent_generation_id,
    snapshot.orchestratorDetails.parent_generation_id,
    snapshot.fullOrchestratorPayload.parent_generation_id,
  );
}

export function resolveSnapshotChildOrder(snapshot: TaskPayloadSnapshot): number | null {
  return pickFirstNumber(
    snapshot.orchestrationContract.child_order,
    snapshot.rawParams.child_order,
    snapshot.rawParams.segment_index,
    snapshot.rawParams.join_index,
    snapshot.individualSegmentParams.child_order,
  );
}

export function resolveSnapshotIsSingleItem(snapshot: TaskPayloadSnapshot): boolean {
  const explicit = asBoolean(
    snapshot.orchestrationContract.is_single_item
      ?? snapshot.rawParams.is_single_item,
  );
  if (explicit !== null) {
    return explicit;
  }

  return (
    snapshot.rawParams.is_first_segment === true
    && snapshot.rawParams.is_last_segment === true
  );
}
