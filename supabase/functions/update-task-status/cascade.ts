import { toErrorMessage } from "../_shared/errorMessage.ts";
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { extractOrchestratorRef, UUID_REGEX } from '../_shared/billing.ts';
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

    const { data: cascadedIds, error: cascadeError } = await supabaseAdmin
      .rpc('cascade_task_failure', {
        p_orchestrator_task_id: orchestratorTaskId,
        p_failed_task_id: failedTaskId,
        p_failure_status: failureStatus,
        p_is_orchestrator_task: isOrchestratorTask,
      });

    if (cascadeError) {
      logger.error('Error cascading failure to related tasks', { error: cascadeError.message });
      return;
    }

    const cascadedTaskIds = (cascadedIds as string[] || []).filter(Boolean);

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
    const message = toErrorMessage(error);
    logger.error('Unexpected error in cascade handler', { error: message });
  }
}
