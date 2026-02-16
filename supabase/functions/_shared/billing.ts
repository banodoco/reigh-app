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
  if (!params || typeof params !== 'object') return null;

  return (
    params.orchestrator_task_id_ref ||
    params.orchestrator_details?.orchestrator_task_id ||
    params.originalParams?.orchestrator_details?.orchestrator_task_id ||
    params.orchestrator_task_id ||
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
    `params->>orchestrator_task_id_ref.eq.${orchestratorTaskId}`,
    `params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`,
    `params->originalParams->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`,
    `params->>orchestrator_task_id.eq.${orchestratorTaskId}`,
  ].join(',');
}

// ===== Cost calculation trigger =====

/**
 * Trigger the calculate-task-cost edge function for a given task.
 *
 * This is a fire-and-forget HTTP call (errors are logged, not thrown).
 *
 * @param supabaseUrl - The Supabase project URL
 * @param serviceKey  - The service role key for authentication
 * @param taskId      - The task ID to calculate cost for
 * @param logTag      - Optional log tag prefix (default: 'CostCalc')
 */
export async function triggerCostCalculation(
  supabaseUrl: string,
  serviceKey: string,
  taskId: string,
  logTag: string = 'CostCalc'
): Promise<void> {
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
      const costData = await costResp.json();
      if (costData.skipped) {
        // Intentionally no-op: caller may skip billing for non-billable tasks.
      } else if (typeof costData.cost === 'number') {
        // Intentionally no-op: successful billing response.
      }
    } else {
      const errTxt = await costResp.text();
      console.error(`[${logTag}] Cost calculation failed: ${errTxt}`);
    }
  } catch (costErr) {
    console.error(`[${logTag}] Error triggering cost calculation:`, costErr);
  }
}
