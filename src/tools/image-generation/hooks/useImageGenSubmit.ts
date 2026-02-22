import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/sonner';
import { createBatchImageGenerationTasks, BatchImageGenerationTaskParams } from '@/shared/lib/tasks/imageGeneration';
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { queryKeys } from '@/shared/lib/queryKeys';
import { handleError } from '@/shared/lib/errorHandling/handleError';

interface UseImageGenSubmitParams {
  projectId: string | null;
  effectiveProjectId: string | null;
}

export function useImageGenSubmit({
  projectId,
  effectiveProjectId,
}: UseImageGenSubmitParams) {
  const queryClient = useQueryClient();
  const { getApiKey } = useApiKeys();
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();

  const handleNewGenerate = useCallback(async (taskParams: BatchImageGenerationTaskParams): Promise<string[]> => {
    if (!projectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return [];
    }

    const incomingTaskId = addIncomingTask({
      taskType: 'image_generation',
      label: taskParams.prompts?.[0]?.fullPrompt?.substring(0, 50) || 'Generating images...',
    });
    let createdTaskIds: string[] = [];
    try {
      const createdTasks = await createBatchImageGenerationTasks(taskParams);
      createdTaskIds = createdTasks.map((t) => t.task_id);

      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(effectiveProjectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.paginatedAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.statusCountsAll });

      return createdTaskIds;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[handleNewGenerate] FAILED:', error);
      }
      handleError(error, { context: 'ImageGenerationToolPage.handleNewGenerate', toastTitle: error instanceof Error ? error.message : 'Failed to create tasks.' });
      return [];
    } finally {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      removeIncomingTask(incomingTaskId);
    }
  }, [projectId, effectiveProjectId, queryClient, addIncomingTask, removeIncomingTask]);

  const openaiApiKey = getApiKey('openai_api_key');

  return {
    handleNewGenerate,
    openaiApiKey,
  };
}
