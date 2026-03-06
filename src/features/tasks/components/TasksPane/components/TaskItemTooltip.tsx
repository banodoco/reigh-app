import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Task } from '@/types/tasks';
import { GenerationRow } from '@/domains/generation/types';
import { GenerationDetails } from '@/domains/generation/components/GenerationDetails';
import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import { getTaskVariantId } from '../utils/getTaskVariantId';

interface TaskItemTooltipProps {
  task: Task;
  isVideoTask: boolean;
  isCompletedVideoTask: boolean;
  showsTooltip: boolean;
  isMobile: boolean;
  // Data
  travelImageUrls: string[];
  videoOutputs: GenerationRow[] | null;
  generationData: GenerationRow | null;
  // Callbacks
  onOpenVideoLightbox?: (task: Task, media: GenerationRow[], videoIndex: number, initialVariantId?: string) => void;
  onOpenImageLightbox?: (task: Task, media: GenerationRow, initialVariantId?: string) => void;
  onResetHoverState: () => void;
  // Available LoRAs for proper display names
  availableLoras?: LoraModel[];
  // The content to wrap
  children: React.ReactNode;
}

export const TaskItemTooltip: React.FC<TaskItemTooltipProps> = ({
  task,
  isVideoTask,
  isCompletedVideoTask,
  showsTooltip,
  isMobile,
  travelImageUrls,
  videoOutputs,
  generationData,
  onOpenVideoLightbox,
  onOpenImageLightbox,
  onResetHoverState,
  availableLoras,
  children,
}) => {
  // Don't show tooltips on mobile to improve performance and UX
  if (!showsTooltip || isMobile) {
    return <>{children}</>;
  }

  const hasClickableContent = isVideoTask 
    ? (isCompletedVideoTask && videoOutputs && videoOutputs.length > 0) 
    : !!generationData;
  
  const handleTooltipClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Reset hover state immediately when clicking tooltip
    onResetHoverState();
    
    if (isVideoTask && hasClickableContent && onOpenVideoLightbox && videoOutputs && videoOutputs.length > 0) {
      const initialVariantId = getTaskVariantId(videoOutputs[0]);
      onOpenVideoLightbox(task, videoOutputs, 0, initialVariantId);
    } else if (!isVideoTask && hasClickableContent && onOpenImageLightbox && generationData) {
      const initialVariantId = getTaskVariantId(generationData);
      onOpenImageLightbox(task, generationData, initialVariantId);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="left" 
        className={cn(
          "p-0 border-0 bg-background/95 backdrop-blur-sm z-[100001]",
          isVideoTask ? "max-w-lg" : "max-w-md"
        )}
        sideOffset={15}
        collisionPadding={10}
      >
        <div
          className="relative cursor-pointer hover:bg-background/90 transition-colors rounded-lg group"
          onClick={handleTooltipClick}
        >
          <GenerationDetails
            task={task}
            inputImages={isVideoTask ? travelImageUrls : []}
            variant="hover"
            isMobile={false}
            availableLoras={availableLoras}
            showCopyButtons={true}
          />

          {/* Click to view indicator */}
          {hasClickableContent && (
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-zinc-900/90 via-zinc-800/60 to-transparent p-2 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="text-xs text-zinc-100 text-center font-medium drop-shadow-md">
                {isVideoTask ? "Click to view video" : "Click to view image"}
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
