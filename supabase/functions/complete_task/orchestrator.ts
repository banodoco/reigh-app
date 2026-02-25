/**
 * Orchestrator completion logic for complete_task
 * Handles checking if all child segments are complete and marking orchestrator done
 */

import type { SupabaseClient } from '../_shared/supabaseClient.ts';
import { extractOrchestratorTaskId, extractOrchestratorRunId } from './params.ts';
import { triggerCostCalculation } from './billing.ts';
import { SEGMENT_TYPE_CONFIG } from './constants.ts';
import { CompletionError, toCompletionError } from './errors.ts';
import {
  lookupTasksByOrchestratorIdWithFallback,
  lookupTasksByRunIdWithFallback,
} from '../_shared/orchestratorReferenceLookup.ts';
import { asObjectOrEmpty } from '../_shared/payloadNormalization.ts';
import { isFailureStatus } from '../_shared/taskStatusSemantics.ts';
import { assertCompletionAuthContext, type CompletionAuthContext } from './authContext.ts';
import {
  buildBillingOutcome,
  buildBillingReconciliation,
  classifyBillingOutcome,
  evaluateSegmentCompletionGate,
  resolveExpectedSegmentCount,
  summarizeSegmentCompletion,
  type BillingPolicyDecision,
} from './orchestratorPolicy.ts';
export { evaluateSegmentCompletionGate } from './orchestratorPolicy.ts';

/** Minimal shape for segment tasks returned from DB queries */
interface SegmentTask {
  id: string;
  status: string;
  generation_started_at: string | null;
}

/** Minimal shape for the orchestrator task fetched from DB */
interface OrchestratorTask {
  id: string;
  status: string;
  params: Record<string, unknown>;
  result_data: unknown;
}

interface TaskContext {
  task_type: string;
  project_id: string;
  params: Record<string, unknown>;
}

interface TaskUpdateRow {
  id: string;
}

interface CheckOrchestratorCompletionParams {
  supabase: SupabaseClient;
  taskIdString: string;
  completedTask: TaskContext;
  publicUrl: string;
  supabaseUrl: string;
  serviceKey: string;
  authContext: CompletionAuthContext;
  logger?: {
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
}

async function persistBillingOutcome(
  supabase: SupabaseClient,
  orchestratorTaskId: string,
  existingResultData: Record<string, unknown>,
  billingOutcome: Record<string, unknown>,
  decision: BillingPolicyDecision,
  logger?: {
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  },
): Promise<void> {
  const reconciliation = buildBillingReconciliation(decision);
  const { error: billingPersistError } = await supabase
    .from("tasks")
    .update({
      result_data: {
        ...existingResultData,
        billing_outcome: billingOutcome,
        billing_reconciliation: reconciliation,
      },
    })
    .eq("id", orchestratorTaskId);

  if (!billingPersistError) {
    return;
  }

  const fallbackMessage = `[OrchestratorComplete] Billing outcome persistence failed (reconciliation required=${decision.reconciliationRequired}, retry=${decision.retryRecommended})`;
  const { error: fallbackPersistError } = await supabase
    .from("tasks")
    .update({
      error_message: fallbackMessage,
    })
    .eq("id", orchestratorTaskId);

  if (fallbackPersistError) {
    throw new CompletionError({
      code: 'orchestrator_billing_outcome_persist_failed',
      context: 'persistBillingOutcome',
      recoverable: true,
      message: `[OrchestratorComplete] Failed to persist billing outcome metadata and fallback marker for orchestrator ${orchestratorTaskId}`,
      metadata: {
        orchestrator_task_id: orchestratorTaskId,
        fallback_persist_error: fallbackPersistError instanceof Error
          ? fallbackPersistError.message
          : String(fallbackPersistError),
      },
      cause: fallbackPersistError,
    });
  }

  logger?.error('Failed to persist billing outcome metadata; fallback marker written', {
    orchestrator_task_id: orchestratorTaskId,
    billing_persist_error: billingPersistError instanceof Error
      ? billingPersistError.message
      : String(billingPersistError),
    fallback_message: fallbackMessage,
  });
}

/**
 * Check if all sibling segments are complete and mark orchestrator done if so
 */
export async function checkOrchestratorCompletion(
  params: CheckOrchestratorCompletionParams,
): Promise<void> {
  const {
    supabase,
    taskIdString,
    completedTask,
    publicUrl,
    supabaseUrl,
    serviceKey,
    logger,
  } = params;
  assertCompletionAuthContext(params.authContext, 'checkOrchestratorCompletion');
  try {
    const taskType = completedTask.task_type;
    const config = taskType ? SEGMENT_TYPE_CONFIG[taskType] : null;

    if (!config) {
      return; // Not a segment task
    }

    const orchestratorTaskId = extractOrchestratorTaskId(completedTask.params, 'OrchestratorComplete');
    const orchestratorRunId = extractOrchestratorRunId(completedTask.params, 'OrchestratorComplete');

    if (!orchestratorTaskId) {
      return;
    }

    // FETCH: orchestrator task + sibling segments in parallel
    const segmentTypeToQuery = config.isFinalStep
      ? (config.billingSegmentType || config.segmentType)
      : config.segmentType;

    const orchPromise: Promise<{ data: OrchestratorTask | null; error: unknown }> =
      supabase.from("tasks").select("id, status, params, result_data").eq("id", orchestratorTaskId).single();

    const [orchResult, allSegments] = await Promise.all([
      orchPromise,
      findSiblingSegments(supabase, segmentTypeToQuery, completedTask.project_id, orchestratorTaskId, orchestratorRunId),
    ]);

    // VALIDATE: orchestrator exists and isn't already done
    const { data: orchestratorTask, error: orchError } = orchResult;

    if (orchError) {
      throw new CompletionError({
        code: 'orchestrator_fetch_failed',
        context: 'checkOrchestratorCompletion',
        recoverable: true,
        message: `[OrchestratorComplete] Error fetching orchestrator task ${orchestratorTaskId}`,
        metadata: {
          orchestrator_task_id: orchestratorTaskId,
          fetch_error: orchError instanceof Error ? orchError.message : String(orchError),
        },
        cause: orchError,
      });
    }

    if (!orchestratorTask) {
      return;
    }

    if (orchestratorTask.status === 'Complete') {
      return;
    }

    // FINAL STEP: tasks like join_final_stitch complete the orchestrator directly
    if (config.isFinalStep) {

      await markOrchestratorComplete(
        {
          supabase,
          orchestratorTask,
          orchestratorTaskId,
          allSegments,
          publicUrl,
          isFinalStep: true,
          supabaseUrl,
          serviceKey,
        },
      );
      return;
    }

    const expectedSegmentCountResolution = resolveExpectedSegmentCount(
      taskType,
      orchestratorTask.params,
    );
    if (expectedSegmentCountResolution.invalid) {
      throw new CompletionError({
        code: 'orchestrator_expected_segment_count_invalid',
        context: 'checkOrchestratorCompletion',
        recoverable: false,
        message: `Invalid expected segment count contract for orchestrator ${orchestratorTaskId}`,
        metadata: {
          orchestrator_task_id: orchestratorTaskId,
          task_type: taskType,
          source: expectedSegmentCountResolution.source ?? 'unknown',
          raw_value: expectedSegmentCountResolution.raw ?? null,
        },
      });
    }

    const segmentStats = summarizeSegmentCompletion(allSegments);
    const segmentGate = evaluateSegmentCompletionGate(
      expectedSegmentCountResolution.value,
      segmentStats,
    );

    if (segmentGate.kind === 'wait') {
      return;
    }

    if (segmentGate.kind === 'fail') {
      if (segmentGate.reason === 'segments_failed') {
        await markOrchestratorFailed(
          supabase,
          orchestratorTaskId,
          segmentGate.failedSegments,
          segmentGate.foundSegments,
          undefined,
          logger,
        );
      } else {
        await markOrchestratorFailed(
          supabase,
          orchestratorTaskId,
          0,
          segmentGate.expectedSegments,
          `Only ${segmentGate.foundSegments} of ${segmentGate.expectedSegments} expected segments were found`,
          logger,
        );
      }
      return;
    }

    // WAIT: check if a final step task (like join_final_stitch) is still pending
    if (config.waitForFinalStepType) {
      const finalStitchStatus = await checkFinalStitchStatus(
        supabase,
        config.waitForFinalStepType,
        completedTask.project_id,
        orchestratorTaskId,
        orchestratorRunId,
      );

      switch (finalStitchStatus) {
        case 'pending':
          return;
        case 'failed':
          await markOrchestratorFailed(supabase, orchestratorTaskId, 1, 1, undefined, logger);
          return;
        default:
          break;
      }

    }

    // COMPLETE: all segments done, no pending final step
    await markOrchestratorComplete(
      {
        supabase,
        orchestratorTask,
        orchestratorTaskId,
        allSegments,
        publicUrl,
        isFinalStep: false,
        supabaseUrl,
        serviceKey,
        logger,
      },
    );
  } catch (error) {
    throw toCompletionError(error, {
      code: 'orchestrator_completion_failed',
      context: 'checkOrchestratorCompletion',
      recoverable: true,
      message: `[OrchestratorComplete] Completion flow failed for task ${taskIdString}`,
      metadata: {
        task_id: taskIdString,
        task_type: completedTask.task_type,
        project_id: completedTask.project_id,
      },
    });
  }
}

/**
 * Find sibling segment tasks using run_id (preferred) or orchestrator_task_id (fallback)
 */
async function findSiblingSegments(
  supabase: SupabaseClient,
  segmentType: string,
  projectId: string,
  orchestratorTaskId: string,
  orchestratorRunId: string | null
): Promise<SegmentTask[]> {
  if (orchestratorRunId) {
    const runIdRows = await lookupTasksByRunIdWithFallback<SegmentTask>({
      supabase,
      taskType: segmentType,
      projectId,
      select: "id, status, generation_started_at",
      runId: orchestratorRunId,
      contextLabel: 'OrchestratorComplete',
    });

    if (runIdRows.length > 0) {
      return runIdRows;
    }
  }

  const orchestratorRows = await lookupTasksByOrchestratorIdWithFallback<SegmentTask>({
    supabase,
    taskType: segmentType,
    projectId,
    select: "id, status, generation_started_at",
    orchestratorTaskId,
    contextLabel: 'OrchestratorComplete',
  });

  return orchestratorRows;
}

/**
 * Check the status of the final stitch task for this orchestrator
 */
async function checkFinalStitchStatus(
  supabase: SupabaseClient,
  finalStepType: string,
  projectId: string,
  orchestratorTaskId: string,
  orchestratorRunId: string | null,
): Promise<'not_found' | 'pending' | 'complete' | 'failed'> {
  let finalStepTasks: Array<{ id: string; status: string }> = [];
  if (orchestratorRunId) {
    finalStepTasks = await lookupTasksByRunIdWithFallback<{ id: string; status: string }>({
      supabase,
      taskType: finalStepType,
      projectId,
      select: "id, status",
      runId: orchestratorRunId,
      contextLabel: 'OrchestratorComplete',
    });
  }

  if (finalStepTasks.length === 0) {
    finalStepTasks = await lookupTasksByOrchestratorIdWithFallback<{ id: string; status: string }>({
      supabase,
      taskType: finalStepType,
      projectId,
      select: "id, status",
      orchestratorTaskId,
      contextLabel: 'OrchestratorComplete',
    });
  }

  if (!finalStepTasks || finalStepTasks.length === 0) {
    return 'not_found';
  }

  if (finalStepTasks.some((task) => isFailureStatus(task.status))) {
    return 'failed';
  }

  if (finalStepTasks.some((task) => task.status === 'Complete')) {
    return 'complete';
  }

  if (finalStepTasks.some((task) => task.status === 'Queued' || task.status === 'In Progress')) {
    return 'pending';
  }

  return 'pending';
}

/**
 * Mark orchestrator as Failed
 */
async function markOrchestratorFailed(
  supabase: SupabaseClient,
  orchestratorTaskId: string,
  failedSegments: number,
  totalSegments: number,
  errorMessage?: string,
  logger?: {
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  },
): Promise<void> {

  const { data: updatedRows, error: updateOrchError } = await supabase
    .from("tasks")
    .update({
      status: "Failed",
      error_message: errorMessage ?? `${failedSegments} of ${totalSegments} segments failed`,
      generation_processed_at: new Date().toISOString()
    })
    .eq("id", orchestratorTaskId)
    .in("status", ["Queued", "In Progress"])
    .select('id');

  if (updateOrchError) {
    throw new CompletionError({
      code: 'orchestrator_mark_failed_update_failed',
      context: 'markOrchestratorFailed',
      recoverable: true,
      message: `[OrchestratorComplete] Failed to mark orchestrator ${orchestratorTaskId} as Failed`,
      metadata: {
        orchestrator_task_id: orchestratorTaskId,
        update_error: updateOrchError instanceof Error
          ? updateOrchError.message
          : String(updateOrchError),
      },
      cause: updateOrchError,
    });
  }

  const transitionedRows = (updatedRows ?? []) as TaskUpdateRow[];
  if (transitionedRows.length === 0) {
    logger?.warn('Orchestrator already terminal while marking failed', {
      orchestrator_task_id: orchestratorTaskId,
      failed_segments: failedSegments,
      total_segments: totalSegments,
    });
  }
}

/**
 * Mark orchestrator as Complete and trigger billing
 */
async function markOrchestratorComplete(
  params: {
    supabase: SupabaseClient;
    orchestratorTask: OrchestratorTask;
    orchestratorTaskId: string;
    allSegments: SegmentTask[];
    publicUrl: string;
    isFinalStep: boolean;
    supabaseUrl: string;
    serviceKey: string;
    logger?: {
      warn: (message: string, context?: Record<string, unknown>) => void;
      error: (message: string, context?: Record<string, unknown>) => void;
    };
  },
): Promise<void> {
  const {
    supabase,
    orchestratorTask,
    orchestratorTaskId,
    allSegments,
    publicUrl,
    isFinalStep,
    supabaseUrl,
    serviceKey,
    logger,
  } = params;

  // Find earliest sub-task start time for billing
  let earliestStartTime: string | null = null;
  for (const segment of allSegments) {
    if (segment.generation_started_at) {
      if (!earliestStartTime || segment.generation_started_at < earliestStartTime) {
        earliestStartTime = segment.generation_started_at;
      }
    }
  }

  const updateData: Record<string, unknown> = {
    status: "Complete",
    generation_started_at: earliestStartTime || new Date().toISOString(),
    generation_processed_at: new Date().toISOString()
  };

  // Only set output_location for final step tasks (e.g. join_final_stitch)
  // where publicUrl is the actual stitched output. For segment completions,
  // publicUrl is an arbitrary segment URL that shouldn't be the orchestrator's output.
  if (isFinalStep) {
    updateData.output_location = publicUrl;
  }

  const { data: updatedRows, error: updateOrchError } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", orchestratorTaskId)
    .in("status", ["Queued", "In Progress"])
    .select('id');

  if (updateOrchError) {
    throw new CompletionError({
      code: 'orchestrator_mark_complete_update_failed',
      context: 'markOrchestratorComplete',
      recoverable: true,
      message: `[OrchestratorComplete] Failed to mark orchestrator ${orchestratorTaskId} as Complete`,
      metadata: {
        orchestrator_task_id: orchestratorTaskId,
        update_error: updateOrchError instanceof Error
          ? updateOrchError.message
          : String(updateOrchError),
      },
      cause: updateOrchError,
    });
  }

  const transitionedRows = (updatedRows ?? []) as TaskUpdateRow[];
  if (transitionedRows.length === 0) {
    logger?.warn('Orchestrator already in terminal status; skipping billing side effects', {
      orchestrator_task_id: orchestratorTaskId,
    });
    return;
  }

  const billingResult = await triggerCostCalculation({
    supabaseUrl,
    serviceKey,
    taskId: orchestratorTaskId,
    logTag: 'OrchestratorComplete',
  });
  const existingResultData = asObjectOrEmpty(orchestratorTask.result_data);
  const billingDecision = classifyBillingOutcome(billingResult);
  const billingOutcome = buildBillingOutcome(billingResult, billingDecision);

  await persistBillingOutcome(
    supabase,
    orchestratorTaskId,
    existingResultData,
    billingOutcome,
    billingDecision,
    logger,
  );

  if (billingDecision.reconciliationRequired) {
    logger?.warn('Billing requires reconciliation policy follow-up', {
      orchestrator_task_id: orchestratorTaskId,
      billing_decision: billingDecision,
      billing_result: billingResult,
    });
  }
}
