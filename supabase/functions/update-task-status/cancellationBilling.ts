import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

import { buildSubTaskFilter, getSubTaskOrchestratorId, triggerCostCalculation } from '../_shared/billing.ts';
import type { SystemLogger } from '../_shared/systemLogger.ts';
import type { TaskStatusRow } from './types.ts';

interface CompletedSegmentRow {
  id: string;
  generation_started_at: string | null;
  generation_processed_at: string | null;
}

export async function handleOrchestratorCancellationBilling(
  supabaseAdmin: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  logger: SystemLogger,
  cancelledTaskId: string,
  cancelledTaskData: TaskStatusRow,
): Promise<void> {
  try {
    if (!cancelledTaskData.params) {
      return;
    }

    const params = typeof cancelledTaskData.params === 'string'
      ? JSON.parse(cancelledTaskData.params)
      : cancelledTaskData.params;

    const isChildTask = getSubTaskOrchestratorId(params, cancelledTaskId) !== null;
    if (isChildTask) {
      logger.debug('Cancelled task is a child, skipping billing', {
        task_id: cancelledTaskId,
      });
      return;
    }

    if (!params || typeof params !== 'object' || !('orchestrator_details' in params)) {
      logger.debug('Cancelled task is not an orchestrator, skipping billing', {
        task_id: cancelledTaskId,
      });
      return;
    }

    logger.info('Cancelled task is an orchestrator, checking for completed work', {
      task_id: cancelledTaskId,
    });

    const { data: completedSegments, error: segmentsError } = await supabaseAdmin
      .from('tasks')
      .select('id, generation_started_at, generation_processed_at')
      .or(buildSubTaskFilter(cancelledTaskId))
      .eq('status', 'Complete');

    if (segmentsError) {
      logger.error('Error checking for completed segments', { error: segmentsError.message });
      return;
    }

    const completed = (completedSegments || []) as CompletedSegmentRow[];
    if (completed.length === 0) {
      logger.info('No completed segments found, no billing needed', {
        task_id: cancelledTaskId,
      });
      return;
    }

    logger.info('Found completed segments for cancelled orchestrator', {
      task_id: cancelledTaskId,
      completed_segment_count: completed.length,
    });

    let earliestStartTime: string | null = null;
    for (const segment of completed) {
      if (segment.generation_started_at) {
        if (!earliestStartTime || segment.generation_started_at < earliestStartTime) {
          earliestStartTime = segment.generation_started_at;
        }
      }
    }

    if (earliestStartTime) {
      await supabaseAdmin
        .from('tasks')
        .update({
          generation_started_at: earliestStartTime,
          generation_processed_at: new Date().toISOString(),
        })
        .eq('id', cancelledTaskId);
    }

    logger.info('Triggering billing for cancelled orchestrator', { orchestrator_task_id: cancelledTaskId });
    const billingResult = await triggerCostCalculation({
      supabaseUrl,
      serviceKey,
      taskId: cancelledTaskId,
      logTag: 'CancelledOrchBilling',
    });
    if (!billingResult.ok) {
      logger.warn('Cancelled orchestrator billing trigger failed', {
        orchestrator_task_id: cancelledTaskId,
        error_code: billingResult.errorCode,
        message: billingResult.message,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Error in orchestrator cancellation billing', { error: message });
  }
}
