import { useMemo } from 'react';
import { useGenerationTaskMapping } from '@/domains/generation/hooks/tasks/useGenerationTaskMapping';
import { useTaskType } from '@/shared/hooks/tasks/useTaskType';
import { useGetTask } from '@/shared/hooks/tasks/useTasks';
import { useShareGeneration } from '@/shared/hooks/useShareGeneration';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { isImageEditTaskType } from '@/shared/lib/taskParamsUtils';
import { deriveGalleryInputImages } from '../../MediaGallery/utils';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';

interface UseMediaGalleryItemTaskShareParams {
  image: GeneratedImageWithMetadata;
  actualGenerationId: string | null | undefined;
  selectedProjectId: string | null | undefined;
}

export function useMediaGalleryItemTaskShare({
  image,
  actualGenerationId,
  selectedProjectId,
}: UseMediaGalleryItemTaskShareParams) {
  const taskIdFromMetadata = image.metadata?.taskId as string | undefined;
  const { data: taskIdMapping } = useGenerationTaskMapping(actualGenerationId ?? '');
  const taskIdFromCache = typeof taskIdMapping?.taskId === 'string' ? taskIdMapping.taskId : null;
  const taskId: string | null = taskIdFromMetadata || taskIdFromCache;
  const { data: taskData } = useGetTask(taskId ?? '', selectedProjectId ?? null);
  const inputImages = useMemo(() => deriveGalleryInputImages(taskData), [taskData]);
  const taskType = taskData?.taskType;
  const { data: taskTypeInfo } = useTaskType(taskType || '');
  const isVideoTask = taskTypeInfo?.content_type === 'video' ||
    (!taskTypeInfo && image.metadata?.tool_type === TOOL_IDS.TRAVEL_BETWEEN_IMAGES);
  const isImageEditTask = isImageEditTaskType(taskType || undefined);
  const shouldShowTaskDetails = Boolean(taskData) && (isVideoTask || isImageEditTask);
  const { handleShare, isCreatingShare, shareCopied, shareSlug } = useShareGeneration(
    image.id,
    taskId,
    undefined,
    { projectId: selectedProjectId },
  );

  return {
    taskId,
    taskData,
    inputImages,
    shouldShowTaskDetails,
    handleShare,
    isCreatingShare,
    shareCopied,
    shareSlug,
  };
}
