import React from 'react';
import type { LoraModel } from '@/domains/lora/types/lora';
import { Task } from '@/types/tasks';
import { TaskDetailsSummaryAndParams } from '@/shared/components/TaskDetails/components/TaskDetailsSummaryAndParams';

export interface TaskDetailsSummaryControls {
  showAllImages: boolean;
  onShowAllImagesChange: (show: boolean) => void;
  showFullPrompt: boolean;
  onShowFullPromptChange: (show: boolean) => void;
  showFullNegativePrompt: boolean;
  onShowFullNegativePromptChange: (show: boolean) => void;
  showDetailedParams: boolean;
  onShowDetailedParamsChange: (show: boolean) => void;
  paramsCopied: boolean;
  onCopyParams: () => void;
}

interface TaskDetailsSummarySectionProps {
  task: Task;
  inputImages: string[];
  detailsVariant: 'modal' | 'panel';
  isMobile: boolean;
  availableLoras?: LoraModel[];
  controls: TaskDetailsSummaryControls;
  showCopyButtons?: boolean;
  children?: React.ReactNode;
}

export function TaskDetailsSummarySection({
  task,
  inputImages,
  detailsVariant,
  isMobile,
  availableLoras,
  controls,
  showCopyButtons,
  children,
}: TaskDetailsSummarySectionProps) {
  return (
    <TaskDetailsSummaryAndParams
      task={task}
      inputImages={inputImages}
      detailsVariant={detailsVariant}
      isMobile={isMobile}
      availableLoras={availableLoras}
      showAllImages={controls.showAllImages}
      onShowAllImagesChange={controls.onShowAllImagesChange}
      showFullPrompt={controls.showFullPrompt}
      onShowFullPromptChange={controls.onShowFullPromptChange}
      showFullNegativePrompt={controls.showFullNegativePrompt}
      onShowFullNegativePromptChange={controls.onShowFullNegativePromptChange}
      showDetailedParams={controls.showDetailedParams}
      onShowDetailedParamsChange={controls.onShowDetailedParamsChange}
      paramsCopied={controls.paramsCopied}
      onCopyParams={controls.onCopyParams}
      showCopyButtons={showCopyButtons}
    >
      {children}
    </TaskDetailsSummaryAndParams>
  );
}
