import { useEffect, useMemo, useState } from "react";
import { useTaskFromUnifiedCache } from "@/shared/hooks/tasks/useTaskPrefetch";
import { useGetTask } from "@/shared/hooks/tasks/useTasks";
import { deriveInputImages, parseTaskParams } from "@/shared/lib/taskParamsUtils";
import { useGetPrimaryTaskIdForGeneration } from "@/shared/hooks/tasks/usePrimaryTaskMapping";
import { normalizeAndPresentError } from "@/shared/lib/errorHandling/runtimeError";
import type { Task } from "@/types/tasks";
import type { TaskDetailsData as LightboxTaskDetailsData } from "@/shared/components/MediaLightbox/types";
import type { TaskDetailsStatus } from "@/shared/components/MediaLightbox/types";
import type { GenerationTaskMappingStatus } from "@/shared/lib/generationTaskRepository";

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
  status: GenerationTaskMappingStatus;
  queryError?: string;
}

interface UseGenerationTaskDetailsResult {
  taskDetailsData: LightboxTaskDetailsData | null;
  taskDetailsStatus: TaskDetailsStatus;
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
  const [mappingResolutionError, setMappingResolutionError] = useState<Error | null>(null);

  useEffect(() => {
    setFallbackTaskId(null);
    setMappingResolutionAttempted(false);
    setMappingResolutionError(null);
  }, [activeGenerationId]);

  const { data: taskMappingRaw, isLoading: isLoadingMapping } = useTaskFromUnifiedCache(activeGenerationId || "");
  const taskMapping = useMemo<GenerationTaskMapping | undefined>(() => {
    if (!taskMappingRaw) return undefined;
    return {
      taskId: typeof taskMappingRaw.taskId === "string" ? taskMappingRaw.taskId : null,
      status: taskMappingRaw.status,
      queryError: taskMappingRaw.queryError,
    };
  }, [taskMappingRaw]);

  const primaryTaskLookup = useGetPrimaryTaskIdForGeneration();
  const shouldResolveOnDemand = (
    Boolean(activeGenerationId)
    && resolveMappingOnDemand
    && taskMapping?.taskId === null
    && taskMapping.status !== "query_failed"
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
          setMappingResolutionError(null);
          setFallbackTaskId(result.taskId ?? null);
          return;
        }
        if (result.status === "query_failed") {
          const resolutionError = new Error(
            result.queryError ?? "Failed to resolve generation-task mapping",
          );
          setMappingResolutionError(resolutionError);
          normalizeAndPresentError(
            resolutionError,
            {
              context: "useGenerationTaskDetails.resolveMappingOnDemand",
              showToast: false,
              logData: { generationId: activeGenerationId },
            },
          );
        }
      } catch (error) {
        if (cancelled) return;
        const resolutionError = error instanceof Error
          ? error
          : new Error("Failed to resolve generation-task mapping");
        setMappingResolutionError(resolutionError);
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
  const mappingQueryError = useMemo(() => {
    if (taskMapping?.status !== "query_failed") {
      return null;
    }
    return new Error(taskMapping.queryError ?? "Failed to resolve generation-task mapping");
  }, [taskMapping?.queryError, taskMapping?.status]);
  const combinedTaskError = taskError ?? mappingQueryError ?? mappingResolutionError;

  const inputImages = useMemo(() => {
    if (!task?.params) return [];
    return deriveInputImages(parseTaskParams(task.params));
  }, [task]);

  const hasNoTask = taskMapping !== undefined && taskMapping.taskId === null && fallbackTaskId === null;
  const isLoading = hasNoTask
    ? primaryTaskLookup.isPending
    : (isLoadingMapping || isLoadingTaskData || primaryTaskLookup.isPending);
  const taskDetailsStatus: TaskDetailsStatus = useMemo(() => {
    if (!activeGenerationId) {
      return "missing";
    }
    if (combinedTaskError) {
      return "error";
    }
    if (task) {
      return "ok";
    }
    return "missing";
  }, [activeGenerationId, combinedTaskError, task]);

  if (!activeGenerationId) {
    return {
      taskDetailsData: null,
      taskDetailsStatus: "missing",
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
      status: taskDetailsStatus,
      error: combinedTaskError,
      inputImages,
      taskId,
      onApplySettingsFromTask,
      onClose,
    },
    taskDetailsStatus,
    taskMapping,
    taskId,
    task,
    inputImages,
    isLoadingTask: isLoadingTaskData,
    taskError: combinedTaskError,
  };
}
