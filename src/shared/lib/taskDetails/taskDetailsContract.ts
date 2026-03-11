import type { Task } from '@/types/tasks';

export type TaskDetailsStatus = 'ok' | 'missing' | 'error';

export interface TaskDetailsData {
  task: Task | null;
  isLoading: boolean;
  status: TaskDetailsStatus;
  error: Error | null;
  inputImages: string[];
  taskId: string | null;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onClose?: () => void;
}

interface BuildTaskDetailsDataInput {
  task?: Task | null;
  isLoading?: boolean;
  status?: TaskDetailsStatus;
  error?: Error | null;
  inputImages?: string[];
  taskId?: string | null;
  onApplySettingsFromTask?: TaskDetailsData['onApplySettingsFromTask'];
  onClose?: TaskDetailsData['onClose'];
}

export function resolveTaskDetailsStatus(
  task: Task | null,
  error: Error | null,
  explicitStatus?: TaskDetailsStatus,
): TaskDetailsStatus {
  if (explicitStatus) {
    return explicitStatus;
  }
  if (error) {
    return 'error';
  }
  if (task) {
    return 'ok';
  }
  return 'missing';
}

export function buildTaskDetailsData({
  task,
  isLoading = false,
  status,
  error,
  inputImages = [],
  taskId,
  onApplySettingsFromTask,
  onClose,
}: BuildTaskDetailsDataInput): TaskDetailsData {
  const resolvedTask = task ?? null;
  const resolvedError = error ?? null;

  return {
    task: resolvedTask,
    isLoading,
    status: resolveTaskDetailsStatus(resolvedTask, resolvedError, status),
    error: resolvedError,
    inputImages,
    taskId: taskId ?? resolvedTask?.id ?? null,
    onApplySettingsFromTask,
    onClose,
  };
}
