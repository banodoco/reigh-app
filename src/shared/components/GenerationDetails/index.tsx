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
import {
  ImageEditTaskDetails,
  CharacterAnimateDetails,
  JoinClipsDetails,
  VideoTravelDetails,
  VideoEnhanceDetails,
  isImageEditTaskType,
  isVideoEnhanceTaskType,
  type TaskDetailsProps,
} from '@/tools/travel-between-images/components/TaskDetails';
import { isJoinClipsTaskType, isCharacterAnimateTaskType } from '@/shared/lib/taskTypeUtils';
import { VariantDetails } from './VariantDetails';

// Types
export type DisplayVariant = 'hover' | 'modal' | 'panel';

export interface VariantMeta {
  isPrimary?: boolean;
  isParent?: boolean;
  isChild?: boolean;
  createdAt?: string;
}

export interface GenerationDetailsProps {
  /** Task ID - component will fetch task data */
  taskId?: string;
  /** Direct task data (for backward compatibility) */
  task?: any;
  /** Input images - derived from task if not provided */
  inputImages?: string[];
  /** Display variant */
  variant: DisplayVariant;
  /** Variant type (trimmed, upscaled, etc.) for transformation variants */
  variantType?: string;
  /** Variant-specific params (for trim/upscale) */
  variantParams?: Record<string, any>;
  /** Variant relationship metadata */
  variantMeta?: VariantMeta;
  /** Mobile layout */
  isMobile?: boolean;
  // Pass-through props for specialized components
  showAllImages?: boolean;
  onShowAllImagesChange?: (show: boolean) => void;
  showFullPrompt?: boolean;
  onShowFullPromptChange?: (show: boolean) => void;
  showFullNegativePrompt?: boolean;
  onShowFullNegativePromptChange?: (show: boolean) => void;
  availableLoras?: any[];
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
  variant,
  variantType,
  variantParams,
  variantMeta,
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
  });

  // Transform variants (trimmed, upscaled) show their own UI, not full task details
  const isTransformVariant = variantType === 'trimmed' || variantType === 'upscaled';
  const shouldShowVariantOnly = isTransformVariant && variantParams;

  // Show loading state when fetching task (but not for transform variants)
  if (taskId && isLoading && !taskProp && !shouldShowVariantOnly) {
    return <LoadingSkeleton variant={variant} />;
  }

  // Render variant-specific display for trim/upscale (transformation variants)
  if (shouldShowVariantOnly) {
    return (
      <VariantDetails
        variantType={variantType!}
        variantParams={variantParams}
        variantMeta={variantMeta}
        variant={variant}
      />
    );
  }

  // For other variant types without task, also show variant-only details if we have params
  if (variantType && !task && variantParams) {
    return (
      <VariantDetails
        variantType={variantType}
        variantParams={variantParams}
        variantMeta={variantMeta}
        variant={variant}
      />
    );
  }

  // If no task and no variant data, show nothing
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

  if (isImageEditTaskType(taskType)) {
    return <ImageEditTaskDetails {...detailsProps} />;
  }

  if (isCharacterAnimateTaskType(taskType)) {
    return <CharacterAnimateDetails {...detailsProps} />;
  }

  if (isJoinClipsTaskType(taskType)) {
    return <JoinClipsDetails {...detailsProps} />;
  }

  // Default to VideoTravelDetails for travel tasks and other video types
  return <VideoTravelDetails {...detailsProps} />;
};

// Re-export for convenience
export { useGenerationDetails } from './useGenerationDetails';
export { VariantDetails } from './VariantDetails';

export default GenerationDetails;
