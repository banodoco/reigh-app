import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import { buildTaskDetailsData } from '@/shared/lib/taskDetails/taskDetailsContract';
import { deriveInputImages } from '@/shared/lib/taskParamsUtils';
import type { TaskDetailsData } from '../../types';
import type { Task } from '@/types/tasks';

interface ResolveAdjustedTaskDetailsInput {
  activeVariant: {
    id: string;
    params?: Record<string, unknown> | null;
    variant_type?: string | null;
    created_at?: string;
  } | null;
  taskDetailsData: TaskDetailsData | undefined;
  variantSourceTask: { params?: unknown } | null;
  variantSourceTaskError: Error | null;
  isLoadingVariantTask: boolean;
  isLoadingVariants: boolean;
  initialVariantId: string | undefined;
}

export function resolveAdjustedTaskDetails(
  input: ResolveAdjustedTaskDetailsInput,
): TaskDetailsData | undefined {
  const {
    activeVariant,
    taskDetailsData,
    variantSourceTask,
    variantSourceTaskError,
    isLoadingVariantTask,
    isLoadingVariants,
    initialVariantId,
  } = input;

  const variantParams = activeVariant?.params as Record<string, unknown> | undefined;
  const isTaskCreatedVariant = activeVariant && variantParams && (
    variantParams.source_task_id ||
    variantParams.created_from ||
    (activeVariant.variant_type && activeVariant.variant_type !== VARIANT_TYPE.ORIGINAL)
  );

  if (isTaskCreatedVariant && variantParams) {
    const sourceTaskId = typeof variantParams.source_task_id === 'string' ? variantParams.source_task_id : undefined;
    const hasMatchingTaskData = taskDetailsData?.taskId === sourceTaskId && taskDetailsData?.task?.params;
    const shouldSurfaceVariantSourceTaskError = !hasMatchingTaskData && !!variantSourceTaskError;

    let effectiveParams = variantParams;
    const effectiveTaskType = activeVariant.variant_type || 'variant';

    if (hasMatchingTaskData) {
      effectiveParams = (taskDetailsData.task?.params ?? variantParams) as Record<string, unknown>;
    } else if (!variantParams.orchestrator_details && variantSourceTask?.params) {
      try {
        effectiveParams = typeof variantSourceTask.params === 'string'
          ? JSON.parse(variantSourceTask.params)
          : (variantSourceTask.params as Record<string, unknown>);
      } catch {
        // Keep variant params as the fallback on parse failure.
      }
    }

    return buildTaskDetailsData({
      task: {
        id: activeVariant.id,
        taskType: effectiveTaskType,
        params: effectiveParams,
        status: 'Complete' as Task['status'],
        createdAt: activeVariant.created_at || new Date().toISOString(),
        projectId: '',
      } as Task,
      isLoading: isLoadingVariantTask,
      error: shouldSurfaceVariantSourceTaskError ? variantSourceTaskError : null,
      inputImages: deriveInputImages(effectiveParams),
      taskId: sourceTaskId ?? activeVariant.id,
      onApplySettingsFromTask: taskDetailsData?.onApplySettingsFromTask,
      onClose: taskDetailsData?.onClose,
      status: shouldSurfaceVariantSourceTaskError ? 'error' : undefined,
    });
  }

  const waitingForInitialVariant = initialVariantId &&
    (!activeVariant || activeVariant.id !== initialVariantId);
  const shouldShowLoading = waitingForInitialVariant ||
    (isLoadingVariants && !activeVariant && taskDetailsData?.isLoading);

  if (shouldShowLoading) {
    return taskDetailsData ? { ...taskDetailsData, isLoading: true } : taskDetailsData;
  }

  return taskDetailsData;
}
