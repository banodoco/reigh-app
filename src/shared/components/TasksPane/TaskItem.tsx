import React, { useState, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Task } from '@/types/tasks';
import { getTaskDisplayName, taskSupportsProgress } from '@/shared/lib/taskConfig';
import { useCancelTask } from '@/shared/hooks/useTaskCancellation';
import { useProject } from '@/shared/contexts/ProjectContext';
import { toast } from '@/shared/components/ui/toast';
import { cn } from '@/shared/components/ui/contracts/cn';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { useNavigate } from 'react-router-dom';
import { useRelativeTimestamp, useTaskTimestamp } from '@/shared/hooks/useUpdatingTimestamp';
import { GenerationRow } from '@/domains/generation/types';
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useTaskType } from '@/shared/hooks/useTaskType';
import { usePublicLoras } from '@/shared/hooks/useResources';

// Import from modules
import { parseTaskParamsForDisplay, getAbbreviatedTaskName, extractShotId } from './utils/task-utils';
import { getTaskVariantId } from './utils/getTaskVariantId';
import { useTaskContentType } from './hooks/useTaskContentType';
import { useVideoGenerations } from './hooks/useVideoGenerations';
import { useImageGeneration } from './hooks/useImageGeneration';
import { useTaskNavigation } from './hooks/useTaskNavigation';
import { useTaskErrorDisplay } from './hooks/useTaskErrorDisplay';
import { TaskItemActions } from './components/TaskItemActions';
import { TaskItemTooltip } from './components/TaskItemTooltip';
import { IMAGE_EDIT_TASK_TYPES } from './constants';

/** Extended Task fields that may be present from raw DB responses (snake_case aliases) */
interface TaskWithDbFields extends Task {
  created_at?: string;
  generation_started_at?: string;
  generation_processed_at?: string;
}

interface TaskItemProps {
  task: Task;
  isNew?: boolean;
  isActive?: boolean;
  onOpenImageLightbox?: (task: Task, media: GenerationRow, initialVariantId?: string) => void;
  onOpenVideoLightbox?: (task: Task, media: GenerationRow[], videoIndex: number, initialVariantId?: string) => void;
  /** Close the TasksPane's lightbox (called before navigating to shot context) */
  onCloseLightbox?: () => void;
  isMobileActive?: boolean;
  onMobileActiveChange?: (taskId: string | null) => void;
  showProjectIndicator?: boolean;
  projectName?: string;
}

const TaskItemComponent: React.FC<TaskItemProps> = ({
  task,
  isNew = false,
  isActive = false,
  onOpenImageLightbox,
  onOpenVideoLightbox,
  onCloseLightbox,
  isMobileActive = false,
  onMobileActiveChange,
  showProjectIndicator = false,
  projectName
}) => {
  const isMobile = useIsMobile();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Timestamps - task may have snake_case aliases from raw DB responses
  const taskWithDbFields = task as TaskWithDbFields;
  const createdTimeAgo = useTaskTimestamp(task.createdAt || taskWithDbFields.created_at);
  const processingTime = useRelativeTimestamp({
    date: task.generationStartedAt || taskWithDbFields.generation_started_at,
    preset: 'processing',
  });
  const completedTime = useRelativeTimestamp({
    date: task.generationProcessedAt || taskWithDbFields.generation_processed_at,
    preset: 'completed',
  });

  // Mutations
  const cancelTaskMutation = useCancelTask(selectedProjectId);

  // Task type info from database
  const { data: taskTypeInfo } = useTaskType(task.taskType);
  const displayTaskType = taskTypeInfo?.display_name || getTaskDisplayName(task.taskType);
  const abbreviatedTaskType = getAbbreviatedTaskName(displayTaskType);

  // Available LoRAs for tooltip display (shared cache across all TaskItems)
  const { data: availableLoras = [] } = usePublicLoras();

  // Parse task params
  const taskParams = useMemo(() => parseTaskParamsForDisplay(task.params), [task.params]);
  const parsedTaskParams = taskParams.parsed as Record<string, unknown>;

  // Task content type detection - pass taskTypeInfo to avoid duplicate query
  const taskInfo = useTaskContentType({ task, taskParams, taskTypeInfo });

  // Hover state - component-level so both useVideoGenerations and useTaskNavigation can use it
  const [isHoveringTaskItem, setIsHoveringTaskItem] = useState(false);

  // Video generations hook
  const {
    videoOutputs,
    isLoadingVideoGen,
    waitingForVideoToOpen,
    ensureFetch: ensureVideoFetch,
    triggerOpen: triggerVideoOpen,
    clearWaiting: clearVideoWaiting,
  } = useVideoGenerations({
    task,
    taskParams,
    isVideoTask: taskInfo.isVideoTask,
    isCompletedVideoTask: taskInfo.isCompletedVideoTask,
    isHovering: isHoveringTaskItem,
  });

  // Image generation hook
  const { generationData, variantId: imageVariantId } = useImageGeneration({
    task,
    taskParams,
    isImageTask: taskInfo.isImageTask,
  });

  // Extract travel-specific data
  const travelImageUrls = useMemo(() => {
    if (!taskInfo.isVideoTask) return [];
    const isIndividualSegment = task.taskType === 'individual_travel_segment';
    const orchestratorDetails = parsedTaskParams.orchestrator_details as Record<string, unknown> | undefined;
    const segmentImages = parsedTaskParams.input_image_paths_resolved;
    const timelineImages = orchestratorDetails?.input_image_paths_resolved || parsedTaskParams.input_image_paths_resolved;
    const selected = isIndividualSegment ? segmentImages : timelineImages;
    return Array.isArray(selected)
      ? selected.filter((url): url is string => typeof url === 'string')
      : [];
  }, [taskInfo.isVideoTask, parsedTaskParams, task.taskType]);

  const imagesToShow = travelImageUrls.slice(0, 4);
  const extraImageCount = Math.max(0, travelImageUrls.length - imagesToShow.length);

  // Extract shot_id from task params
  const shotId = useMemo(() => extractShotId(task), [task]);

  // Cascaded error handling
  const { cascadedTaskId, cascadedTask, isCascadedTaskLoading } = useTaskErrorDisplay(task);

  // Navigation and action handlers
  const {
    handleCheckProgress,
    handleViewVideo,
    handleViewImage,
    handleVisitShot,
    handleMobileTap,
    progressPercent,
  } = useTaskNavigation({
    task,
    shotId,
    isMobile,
    setIsHoveringTaskItem,
    videoOutputs,
    isLoadingVideoGen,
    waitingForVideoToOpen,
    ensureVideoFetch,
    triggerVideoOpen,
    clearVideoWaiting,
    generationData,
    imageVariantId,
    taskInfo,
    onOpenImageLightbox,
    onOpenVideoLightbox,
    onCloseLightbox,
    isMobileActive,
    onMobileActiveChange,
  });

  // Cancel handler (stays in component - uses queryClient + cancelTaskMutation)
  const handleCancel = () => {
    const taskId = task.id;
    const queryKey = taskQueryKeys.paginated(selectedProjectId!);

    // Snapshot previous data for rollback
    const previousData = queryClient.getQueryData(queryKey);

    // Optimistic update - immediately show as cancelled
    queryClient.setQueriesData(
      { queryKey },
      (oldData: { tasks?: Task[]; total?: number } | undefined) => {
        if (!oldData?.tasks) return oldData;
        return {
          ...oldData,
          tasks: oldData.tasks.map((t: Task) =>
            t.id === taskId ? { ...t, status: 'Cancelled' as const } : t
          ),
        };
      }
    );

    cancelTaskMutation.mutate(taskId, {
      onError: (error) => {
        // Rollback optimistic update on failure
        queryClient.setQueryData(queryKey, previousData);
        toast({
          title: 'Cancellation Failed',
          description: error.message || 'Could not cancel the task.',
          variant: 'destructive',
        });
      },
      onSettled: () => {
        // Always invalidate to ensure consistency with DB
        queryClient.invalidateQueries({ queryKey });
      },
    });
  };

  const handleSwitchProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    navigate('/');
  };

  const containerClass = cn(
    "relative p-3 mb-2 bg-zinc-800/95 rounded-md shadow border transition-colors overflow-hidden",
    isNew ? "border-teal-400 animate-[flash_3s_ease-in-out]" :
    isActive ? "border-blue-500 bg-blue-900/20 ring-2 ring-blue-400/50" :
    "border-zinc-600 hover:border-zinc-400"
  );

  // Get variant name for display (hide for edit tasks since "Edit: ..." is redundant with task type)
  const variantName = (IMAGE_EDIT_TASK_TYPES as readonly string[]).includes(task.taskType)
    ? undefined
    : taskInfo.isVideoTask
      ? videoOutputs?.[0]?.name
      : generationData?.name;

  const taskItemContent = (
    <div
      className={containerClass}
      onMouseEnter={() => setIsHoveringTaskItem(true)}
      onMouseLeave={() => setIsHoveringTaskItem(false)}
      onClick={handleMobileTap}
    >
      {/* Header row */}
      <div className="flex justify-between items-center mb-1 gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-sm font-light text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis cursor-default min-w-0">
            {abbreviatedTaskType}
          </span>

          <TaskItemActions
            task={task}
            isMobile={isMobile}
            isCompletedVideoTask={taskInfo.isCompletedVideoTask}
            isImageTask={taskInfo.isImageTask}
            generationData={generationData}
            isLoadingVideoGen={isLoadingVideoGen}
            waitingForVideoToOpen={waitingForVideoToOpen}
            onViewVideo={handleViewVideo}
            onViewImage={handleViewImage}
            onVisitShot={handleVisitShot}
            showProjectIndicator={showProjectIndicator}
            projectName={projectName}
            selectedProjectId={selectedProjectId || undefined}
            onSwitchProject={handleSwitchProject}
            shotId={shotId}
          />
        </div>

        <span
          className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${
            task.status === 'In Progress' ? 'bg-blue-500 text-blue-100' :
            task.status === 'Complete' ? 'bg-green-500 text-green-100' :
            task.status === 'Failed' ? 'bg-red-500 text-red-100' :
            task.status === 'Queued' ? 'bg-purple-500 text-purple-100' :
            task.status === 'Cancelled' ? 'bg-orange-500 text-orange-100' : 'bg-gray-500 text-gray-100'
          }`}
        >
          {task.status}
        </span>
      </div>

      {/* Image previews for Travel tasks */}
      {imagesToShow.length > 0 && (
        <div className="flex items-center overflow-x-auto mb-1 mt-2">
          <div className="flex items-center">
            {imagesToShow.map((url, idx) => (
              <img
                key={idx}
                src={url as string}
                alt={`input-${idx}`}
                className="w-12 h-12 object-cover rounded mr-1 border border-zinc-700"
              />
            ))}
            {extraImageCount > 0 && (
              <span className="text-xs text-zinc-400 ml-1">+ {extraImageCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Prompt for Image Generation tasks (not edit tasks) */}
      {taskParams.promptText && !taskInfo.isVideoTask && !(IMAGE_EDIT_TASK_TYPES as readonly string[]).includes(task.taskType) && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5 flex items-center justify-between">
            <div className="text-xs text-zinc-200 flex-1 min-w-0 pr-2 preserve-case">
              "{taskParams.promptText.length > 50 ? `${taskParams.promptText.substring(0, 50)}...` : taskParams.promptText}"
            </div>
            {generationData && (
              <button
                onClick={() => {
                  const initialVariantId = getTaskVariantId(generationData, imageVariantId);
                  if (onOpenImageLightbox) {
                    onOpenImageLightbox(task, generationData, initialVariantId);
                  }
                }}
                className="w-8 h-8 rounded border border-zinc-500 overflow-hidden hover:border-zinc-400 transition-colors flex-shrink-0"
              >
                <img
                  src={generationData.imageUrl}
                  alt="Generated image"
                  className="w-full h-full object-cover"
                />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center text-[11px] text-zinc-400">
        <span className="flex-1">
          {task.status === 'In Progress' && processingTime ?
            processingTime :
            task.status === 'Complete' && completedTime ?
            completedTime :
            `Created ${createdTimeAgo ?? 'Unknown'}`
          }
        </span>

        {variantName && (
          <span className="ml-2 px-1.5 py-0.5 bg-black/50 text-white text-[10px] rounded-md flex-shrink-0 preserve-case">
            {variantName}
          </span>
        )}

        {/* Action buttons for queued/in progress tasks */}
        {(task.status === 'Queued' || task.status === 'In Progress') && (
          <div className="flex items-center flex-shrink-0">
            {taskSupportsProgress(task.taskType) && task.status === 'In Progress' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCheckProgress}
                disabled={progressPercent !== null}
                className="px-2 py-1 min-w-[80px] h-auto text-blue-400 hover:bg-blue-900/20 hover:text-blue-300 flex flex-col items-center justify-center"
              >
                <div className="text-xs leading-tight">
                  {progressPercent === null ? (
                    <>
                      <div>Check</div>
                      <div>Progress</div>
                    </>
                  ) : (
                    <>
                      <div>{progressPercent}%</div>
                      <div>Complete</div>
                    </>
                  )}
                </div>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={cancelTaskMutation.isPending}
              className="px-2 py-0.5 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            >
              {cancelTaskMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </Button>
          </div>
        )}
      </div>

      {/* Error message for failed tasks */}
      {task.status === 'Failed' && task.errorMessage && isHoveringTaskItem && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-200 animate-in slide-in-from-top-2 duration-200">
          <div className="font-semibold text-red-300 mb-1">Error:</div>
          {cascadedTaskId ? (
            <div>
              {isCascadedTaskLoading ? (
                <div className="text-zinc-400 text-[10px] mb-1">Loading error from related task...</div>
              ) : cascadedTask?.error_message ? (
                <div>
                  <div className="text-zinc-400 text-[10px] mb-1">
                    Cascaded from related task ({getTaskDisplayName(cascadedTask.task_type)}):
                  </div>
                  <div className="whitespace-pre-wrap break-words">{cascadedTask.error_message}</div>
                </div>
              ) : (
                <div>
                  <div className="text-zinc-400 text-[10px] mb-1">
                    Cascaded from related task{cascadedTask ? ` (${getTaskDisplayName(cascadedTask.task_type)})` : ''}:
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">No error message available</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(cascadedTaskId);
                        toast({ title: 'Task ID Copied', description: 'Related task ID copied to clipboard', variant: 'default' });
                      }}
                      className="px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors border border-zinc-600 hover:border-zinc-400"
                    >
                      copy id
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">{task.errorMessage}</div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <TaskItemTooltip
      task={task}
      isVideoTask={taskInfo.isVideoTask}
      isCompletedVideoTask={taskInfo.isCompletedVideoTask}
      showsTooltip={taskInfo.showsTooltip}
      isMobile={isMobile}
      travelImageUrls={travelImageUrls}
      videoOutputs={videoOutputs}
      generationData={generationData}
      onOpenVideoLightbox={onOpenVideoLightbox}
      onOpenImageLightbox={onOpenImageLightbox}
      onResetHoverState={() => setIsHoveringTaskItem(false)}
      availableLoras={availableLoras}
    >
      {taskItemContent}
    </TaskItemTooltip>
  );
};

// Memoize to prevent re-renders when parent list updates but this task hasn't changed
const TaskItem = React.memo(TaskItemComponent, (prevProps, nextProps) => {
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.errorMessage === nextProps.task.errorMessage &&
    prevProps.isNew === nextProps.isNew &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isMobileActive === nextProps.isMobileActive &&
    prevProps.showProjectIndicator === nextProps.showProjectIndicator &&
    prevProps.projectName === nextProps.projectName
  );
});

export default TaskItem;
