/**
 * Billing utilities for complete_task
 *
 * Re-exports shared billing logic and adds complete_task-specific helpers.
 */

import {
  getSubTaskOrchestratorId,
  triggerCostCalculation,
} from '../_shared/billing.ts';

// Re-export triggerCostCalculation so existing imports from orchestrator.ts continue to work
export { triggerCostCalculation };

/**
 * Trigger cost calculation for a task, but skip if it's a sub-task
 * (Sub-tasks have their costs rolled up into the orchestrator)
 *
 * @param supabase - Supabase client for fetching task params
 * @param supabaseUrl - The Supabase project URL
 * @param serviceKey - The service role key for authentication
 * @param taskId - The task ID to calculate cost for
 */
export async function triggerCostCalculationIfNotSubTask(
  supabase: unknown,
  supabaseUrl: string,
  serviceKey: string,
  taskId: string
): Promise<void> {
  try {
    const { data: taskForCostCheck } = await supabase
      .from("tasks")
      .select("params")
      .eq("id", taskId)
      .single();

    const subTaskOrchestratorRef = getSubTaskOrchestratorId(taskForCostCheck?.params, taskId);
    if (subTaskOrchestratorRef) {
      return;
    }

    await triggerCostCalculation(supabaseUrl, serviceKey, taskId, 'COMPLETE-TASK');
  } catch (costErr) {
    console.error("[COMPLETE-TASK] Error triggering cost calculation:", costErr);
  }
}
