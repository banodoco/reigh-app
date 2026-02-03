import React from "react";
import { PlusCircle, Check, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/shared/components/ui/tooltip";
import { ShotSelector } from "@/shared/components/ShotSelector";
import { cn } from "@/shared/lib/utils";
import type { GeneratedImageWithMetadata } from "../../MediaGallery";

interface ShotActionsProps {
  image: GeneratedImageWithMetadata;
  isMobile: boolean;
  isVideoContent: boolean;
  selectedShotId: string;
  simplifiedShotOptions: { id: string; name: string }[];
  isShotSelectorOpen: boolean;
  setIsShotSelectorOpen: (open: boolean) => void;
  setSelectedShotIdLocal: (id: string) => void;
  setLastAffectedShotId: (id: string) => void;
  // Shot action state
  addingToShotImageId: string | null;
  addingToShotWithoutPositionImageId: string | null;
  showTickForImageId: string | null;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  shouldShowAddWithoutPositionButton: boolean;
  currentTargetShotName: string | undefined;
  // Quick create state
  quickCreateSuccess: boolean;
  // Callbacks
  onCreateShot?: (name: string, files: File[]) => Promise<void>;
  handleQuickCreateAndAdd: () => void;
  handleQuickCreateSuccess: () => void;
  onNavigateToShot: (shot: { id: string; name: string }) => void;
  // Add to shot actions (from useShotActions hook)
  onAddToShot: () => Promise<void>;
  onAddToShotWithoutPosition: () => Promise<void>;
}

export const ShotActions: React.FC<ShotActionsProps> = ({
  image,
  isMobile,
  isVideoContent,
  selectedShotId,
  simplifiedShotOptions,
  isShotSelectorOpen,
  setIsShotSelectorOpen,
  setSelectedShotIdLocal,
  setLastAffectedShotId,
  addingToShotImageId,
  addingToShotWithoutPositionImageId,
  showTickForImageId,
  isAlreadyPositionedInSelectedShot,
  isAlreadyAssociatedWithoutPosition,
  shouldShowAddWithoutPositionButton,
  currentTargetShotName,
  quickCreateSuccess,
  onCreateShot,
  handleQuickCreateAndAdd,
  handleQuickCreateSuccess,
  onNavigateToShot,
  onAddToShot,
  onAddToShotWithoutPosition,
}) => {
  // Handle add to shot click - navigate if already positioned, otherwise add
  const handleAddToShotClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If in transient success or already positioned, navigate to shot
    if ((showTickForImageId === image.id || isAlreadyPositionedInSelectedShot) && selectedShotId && simplifiedShotOptions) {
      const targetShot = simplifiedShotOptions.find(s => s.id === selectedShotId);
      if (targetShot) {
        onNavigateToShot(targetShot);
        return;
      }
    }

    // If already positioned in shot, nothing else to do (navigation already handled)
    if (isAlreadyPositionedInSelectedShot) {
      return;
    }

    await onAddToShot();
  };

  // Handle add without position click
  const handleAddWithoutPositionClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If already associated without position, navigate to shot
    if (isAlreadyAssociatedWithoutPosition && selectedShotId && simplifiedShotOptions) {
      const targetShot = simplifiedShotOptions.find(s => s.id === selectedShotId);
      if (targetShot) {
        onNavigateToShot(targetShot);
        return;
      }
    }

    await onAddToShotWithoutPosition();
  };

  return (
    <div className={cn(
      "absolute top-1.5 left-1.5 right-1.5 flex flex-col items-start gap-1 transition-opacity z-20",
      isShotSelectorOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
    )}>
      {!isVideoContent && (
        <ShotSelector
          value={selectedShotId}
          onValueChange={(value) => {
            setSelectedShotIdLocal(value);
            setLastAffectedShotId(value);
          }}
          shots={simplifiedShotOptions}
          placeholder="Shot..."
          className="w-full"
          triggerClassName={isMobile
            ? "h-8 px-3 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-sm w-full truncate focus:ring-0 focus:ring-offset-0"
            : "h-7 px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs w-full truncate focus:ring-0 focus:ring-offset-0"
          }
          showAddShot={!!onCreateShot}
          onCreateShot={handleQuickCreateAndAdd}
          isCreatingShot={addingToShotImageId === image.id}
          quickCreateSuccess={quickCreateSuccess}
          onQuickCreateSuccess={handleQuickCreateSuccess}
          side="top"
          align="start"
          sideOffset={4}
          onNavigateToShot={(shot) => onNavigateToShot(shot as { id: string; name: string })}
          open={isShotSelectorOpen}
          onOpenChange={setIsShotSelectorOpen}
        />
      )}

      {!isVideoContent && (
        <div className="relative">
          <Tooltip delayDuration={0} disableHoverableContent>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white ${
                  showTickForImageId === image.id
                    ? 'bg-green-500 hover:bg-green-600 !text-white'
                    : isAlreadyPositionedInSelectedShot
                      ? 'bg-gray-500/60 hover:bg-gray-600/70 !text-white'
                      : ''
                }`}
                onClick={handleAddToShotClick}
                disabled={!selectedShotId || addingToShotImageId === image.id}
                aria-label={
                  isAlreadyPositionedInSelectedShot ? `Jump to ${currentTargetShotName}` :
                  showTickForImageId === image.id ? `Jump to ${currentTargetShotName}` :
                  (currentTargetShotName ? `Add to '${currentTargetShotName}' at final position` : "Add to selected shot")
                }
                onPointerDown={(e) => e.stopPropagation()}
              >
                {addingToShotImageId === image.id ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                ) : showTickForImageId === image.id ? (
                  <Check className="h-4 w-4" />
                ) : isAlreadyPositionedInSelectedShot ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <PlusCircle className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isAlreadyPositionedInSelectedShot ? `Jump to ${currentTargetShotName || 'shot'}` :
              showTickForImageId === image.id ? `Jump to ${currentTargetShotName || 'shot'}` :
              (selectedShotId && currentTargetShotName ? `Add to '${currentTargetShotName}' at final position` : "Select a shot then click to add")}
            </TooltipContent>
          </Tooltip>

          {/* Add without position button - visibility now memoized for performance */}
          {shouldShowAddWithoutPositionButton && (
            <Tooltip delayDuration={0} disableHoverableContent>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={`absolute -top-1 -right-1 h-4 w-4 p-0 rounded-full border-0 scale-75 hover:scale-100 transition-transform duration-200 ease-out ${
                    isAlreadyAssociatedWithoutPosition
                      ? 'bg-gray-500/80 hover:bg-gray-600/90 text-white'
                      : 'bg-black/60 hover:bg-black/80 text-white'
                  }`}
                  onClick={handleAddWithoutPositionClick}
                  disabled={!selectedShotId || addingToShotWithoutPositionImageId === image.id || addingToShotImageId === image.id}
                  aria-label={
                    isAlreadyAssociatedWithoutPosition
                      ? (currentTargetShotName ? `Jump to ${currentTargetShotName}` : 'Jump to shot')
                      : (currentTargetShotName ? `Add to '${currentTargetShotName}' without position` : "Add to selected shot without position")
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {addingToShotWithoutPositionImageId === image.id ? (
                    <div className="h-2 w-2 animate-spin rounded-full border-b border-white"></div>
                  ) : isAlreadyAssociatedWithoutPosition ? (
                    <Check className="h-2 w-2" />
                  ) : (
                    <Plus className="h-2 w-2" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isAlreadyAssociatedWithoutPosition
                  ? `Jump to ${currentTargetShotName || 'shot'}`
                  : (selectedShotId && currentTargetShotName ? `Add to '${currentTargetShotName}' without position` : "Add to selected shot without position")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
};
