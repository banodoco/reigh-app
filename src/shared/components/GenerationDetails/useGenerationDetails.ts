import { useMemo } from 'react';
import { useGetTask } from '@/shared/hooks/useTasks';
import { deriveInputImages } from '@/shared/utils/taskParamsUtils';
import { Task } from '@/types/tasks';

interface UseGenerationDetailsOptions {
  taskId?: string;
  task?: Task;
  inputImages?: string[];
}

interface UseGenerationDetailsResult {
  task: Task | undefined;
  inputImages: string[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Hook for fetching and preparing task data for GenerationDetails
 *
 * Handles:
 * - Fetching task data by ID if provided
 * - Using directly provided task if available
 * - Deriving input images from task params
 */
export function useGenerationDetails({
  taskId,
  task: taskProp,
  inputImages: inputImagesProp,
}: UseGenerationDetailsOptions): UseGenerationDetailsResult {
  // Fetch task data if taskId is provided and no task prop
  const { data: fetchedTask, isLoading, isError } = useGetTask(taskId || '');

  // Use provided task or fetched task
  const task = taskProp || fetchedTask;

  // Derive input images from task if not explicitly provided
  const inputImages = useMemo(() => {
    if (inputImagesProp && inputImagesProp.length > 0) {
      return inputImagesProp;
    }
    if (!task?.params) return [];
    // Parse params if needed
    let params: Record<string, unknown>;
    try {
      params = typeof task.params === 'string' ? JSON.parse(task.params) : task.params;
    } catch {
      return [];
    }
    return deriveInputImages(params);
  }, [inputImagesProp, task]);

  return {
    task,
    inputImages,
    isLoading: taskId ? isLoading && !taskProp : false,
    isError: taskId ? isError && !taskProp : false,
  };
}
