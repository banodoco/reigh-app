/**
 * Shared billing utilities for edge functions
 *
 * Centralizes:
 *  - Orchestrator/sub-task detection (extractOrchestratorRef, isSubTask)
 *  - Sub-task query filter for Supabase `.or()` calls
 *  - Cost calculation HTTP trigger
 *
 * Consumers: calculate-task-cost, update-task-status, complete_task
 */

import { buildOrchestratorRefOrFilter, extractOrchestratorRefFromParams } from './orchestratorReference.ts';
import { readEdgeErrorCode } from './edgeRequest.ts';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from './edgeOperation.ts';

interface TaskQueryResponse {
  data: unknown[] | null;
  error: unknown;
}

interface TaskQueryBuilder extends PromiseLike<TaskQueryResponse> {
  eq(column: string, value: string): TaskQueryBuilder;
  or(filter: string): TaskQueryBuilder;
}

interface TaskQueryClient {
  from(table: string): {
    select(columns: string): TaskQueryBuilder;
  };
}

// ===== Constants =====

/** UUID v4 regex — used to distinguish real orchestrator FK refs from human-readable IDs */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ===== Orchestrator reference extraction =====

/**
 * Extract orchestrator_task_id from task params.
 *
 * Sub-tasks can store the orchestrator reference in multiple param paths
 * depending on the task type and how they were created:
 *  - params.orchestrator_task_id_ref          (travel_segment)
 *  - params.orchestrator_details.orchestrator_task_id  (join_clips_segment)
 *  - params.originalParams.orchestrator_details.orchestrator_task_id (legacy)
 *  - params.orchestrator_task_id              (some legacy tasks)
 *
 * Returns the raw string value (may not be a valid UUID) or null.
 */
export function extractOrchestratorRef(params: unknown): string | null {
  const contractOrReferencePath = extractOrchestratorRefFromParams(params);
  if (contractOrReferencePath) {
    return contractOrReferencePath;
  }

  if (!params || typeof params !== 'object') return null;

  const p = params as Record<string, unknown>;
  const details = p.orchestrator_details as Record<string, unknown> | undefined;
  const originalParams = p.originalParams as Record<string, unknown> | undefined;
  const originalDetails = originalParams?.orchestrator_details as Record<string, unknown> | undefined;

  return (
    (p.orchestrator_task_id_ref as string) ||
    (details?.orchestrator_task_id as string) ||
    (originalDetails?.orchestrator_task_id as string) ||
    (p.orchestrator_task_id as string) ||
    null
  );
}

/**
 * Determine whether a task is a sub-task of an orchestrator.
 *
 * A task is a sub-task when:
 *  1. Its params contain an orchestrator reference (via any of the known paths)
 *  2. That reference is a valid UUID (not a human-readable orchestrator ID)
 *  3. The reference is NOT the task's own ID (orchestrators store their own ID
 *     in params.orchestrator_details.orchestrator_task_id for children to copy)
 *
 * @param params  - task.params (object, not stringified)
 * @param taskId  - the task's own ID, to guard against self-references
 * @returns The orchestrator task ID if this is a sub-task, or null otherwise
 */
export function getSubTaskOrchestratorId(params: unknown, taskId: string): string | null {
  const ref = extractOrchestratorRef(params);
  if (!ref) return null;
  if (!UUID_REGEX.test(ref)) return null;
  if (ref === taskId) return null;
  return ref;
}

// ===== Sub-task query filter =====

/**
 * Build a Supabase PostgREST `.or()` filter string that finds all tasks
 * whose params reference the given orchestrator task ID.
 *
 * Covers all four param paths where a sub-task may store the reference.
 *
 * Usage:
 *   supabase.from('tasks').select('...').or(buildSubTaskFilter(orchestratorId))
 */
export function buildSubTaskFilter(orchestratorTaskId: string): string {
  return [
    buildCanonicalSubTaskFilter(orchestratorTaskId),
    buildLegacySubTaskFilter(orchestratorTaskId),
  ].join(',');
}

export function buildCanonicalSubTaskFilter(orchestratorTaskId: string): string {
  return buildOrchestratorRefOrFilter(orchestratorTaskId);
}

export function buildLegacySubTaskFilter(orchestratorTaskId: string): string {
  return [
    `params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`,
    `params->originalParams->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`,
    `params->>orchestrator_task_id.eq.${orchestratorTaskId}`,
  ].join(',');
}

export interface CompletedSubTaskRow {
  id: string;
  generation_started_at: string | null;
  generation_processed_at: string | null;
  status: string;
}

export type SubTaskLookupStage = 'canonical' | 'legacy';

export class SubTaskLookupError extends Error {
  readonly code = 'subtask_lookup_failed';
  readonly stage: SubTaskLookupStage;
  readonly cause?: unknown;

  constructor(stage: SubTaskLookupStage, cause: unknown) {
    super(`[Billing] Failed to query ${stage} sub-task references`);
    this.name = 'SubTaskLookupError';
    this.stage = stage;
    this.cause = cause;
  }
}

export async function lookupCompletedSubTasksForOrchestrator(
  supabaseAdmin: TaskQueryClient,
  orchestratorTaskId: string,
): Promise<CompletedSubTaskRow[]> {
  const canonicalResult = await supabaseAdmin
    .from('tasks')
    .select(`
      id,
      generation_started_at,
      generation_processed_at,
      status
    `)
    .or(buildCanonicalSubTaskFilter(orchestratorTaskId))
    .eq('status', 'Complete');

  if (canonicalResult.error) {
    throw new SubTaskLookupError('canonical', canonicalResult.error);
  }

  const canonicalTasks = (canonicalResult.data ?? []) as CompletedSubTaskRow[];
  if (canonicalTasks.length > 0) {
    return canonicalTasks;
  }

  const legacyResult = await supabaseAdmin
    .from('tasks')
    .select(`
      id,
      generation_started_at,
      generation_processed_at,
      status
    `)
    .or(buildLegacySubTaskFilter(orchestratorTaskId))
    .eq('status', 'Complete');

  if (legacyResult.error) {
    throw new SubTaskLookupError('legacy', legacyResult.error);
  }

  const legacyTasks = (legacyResult.data ?? []) as CompletedSubTaskRow[];
  if (legacyTasks.length > 0) {
    return legacyTasks;
  }

  return [];
}

// ===== Cost calculation trigger =====

/**
 * Trigger the calculate-task-cost edge function for a given task.
 *
 * Returns an explicit outcome so callers can branch on billing success/failure.
 *
 * @param supabaseUrl - The Supabase project URL
 * @param serviceKey  - The service role key for authentication
 * @param taskId      - The task ID to calculate cost for
 * @param logTag      - Optional log tag prefix (default: 'CostCalc')
 */
export interface CostCalculationTriggerValue {
  status: number | null;
  skipped?: boolean;
  cost?: number;
}

export type CostCalculationTriggerResult = OperationResult<CostCalculationTriggerValue>;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function triggerCostCalculation(
  params: {
    supabaseUrl: string;
    serviceKey: string;
    taskId: string;
    logTag?: string;
  },
): Promise<CostCalculationTriggerResult> {
  const {
    supabaseUrl,
    serviceKey,
    taskId,
    logTag = 'CostCalc',
  } = params;
  try {
    const costResp = await fetch(`${supabaseUrl}/functions/v1/calculate-task-cost`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ task_id: taskId })
    });

    if (costResp.ok) {
      const bodyText = await costResp.text();
      const costData = parseJsonRecord(bodyText);
      if (!costData) {
        return operationFailure(new Error(`[${logTag}] Cost calculation returned an invalid success payload`), {
          policy: 'degrade',
          errorCode: 'cost_calculation_invalid_response',
          message: `[${logTag}] Cost calculation returned an invalid success payload`,
          recoverable: true,
          cause: { status: costResp.status },
        });
      }

      const costErrorCode = readEdgeErrorCode(costData);
      if (costErrorCode) {
        return operationFailure(new Error(`[${logTag}] Cost calculation returned an error payload`), {
          policy: 'degrade',
          errorCode: costErrorCode,
          message: typeof costData.message === 'string'
            ? costData.message
            : `[${logTag}] Cost calculation returned an error payload`,
          recoverable: true,
          cause: { status: costResp.status, payload: costData },
        });
      }

      const skipped = costData.skipped === true;
      const successFlag = costData.success;
      if (!skipped && successFlag !== true) {
        return operationFailure(new Error(`[${logTag}] Cost calculation returned success status without success=true`), {
          policy: 'degrade',
          errorCode: 'cost_calculation_invalid_response',
          message: `[${logTag}] Cost calculation returned success status without success=true`,
          recoverable: true,
          cause: { status: costResp.status, payload: costData },
        });
      }

      const costValue = costData.cost;
      if (!skipped && (typeof costValue !== 'number' || !Number.isFinite(costValue))) {
        return operationFailure(new Error(`[${logTag}] Cost calculation success payload missing numeric cost`), {
          policy: 'degrade',
          errorCode: 'cost_calculation_invalid_response',
          message: `[${logTag}] Cost calculation success payload missing numeric cost`,
          recoverable: true,
          cause: { status: costResp.status, payload: costData },
        });
      }

      return operationSuccess(
        {
          status: costResp.status,
          skipped,
          cost: typeof costValue === 'number' && Number.isFinite(costValue)
            ? costValue
            : undefined,
        },
        { policy: 'best_effort' },
      );
    }

    const errTxt = await costResp.text();
    const errPayload = parseJsonRecord(errTxt);
    const errorCode = readEdgeErrorCode(errPayload) ?? 'cost_calculation_failed';
    const message = typeof errPayload?.message === 'string'
      ? errPayload.message
      : (errTxt || 'Cost calculation failed');
    return operationFailure(new Error(message), {
      policy: 'degrade',
      errorCode,
      message,
      recoverable: costResp.status >= 500,
      cause: { status: costResp.status, payload: errPayload ?? errTxt },
    });
  } catch (costErr) {
    const message = costErr instanceof Error ? costErr.message : String(costErr);
    return operationFailure(new Error(`[${logTag}] ${message}`), {
      policy: 'degrade',
      errorCode: 'cost_calculation_request_error',
      message: `[${logTag}] ${message}`,
      recoverable: true,
      cause: costErr,
    });
  }
}
