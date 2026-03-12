import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { createBatchImageGenerationTasks, BatchImageGenerationTaskParams } from '@/shared/lib/tasks/families/imageGeneration';
import { useApiKeys } from '@/features/settings/hooks/useApiKeys';
import { queryKeys } from '@/shared/lib/queryKeys';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface UseImageGenSubmitParams {
  projectId: string | null;
  effectiveProjectId: string | null;
}

/**
 * Low-level hook for creating image generation tasks.
 *
 * NOTE: This hook does NOT manage incoming task placeholders. The caller
 * (useFormSubmission → useSubmitHandler → runIncomingTask) already wraps
 * the call in a placeholder lifecycle. Adding a second placeholder here
 * would cause double-counting in the TasksPane.
 */
export function useImageGenSubmit({
  projectId,
  effectiveProjectId,
}: UseImageGenSubmitParams) {
  const queryClient = useQueryClient();
  const { getApiKey } = useApiKeys();

  const handleNewGenerate = useCallback(async (taskParams: BatchImageGenerationTaskParams): Promise<string[]> => {
    if (!projectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return [];
    }

    try {
      const createdTasks = await createBatchImageGenerationTasks(taskParams);
      const createdTaskIds = createdTasks.map((t) => t.task_id);

      // Refresh the gallery/media view. Task pane invalidation is handled by the
      // caller's runIncomingTask placeholder (awaited refetch + placeholder cleanup).
      // Doing fire-and-forget task invalidation here would race with the placeholder
      // and cause cancelled tasks to flash briefly in the UI.
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(effectiveProjectId) });

      return createdTaskIds;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[handleNewGenerate] FAILED:', error);
      }
      normalizeAndPresentError(error, { context: 'ImageGenerationToolPage.handleNewGenerate', toastTitle: error instanceof Error ? error.message : 'Failed to create tasks.' });
      return [];
    }
  }, [projectId, effectiveProjectId, queryClient]);

  const openaiApiKey = getApiKey('openai_api_key');

  return {
    handleNewGenerate,
    openaiApiKey,
  };
}
