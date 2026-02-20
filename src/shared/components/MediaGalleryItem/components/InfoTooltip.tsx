import React from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/shared/components/ui/tooltip";
import { GenerationDetails } from "@/shared/components/GenerationDetails";
import { ImageGenerationDetails } from "@/shared/components/ImageGenerationDetails";
import type { GeneratedImageWithMetadata } from "../../MediaGallery/types";
import type { Task } from "@/types/tasks";

interface InfoTooltipProps {
  image: GeneratedImageWithMetadata;
  taskData: Task | null | undefined;
  inputImages: string[];
  shouldShowMetadata: boolean;
  shouldShowTaskDetails: boolean;
  setIsInfoOpen: (open: boolean) => void;
  isMobile: boolean;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  image,
  taskData,
  inputImages,
  shouldShowMetadata,
  shouldShowTaskDetails,
  setIsInfoOpen,
  isMobile,
}) => {
  // Only show on desktop, when metadata exists and no unviewed variants
  if (!image.metadata || isMobile || image.hasUnviewedVariants) {
    return null;
  }

  return (
    <Tooltip onOpenChange={setIsInfoOpen}>
      <TooltipTrigger asChild>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
          <div className="h-7 w-7 rounded-full bg-black/30 flex items-center justify-center">
            <Info className="h-3.5 w-3.5 text-white" />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="start"
        className="max-w-lg p-0 border-0 bg-background/95 backdrop-blur-sm"
        sideOffset={15}
        collisionPadding={10}
      >
        {shouldShowMetadata && image.metadata && (
          <>
            {shouldShowTaskDetails ? (
              <GenerationDetails
                task={taskData ?? undefined}
                inputImages={inputImages}
                variant="hover"
                isMobile={false}
              />
            ) : (
              <ImageGenerationDetails
                metadata={image.metadata}
                variant="hover"
                isMobile={false}
                showUserImage={true}
              />
            )}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
};
