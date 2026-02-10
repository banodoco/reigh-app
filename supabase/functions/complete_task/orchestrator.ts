/**
 * Orchestrator completion logic for complete_task
 * Handles checking if all child segments are complete and marking orchestrator done
 */

import { extractOrchestratorTaskId, extractOrchestratorRunId } from './params.ts';
import { triggerCostCalculation } from './billing.ts';
import { TASK_TYPES, SEGMENT_TYPE_CONFIG } from './constants.ts';
import type { TaskContext } from './index.ts';

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
  params: Record<string, any>;
}

/**
 * Check if all sibling segments are complete and mark orchestrator done if so
 */
export async function checkOrchestratorCompletion(
  supabase: any,
  taskIdString: string,
  completedTask: TaskContext,
  publicUrl: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<void> {
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

  console.log(`[OrchestratorComplete] ${taskType} ${taskIdString} completed. Checking siblings for orchestrator ${orchestratorTaskId}`);

  // FETCH: orchestrator task + sibling segments in parallel
  const segmentTypeToQuery = config.isFinalStep
    ? (config.billingSegmentType || config.segmentType)
    : config.segmentType;

  const orchPromise: Promise<{ data: OrchestratorTask | null; error: any }> =
    supabase.from("tasks").select("id, status, params").eq("id", orchestratorTaskId).single();

  const [orchResult, allSegments] = await Promise.all([
    orchPromise,
    findSiblingSegments(supabase, segmentTypeToQuery, completedTask.project_id, orchestratorTaskId, orchestratorRunId),
  ]);

  // VALIDATE: orchestrator exists and isn't already done
  const { data: orchestratorTask, error: orchError } = orchResult;

  if (orchError) {
    console.error(`[OrchestratorComplete] Error fetching orchestrator task ${orchestratorTaskId}:`, orchError);
    return;
  }

  if (!orchestratorTask) {
    console.log(`[OrchestratorComplete] Orchestrator task ${orchestratorTaskId} not found`);
    return;
  }

  if (orchestratorTask.status === 'Complete') {
    console.log(`[OrchestratorComplete] Orchestrator ${orchestratorTaskId} is already Complete`);
    return;
  }

  // FINAL STEP: tasks like join_final_stitch complete the orchestrator directly
  if (config.isFinalStep) {
    console.log(`[OrchestratorComplete] ${taskType} is a final step task - marking orchestrator complete directly`);

    await markOrchestratorComplete(
      supabase,
      orchestratorTaskId,
      allSegments || [],
      publicUrl,
      true,
      supabaseUrl,
      serviceKey
    );
    return;
  }

  // COUNT: check segment completion status
  let expectedSegmentCount: number | null = null;

  if (taskType === TASK_TYPES.TRAVEL_SEGMENT) {
    expectedSegmentCount = orchestratorTask.params?.orchestrator_details?.num_new_segments_to_generate ||
      orchestratorTask.params?.num_new_segments_to_generate || null;
  } else if (taskType === TASK_TYPES.JOIN_CLIPS_SEGMENT) {
    const clipList = orchestratorTask.params?.orchestrator_details?.clip_list;
    if (Array.isArray(clipList) && clipList.length > 1) {
      expectedSegmentCount = clipList.length - 1;
    } else {
      expectedSegmentCount = orchestratorTask.params?.orchestrator_details?.num_joins || null;
    }
  }

  console.log(`[OrchestratorComplete] Orchestrator expects ${expectedSegmentCount ?? 'unknown'} segments`);

  if (!allSegments || allSegments.length === 0) {
    console.log(`[OrchestratorComplete] No segments found for orchestrator`);
    return;
  }

  const foundSegments = allSegments.length;
  const completedSegments = allSegments.filter((s) => s.status === 'Complete').length;
  const failedSegments = allSegments.filter((s) => s.status === 'Failed' || s.status === 'Cancelled').length;
  const pendingSegments = foundSegments - completedSegments - failedSegments;

  console.log(`[OrchestratorComplete] ${taskType} status: ${completedSegments} complete, ${failedSegments} failed, ${pendingSegments} pending`);

  if (expectedSegmentCount !== null && foundSegments !== expectedSegmentCount) {
    console.log(`[OrchestratorComplete] Warning: Found ${foundSegments} segments but expected ${expectedSegmentCount}`);
    return;
  }

  if (pendingSegments > 0) {
    console.log(`[OrchestratorComplete] Still waiting for ${pendingSegments} segments to complete`);
    return;
  }

  if (failedSegments > 0) {
    await markOrchestratorFailed(supabase, orchestratorTaskId, failedSegments, foundSegments);
    return;
  }

  // WAIT: check if a final step task (like join_final_stitch) is still pending
  if (config.waitForFinalStepType) {
    const finalStitchStatus = await checkFinalStitchStatus(
      supabase,
      config.waitForFinalStepType,
      completedTask.project_id,
      orchestratorTaskId,
    );

    if (finalStitchStatus === 'pending') {
      console.log(`[OrchestratorComplete] Waiting for ${config.waitForFinalStepType} to complete`);
      return;
    }

    if (finalStitchStatus === 'failed') {
      console.log(`[OrchestratorComplete] Final stitch failed - marking orchestrator as Failed`);
      await markOrchestratorFailed(supabase, orchestratorTaskId, 1, 1);
      return;
    }

    if (finalStitchStatus === 'complete') {
      console.log(`[OrchestratorComplete] Final stitch is complete - will mark orchestrator complete`);
    }
  }

  // COMPLETE: all segments done, no pending final step
  await markOrchestratorComplete(
    supabase,
    orchestratorTaskId,
    allSegments,
    publicUrl,
    false,
    supabaseUrl,
    serviceKey
  );
}

/**
 * Find sibling segment tasks using run_id (preferred) or orchestrator_task_id (fallback)
 */
async function findSiblingSegments(
  supabase: any,
  segmentType: string,
  projectId: string,
  orchestratorTaskId: string,
  orchestratorRunId: string | null
): Promise<SegmentTask[] | null> {
  let allSegments: SegmentTask[] | null = null;
  let segmentsError: any = null;

  if (orchestratorRunId) {
    console.log(`[OrchestratorComplete] Querying ${segmentType} by run_id: ${orchestratorRunId}`);

    const runIdResult = await supabase
      .from("tasks")
      .select("id, status, generation_started_at")
      .eq("task_type", segmentType)
      .eq("project_id", projectId)
      .or(`params->>orchestrator_run_id.eq.${orchestratorRunId},params->>run_id.eq.${orchestratorRunId},params->orchestrator_details->>run_id.eq.${orchestratorRunId}`);

    allSegments = runIdResult.data;
    segmentsError = runIdResult.error;

    if (allSegments && allSegments.length > 0) {
      console.log(`[OrchestratorComplete] Found ${allSegments.length} segments via run_id query`);
      return allSegments;
    }
  }

  if ((!allSegments || allSegments.length === 0) && !segmentsError) {
    console.log(`[OrchestratorComplete] Trying orchestrator_task_id: ${orchestratorTaskId}`);

    const orchIdResult = await supabase
      .from("tasks")
      .select("id, status, generation_started_at")
      .eq("task_type", segmentType)
      .eq("project_id", projectId)
      .or(`params->>orchestrator_task_id.eq.${orchestratorTaskId},params->>orchestrator_task_id_ref.eq.${orchestratorTaskId},params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`);

    allSegments = orchIdResult.data;
    segmentsError = orchIdResult.error;

    if (allSegments && allSegments.length > 0) {
      console.log(`[OrchestratorComplete] Found ${allSegments.length} segments via orchestrator_task_id query`);
    }
  }

  if (segmentsError) {
    console.error(`[OrchestratorComplete] Error querying segments:`, segmentsError);
    return null;
  }

  return allSegments;
}

/**
 * Check the status of the final stitch task for this orchestrator
 */
async function checkFinalStitchStatus(
  supabase: any,
  finalStepType: string,
  projectId: string,
  orchestratorTaskId: string,
): Promise<'not_found' | 'pending' | 'complete' | 'failed'> {
  console.log(`[OrchestratorComplete] Checking status of ${finalStepType} tasks for orchestrator ${orchestratorTaskId}`);

  const { data: finalStepTasks, error } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("task_type", finalStepType)
    .eq("project_id", projectId)
    .or(`params->>orchestrator_task_id.eq.${orchestratorTaskId},params->>orchestrator_task_id_ref.eq.${orchestratorTaskId},params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`);

  if (error) {
    console.error(`[OrchestratorComplete] Error checking final stitch status:`, error);
    return 'not_found';
  }

  if (!finalStepTasks || finalStepTasks.length === 0) {
    console.log(`[OrchestratorComplete] No ${finalStepType} tasks found - task not yet created`);
    return 'not_found';
  }

  const task = finalStepTasks[0];
  console.log(`[OrchestratorComplete] Found ${finalStepType} task ${task.id} with status: ${task.status}`);

  if (task.status === 'Complete') {
    return 'complete';
  } else if (task.status === 'Failed' || task.status === 'Cancelled') {
    return 'failed';
  } else {
    return 'pending';
  }
}

/**
 * Mark orchestrator as Failed
 */
async function markOrchestratorFailed(
  supabase: any,
  orchestratorTaskId: string,
  failedSegments: number,
  totalSegments: number
): Promise<void> {
  console.log(`[OrchestratorComplete] Marking orchestrator ${orchestratorTaskId} as Failed (${failedSegments}/${totalSegments} failed)`);

  const { error: updateOrchError } = await supabase
    .from("tasks")
    .update({
      status: "Failed",
      error_message: `${failedSegments} of ${totalSegments} segments failed`,
      generation_processed_at: new Date().toISOString()
    })
    .eq("id", orchestratorTaskId)
    .in("status", ["Queued", "In Progress"]);

  if (updateOrchError) {
    console.error(`[OrchestratorComplete] Failed to mark orchestrator as Failed:`, updateOrchError);
  } else {
    console.log(`[OrchestratorComplete] Marked orchestrator ${orchestratorTaskId} as Failed`);
  }
}

/**
 * Mark orchestrator as Complete and trigger billing
 */
async function markOrchestratorComplete(
  supabase: any,
  orchestratorTaskId: string,
  allSegments: SegmentTask[],
  publicUrl: string,
  isFinalStep: boolean,
  supabaseUrl: string,
  serviceKey: string
): Promise<void> {
  console.log(`[OrchestratorComplete] Marking orchestrator ${orchestratorTaskId} as Complete`);

  // Find earliest sub-task start time for billing
  let earliestStartTime: string | null = null;
  for (const segment of allSegments) {
    if (segment.generation_started_at) {
      if (!earliestStartTime || segment.generation_started_at < earliestStartTime) {
        earliestStartTime = segment.generation_started_at;
      }
    }
  }

  const updateData: Record<string, any> = {
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

  const { error: updateOrchError } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", orchestratorTaskId)
    .in("status", ["Queued", "In Progress"]);

  if (updateOrchError) {
    console.error(`[OrchestratorComplete] Failed to mark orchestrator ${orchestratorTaskId} as Complete:`, updateOrchError);
    return;
  }

  console.log(`[OrchestratorComplete] Successfully marked orchestrator ${orchestratorTaskId} as Complete`);

  await triggerCostCalculation(supabaseUrl, serviceKey, orchestratorTaskId, 'OrchestratorComplete');
}
