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

function isTaskCreatedVariant(
  activeVariant: ResolveAdjustedTaskDetailsInput['activeVariant'],
  variantParams: Record<string, unknown> | undefined,
): activeVariant is NonNullable<ResolveAdjustedTaskDetailsInput['activeVariant']> {
  return Boolean(
    activeVariant
    && variantParams
    && (
      variantParams.source_task_id
      || variantParams.created_from
      || (activeVariant.variant_type && activeVariant.variant_type !== VARIANT_TYPE.ORIGINAL)
    ),
  );
}

function resolveEffectiveVariantParams(
  variantParams: Record<string, unknown>,
  taskDetailsData: TaskDetailsData | undefined,
  variantSourceTask: { params?: unknown } | null,
): Record<string, unknown> {
  const sourceTaskId = typeof variantParams.source_task_id === 'string' ? variantParams.source_task_id : undefined;
  const hasMatchingTaskData = taskDetailsData?.taskId === sourceTaskId && taskDetailsData?.task?.params;

  if (hasMatchingTaskData) {
    return (taskDetailsData.task?.params ?? variantParams) as Record<string, unknown>;
  }

  if (!variantParams.orchestrator_details && variantSourceTask?.params) {
    try {
      return typeof variantSourceTask.params === 'string'
        ? JSON.parse(variantSourceTask.params)
        : (variantSourceTask.params as Record<string, unknown>);
    } catch {
      return variantParams;
    }
  }

  return variantParams;
}

function buildAdjustedVariantTaskDetails(
  activeVariant: NonNullable<ResolveAdjustedTaskDetailsInput['activeVariant']>,
  variantParams: Record<string, unknown>,
  taskDetailsData: TaskDetailsData | undefined,
  variantSourceTask: { params?: unknown } | null,
  variantSourceTaskError: Error | null,
  isLoadingVariantTask: boolean,
): TaskDetailsData {
  const sourceTaskId = typeof variantParams.source_task_id === 'string' ? variantParams.source_task_id : undefined;
  const hasMatchingTaskData = taskDetailsData?.taskId === sourceTaskId && taskDetailsData?.task?.params;
  const shouldSurfaceVariantSourceTaskError = !hasMatchingTaskData && !!variantSourceTaskError;
  const effectiveParams = resolveEffectiveVariantParams(variantParams, taskDetailsData, variantSourceTask);

  return buildTaskDetailsData({
    task: {
      id: activeVariant.id,
      taskType: activeVariant.variant_type || 'variant',
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
  if (isTaskCreatedVariant(activeVariant, variantParams) && variantParams) {
    return buildAdjustedVariantTaskDetails(
      activeVariant,
      variantParams,
      taskDetailsData,
      variantSourceTask,
      variantSourceTaskError,
      isLoadingVariantTask,
    );
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
