/**
 * Billing utilities for complete_task
 *
 * Re-exports shared billing logic and adds complete_task-specific helpers.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import {
  getSubTaskOrchestratorId,
  type CostCalculationTriggerResult,
  triggerCostCalculation,
} from '../_shared/billing.ts';
import { operationFailure, operationSuccess } from '../_shared/edgeOperation.ts';

// Re-export triggerCostCalculation so existing imports from orchestrator.ts continue to work
export { triggerCostCalculation };
export type { CostCalculationTriggerResult };

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
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  taskId: string
): Promise<CostCalculationTriggerResult> {
  try {
    const { data: taskForCostCheck } = await supabase
      .from("tasks")
      .select("params")
      .eq("id", taskId)
      .single();

    const subTaskOrchestratorRef = getSubTaskOrchestratorId(taskForCostCheck?.params, taskId);
    if (subTaskOrchestratorRef) {
      return operationSuccess(
        {
          status: null,
          skipped: true,
        },
        { policy: 'best_effort' },
      );
    }

    return await triggerCostCalculation({
      supabaseUrl,
      serviceKey,
      taskId,
      logTag: 'COMPLETE-TASK',
    });
  } catch (costErr) {
    return operationFailure(costErr, {
      policy: 'degrade',
      errorCode: 'cost_calculation_precheck_error',
      message: costErr instanceof Error ? costErr.message : String(costErr),
      recoverable: true,
      cause: costErr,
    });
  }
}
