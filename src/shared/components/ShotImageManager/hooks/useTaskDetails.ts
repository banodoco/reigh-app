import type { Task } from '@/types/tasks';
import type { TaskDetailsData as LightboxTaskDetailsData } from '@/shared/components/MediaLightbox/types';
import { useGenerationTaskDetails } from '@/shared/components/TaskDetails/hooks/useGenerationTaskDetails';

interface UseTaskDetailsProps {
  generationId: string | null;
  projectId?: string | null;
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
  projectId,
  onApplySettingsFromTask,
  onClose,
}: UseTaskDetailsProps): UseTaskDetailsReturn {
  const result = useGenerationTaskDetails({
    generationId,
    projectId,
    onApplySettingsFromTask,
    onClose,
  });

  return {
    taskDetailsData: result.taskDetailsData,
    taskMapping: result.taskMapping,
    task: result.task,
    isLoadingTask: result.isLoadingTask,
    taskError: result.taskError,
  };
}
