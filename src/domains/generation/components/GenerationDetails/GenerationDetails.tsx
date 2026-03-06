/**
 * GenerationDetails
 *
 * A unified component for displaying generation/task details across the application.
 * Routes to the appropriate specialized component based on task type.
 *
 * Used in: TasksPane hover, VariantSelector hover, MediaLightbox info section
 */

import React from 'react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useGenerationDetails } from './useGenerationDetails';
import { isImageEditTaskType, isVideoEnhanceTaskType, isImageEnhanceTaskType, parseTaskParams, derivePrompt } from '@/shared/lib/taskParamsUtils';
import { type TaskDetailsProps } from '@/shared/types/taskDetailsTypes';
import { ImageEditTaskDetails } from '@/shared/components/TaskDetails/ImageEditTaskDetails';
import { ImageEnhanceDetails } from '@/shared/components/TaskDetails/ImageEnhanceDetails';
import { CharacterAnimateDetails } from '@/shared/components/TaskDetails/CharacterAnimateDetails';
import { JoinClipsDetails } from '@/shared/components/TaskDetails/JoinClipsDetails';
import { VideoTravelDetails } from '@/shared/components/TaskDetails/VideoTravelDetails';
import { VideoEnhanceDetails } from '@/shared/components/TaskDetails/VideoEnhanceDetails';
import { isJoinClipsTaskType, isCharacterAnimateTaskType, isTravelTaskType } from '@/shared/lib/taskTypeUtils';
import { ImageGenerationDetails } from '@/domains/generation/components/GenerationDetails/ImageGenerationDetails';
import { Task } from '@/types/tasks';
import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import type { DisplayableMetadata } from '@/shared/components/MediaGallery/types';

// Types
type DisplayVariant = 'hover' | 'modal' | 'panel';

interface GenerationDetailsProps {
  /** Task ID - component will fetch task data */
  taskId?: string;
  /** Direct task data (for backward compatibility) */
  task?: Task;
  /** Input images - derived from task if not provided */
  inputImages?: string[];
  /** Optional project scope for task lookup */
  projectId?: string | null;
  /** Display variant */
  variant: DisplayVariant;
  /** Mobile layout */
  isMobile?: boolean;
  // Pass-through props for specialized components
  showAllImages?: boolean;
  onShowAllImagesChange?: (show: boolean) => void;
  showFullPrompt?: boolean;
  onShowFullPromptChange?: (show: boolean) => void;
  showFullNegativePrompt?: boolean;
  onShowFullNegativePromptChange?: (show: boolean) => void;
  availableLoras?: LoraModel[];
  showCopyButtons?: boolean;
}

/**
 * Loading skeleton for GenerationDetails
 */
const LoadingSkeleton: React.FC<{ variant: DisplayVariant }> = ({ variant }) => (
  <div className={`p-3 bg-muted/30 rounded-lg border ${variant === 'panel' ? '' : 'w-[300px]'}`}>
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-4 w-32" />
    </div>
  </div>
);

/**
 * Main GenerationDetails component
 *
 * Routes to the appropriate specialized component based on task type.
 */
export const GenerationDetails: React.FC<GenerationDetailsProps> = ({
  taskId,
  task: taskProp,
  inputImages: inputImagesProp,
  projectId,
  variant,
  isMobile = false,
  showAllImages,
  onShowAllImagesChange,
  showFullPrompt,
  onShowFullPromptChange,
  showFullNegativePrompt,
  onShowFullNegativePromptChange,
  availableLoras,
  showCopyButtons,
}) => {
  // Use hook for data fetching and preparation
  const { task, inputImages, isLoading } = useGenerationDetails({
    taskId,
    task: taskProp,
    inputImages: inputImagesProp,
    projectId: projectId ?? taskProp?.projectId ?? null,
  });

  // Show loading state when fetching task
  if (taskId && isLoading && !taskProp) {
    return <LoadingSkeleton variant={variant} />;
  }

  // If no task, show nothing
  if (!task) {
    return null;
  }

  // Build props for specialized components
  const detailsProps: TaskDetailsProps = {
    task,
    inputImages,
    variant,
    isMobile,
    showAllImages,
    onShowAllImagesChange,
    showFullPrompt,
    onShowFullPromptChange,
    showFullNegativePrompt,
    onShowFullNegativePromptChange,
    availableLoras,
    showCopyButtons,
  };

  const taskType = task.taskType;

  // Route to appropriate specialized component based on task type
  if (isVideoEnhanceTaskType(taskType)) {
    return <VideoEnhanceDetails {...detailsProps} />;
  }

  if (isImageEnhanceTaskType(taskType)) {
    return <ImageEnhanceDetails {...detailsProps} />;
  }

  if (isImageEditTaskType(taskType)) {
    return <ImageEditTaskDetails {...detailsProps} />;
  }

  if (isCharacterAnimateTaskType(taskType)) {
    return <CharacterAnimateDetails {...detailsProps} />;
  }

  if (isJoinClipsTaskType(taskType)) {
    return <JoinClipsDetails {...detailsProps} />;
  }

  // For travel tasks, use VideoTravelDetails
  if (isTravelTaskType(taskType)) {
    return <VideoTravelDetails {...detailsProps} />;
  }

  // For image generation tasks (non-video), build metadata and use ImageGenerationDetails
  const parsedParams = parseTaskParams(task.params);
  const asString = (value: unknown): string | undefined => (
    typeof value === 'string' ? value : undefined
  );
  const asNumber = (value: unknown): number | undefined => (
    typeof value === 'number' ? value : undefined
  );
  const metadata: DisplayableMetadata = {
    prompt: derivePrompt(parsedParams) ?? undefined,
    tool_type: taskType,
    originalParams: parsedParams,
    negative_prompt: asString(parsedParams.negative_prompt),
    model: asString(parsedParams.model),
    steps: asNumber(parsedParams.steps) ?? asNumber(parsedParams.num_inference_steps),
    resolution: asString(parsedParams.resolution),
    style_reference_image: asString(parsedParams.style_reference_image),
    style_reference_strength: asNumber(parsedParams.style_reference_strength),
    subject_strength: asNumber(parsedParams.subject_strength),
    scene_reference_strength: asNumber(parsedParams.scene_reference_strength),
  };

  return (
    <ImageGenerationDetails
      metadata={metadata}
      variant={variant}
      isMobile={isMobile}
      showFullPrompt={showFullPrompt}
      onShowFullPromptChange={onShowFullPromptChange}
      showFullNegativePrompt={showFullNegativePrompt}
      onShowFullNegativePromptChange={onShowFullNegativePromptChange}
      showCopyButtons={showCopyButtons}
    />
  );
};
