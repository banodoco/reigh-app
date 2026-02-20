import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

import { extractOrchestratorRef, buildSubTaskFilter, UUID_REGEX } from '../_shared/billing.ts';
import type { SystemLogger } from '../_shared/systemLogger.ts';
import type { TaskStatusRow, TaskStatus } from './types.ts';

export async function handleCascadingTaskFailure(
  supabaseAdmin: SupabaseClient,
  logger: SystemLogger,
  failedTaskId: string,
  failureStatus: Extract<TaskStatus, 'Failed' | 'Cancelled'>,
  failedTaskData: TaskStatusRow,
): Promise<void> {
  try {
    logger.info('Processing cascading failure', {
      task_id: failedTaskId,
      status: failureStatus,
    });

    let orchestratorTaskId: string | null = null;
    let isOrchestratorTask = false;

    if (failedTaskData.params) {
      const params = typeof failedTaskData.params === 'string'
        ? JSON.parse(failedTaskData.params)
        : failedTaskData.params;

      const rawRef = extractOrchestratorRef(params);
      orchestratorTaskId = rawRef && UUID_REGEX.test(rawRef) ? rawRef : null;

      if (!orchestratorTaskId && params && typeof params === 'object' && 'orchestrator_details' in params) {
        orchestratorTaskId = failedTaskId;
        isOrchestratorTask = true;
        logger.debug('Task is the orchestrator itself', { task_id: failedTaskId });
      }
    }

    if (!orchestratorTaskId) {
      logger.debug('No orchestrator reference found, skipping cascade', { task_id: failedTaskId });
      return;
    }

    logger.info('Found orchestrator task', {
      orchestrator_task_id: orchestratorTaskId,
      is_orchestrator_task: isOrchestratorTask,
    });

    const cascadePayload = {
      status: failureStatus,
      updated_at: new Date().toISOString(),
      error_message: `Cascaded ${failureStatus.toLowerCase()} from related task ${failedTaskId}`,
    };

    let cascadeResult;

    if (isOrchestratorTask) {
      cascadeResult = await supabaseAdmin
        .from('tasks')
        .update(cascadePayload)
        .or(buildSubTaskFilter(orchestratorTaskId))
        .neq('id', failedTaskId)
        .not('status', 'in', '("Complete","Failed","Cancelled")')
        .select('id');
    } else {
      cascadeResult = await supabaseAdmin
        .from('tasks')
        .update(cascadePayload)
        .or(`id.eq.${orchestratorTaskId},${buildSubTaskFilter(orchestratorTaskId)}`)
        .neq('id', failedTaskId)
        .not('status', 'in', '("Complete","Failed","Cancelled")')
        .select('id');
    }

    if (cascadeResult.error) {
      logger.error('Error cascading failure to related tasks', { error: cascadeResult.error.message });
      return;
    }

    const cascadedTaskIds = (cascadeResult.data || [])
      .map((task: { id: string }) => task.id)
      .filter(Boolean);

    if (cascadedTaskIds.length === 0) {
      logger.debug('No related tasks found for cascade (all already terminal or none exist)');
      return;
    }

    logger.info('Cascade complete', {
      task_id: failedTaskId,
      cascaded_count: cascadedTaskIds.length,
      cascaded_task_ids: cascadedTaskIds.map((id) => id.substring(0, 8)),
      status: failureStatus,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Unexpected error in cascade handler', { error: message });
  }
}
