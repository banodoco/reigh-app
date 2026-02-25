import { useEffect, useMemo, useState } from "react";
import { useTaskFromUnifiedCache } from "@/shared/hooks/useTaskPrefetch";
import { useGetTask } from "@/shared/hooks/useTasks";
import { deriveInputImages } from "@/shared/lib/taskParamsUtils";
import { useGetPrimaryTaskIdForGeneration } from "@/shared/lib/generationTaskBridge";
import { normalizeAndPresentError } from "@/shared/lib/errorHandling/runtimeError";
import type { Task } from "@/types/tasks";
import type { TaskDetailsData as LightboxTaskDetailsData } from "@/shared/components/MediaLightbox/types";

interface UseGenerationTaskDetailsOptions {
  generationId: string | null;
  projectId?: string | null;
  enabled?: boolean;
  resolveMappingOnDemand?: boolean;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onClose?: () => void;
}

interface GenerationTaskMapping {
  taskId: string | null;
}

interface UseGenerationTaskDetailsResult {
  taskDetailsData: LightboxTaskDetailsData | null;
  taskMapping: GenerationTaskMapping | undefined;
  taskId: string | null;
  task: Task | undefined;
  inputImages: string[];
  isLoadingTask: boolean;
  taskError: Error | null;
}

export function useGenerationTaskDetails({
  generationId,
  projectId,
  enabled = true,
  resolveMappingOnDemand = false,
  onApplySettingsFromTask,
  onClose,
}: UseGenerationTaskDetailsOptions): UseGenerationTaskDetailsResult {
  const activeGenerationId = enabled ? generationId : null;
  const [fallbackTaskId, setFallbackTaskId] = useState<string | null>(null);
  const [mappingResolutionAttempted, setMappingResolutionAttempted] = useState(false);

  useEffect(() => {
    setFallbackTaskId(null);
    setMappingResolutionAttempted(false);
  }, [activeGenerationId]);

  const { data: taskMappingRaw, isLoading: isLoadingMapping } = useTaskFromUnifiedCache(activeGenerationId || "");
  const taskMapping = useMemo<GenerationTaskMapping | undefined>(() => {
    if (!taskMappingRaw) return undefined;
    return {
      taskId: typeof taskMappingRaw.taskId === "string" ? taskMappingRaw.taskId : null,
    };
  }, [taskMappingRaw]);

  const primaryTaskLookup = useGetPrimaryTaskIdForGeneration();
  const shouldResolveOnDemand = (
    Boolean(activeGenerationId)
    && resolveMappingOnDemand
    && taskMapping?.taskId === null
    && fallbackTaskId === null
    && !mappingResolutionAttempted
  );

  useEffect(() => {
    if (!shouldResolveOnDemand || !activeGenerationId) {
      return;
    }
    let cancelled = false;
    setMappingResolutionAttempted(true);

    (async () => {
      try {
        const result = await primaryTaskLookup.mutateAsync(activeGenerationId);
        if (cancelled) return;
        if (result.status === "ok") {
          setFallbackTaskId(result.taskId ?? null);
          return;
        }
        if (result.status === "query_failed") {
          normalizeAndPresentError(
            new Error(result.queryError ?? "Failed to resolve generation-task mapping"),
            {
              context: "useGenerationTaskDetails.resolveMappingOnDemand",
              showToast: false,
              logData: { generationId: activeGenerationId },
            },
          );
        }
      } catch (error) {
        if (cancelled) return;
        normalizeAndPresentError(error, {
          context: "useGenerationTaskDetails.resolveMappingOnDemand",
          showToast: false,
          logData: { generationId: activeGenerationId },
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeGenerationId, primaryTaskLookup, shouldResolveOnDemand]);

  const taskId = taskMapping?.taskId ?? fallbackTaskId ?? null;
  const { data: task, isLoading: isLoadingTaskData, error: taskError } = useGetTask(
    taskId || "",
    projectId,
  );

  const inputImages = useMemo(() => {
    if (!task?.params) return [];
    let params: Record<string, unknown>;
    try {
      params = typeof task.params === "string"
        ? JSON.parse(task.params)
        : task.params;
    } catch {
      return [];
    }
    return deriveInputImages(params);
  }, [task]);

  const hasNoTask = taskMapping !== undefined && taskMapping.taskId === null && fallbackTaskId === null;
  const isLoading = hasNoTask
    ? primaryTaskLookup.isPending
    : (isLoadingMapping || isLoadingTaskData || primaryTaskLookup.isPending);

  if (!activeGenerationId) {
    return {
      taskDetailsData: null,
      taskMapping: undefined,
      taskId: null,
      task: undefined,
      inputImages: [],
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
      taskId,
      onApplySettingsFromTask,
      onClose,
    },
    taskMapping,
    taskId,
    task,
    inputImages,
    isLoadingTask: isLoadingTaskData,
    taskError,
  };
}

