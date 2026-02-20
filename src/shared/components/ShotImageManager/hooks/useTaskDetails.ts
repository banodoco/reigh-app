import { useMemo } from 'react';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useTaskPrefetch';
import { useGetTask } from '@/shared/hooks/useTasks';
import { deriveInputImages } from '@/shared/utils/taskParamsUtils';
import { Task } from '@/types/tasks';
import type { TaskDetailsData as LightboxTaskDetailsData } from '@/shared/components/MediaLightbox/types';

interface UseTaskDetailsProps {
  generationId: string | null;
  /** Optional callback for applying task settings */
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  /** Optional callback when closing task details */
  onClose?: () => void;
}

interface UseTaskDetailsReturn {
  taskDetailsData: LightboxTaskDetailsData | null;
  /** The task mapping (generationId → taskId) */
  taskMapping: { taskId: string | null } | undefined;
  /** The raw task data */
  task: Task | undefined;
  /** Loading state for just the task data (not mapping) */
  isLoadingTask: boolean;
  /** Error from task fetch */
  taskError: Error | null;
}

/**
 * Hook to fetch and manage task details for a generation.
 * Combines two queries: generation→taskId mapping and taskId→task data.
 * Both queries use aggressive caching (staleTime: Infinity) for performance.
 */
export function useTaskDetails({
  generationId,
  onApplySettingsFromTask,
  onClose,
}: UseTaskDetailsProps): UseTaskDetailsReturn {
  // Fetch task mapping from unified cache (generation ID → task ID)
  const { data: taskMappingRaw, isLoading: isLoadingMapping } = useTaskFromUnifiedCache(generationId || '');
  const taskMapping = useMemo(
    () =>
      taskMappingRaw
        ? { taskId: typeof taskMappingRaw.taskId === 'string' ? taskMappingRaw.taskId : null }
        : undefined,
    [taskMappingRaw]
  );

  // Fetch actual task data (only runs when we have a taskId)
  const { data: task, isLoading: isLoadingTaskData, error: taskError } = useGetTask(
    taskMapping?.taskId ?? ''
  );

  // Combined loading state:
  // - If mapping is loading, we're loading
  // - If mapping returned null taskId, we know there's no task - not loading
  // - If mapping has a taskId and task data is loading, we're loading
  const hasNoTask = taskMapping !== undefined && taskMapping.taskId === null;
  const isLoading = hasNoTask ? false : (isLoadingMapping || isLoadingTaskData);

  // Derive input images from task params using shared utility
  const inputImages = useMemo(() => {
    if (!task?.params) return [];
    let params: Record<string, unknown>;
    try {
      params = typeof task.params === 'string' ? JSON.parse(task.params) : task.params;
    } catch {
      return [];
    }
    return deriveInputImages(params);
  }, [task]);

  // Return null taskDetailsData if no generation ID (lightbox closed)
  if (!generationId) {
    return {
      taskDetailsData: null,
      taskMapping: undefined,
      task: undefined,
      isLoadingTask: false,
      taskError: null,
    };
  }

  return {
    taskDetailsData: {
      task: task ?? null,
      isLoading,
      error: taskError,
      inputImages,
      taskId: taskMapping?.taskId || null,
      onApplySettingsFromTask,
      onClose,
    },
    taskMapping,
    task,
    isLoadingTask: isLoadingTaskData,
    taskError,
  };
}
