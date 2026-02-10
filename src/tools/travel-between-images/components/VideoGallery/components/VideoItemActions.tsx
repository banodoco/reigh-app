import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Info, CornerDownLeft, Check, Share2, Copy, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { VariantBadge } from '@/shared/components/VariantBadge';
import { GenerationRow } from '@/types/shots';

export interface VideoItemActionsProps {
  video: GenerationRow;
  originalIndex: number;
  isMobile: boolean;
  deletingVideoId: string | null;
  deleteTooltip?: string;
  /** Task mapping from unified cache — null when no task is associated */
  taskId: string | undefined;
  onLightboxOpen: (index: number) => void;
  onDelete: (id: string) => void;
  onHoverStart: (video: GenerationRow, event: React.MouseEvent) => void;
  onHoverEnd: () => void;
  onMobileModalOpen: (video: GenerationRow) => void;
  onApplySettingsFromTask: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  // Share state (driven by parent hook)
  handleShare: () => void;
  isCreatingShare: boolean;
  shareCopied: boolean;
  shareSlug: string | null | undefined;
}

export const VideoItemActions: React.FC<VideoItemActionsProps> = ({
  video,
  originalIndex,
  isMobile,
  deletingVideoId,
  deleteTooltip,
  taskId,
  onLightboxOpen,
  onDelete,
  onHoverStart,
  onHoverEnd,
  onMobileModalOpen,
  onApplySettingsFromTask,
  handleShare,
  isCreatingShare,
  shareCopied,
  shareSlug,
}) => {
  // Track success state for Apply Settings button
  const [settingsApplied, setSettingsApplied] = useState(false);

  return (
    <div className="absolute top-1/2 right-2 sm:right-3 flex flex-col items-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity -translate-y-1/2 z-20 pointer-events-auto">
      {/* Share Button */}
      {taskId && (
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={handleShare}
                disabled={isCreatingShare}
                className={`h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full text-white transition-all ${shareCopied
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-black/50 hover:bg-black/70'
                  }`}
              >
                {isCreatingShare ? (
                  <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" />
                ) : shareCopied ? (
                  <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                ) : shareSlug ? (
                  <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                ) : (
                  <Share2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{shareCopied ? 'Link copied!' : shareSlug ? 'Copy share link' : 'Share this video'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Variant Count - positioned above Info button */}
      <VariantBadge
        derivedCount={video.derivedCount}
        unviewedVariantCount={video.unviewedVariantCount}
        hasUnviewedVariants={video.hasUnviewedVariants}
        variant="inline"
        size="lg"
        tooltipSide="left"
        showNewBadge={false}
      />

      <Button
        variant="secondary"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();

          if (isMobile) {
            onMobileModalOpen(video);
          } else {
            onLightboxOpen(originalIndex);
          }
        }}
        onMouseEnter={(e) => onHoverStart(video, e)}
        onMouseLeave={onHoverEnd}
        className="h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
      >
        <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </Button>

      {/* Apply Settings Button */}
      {taskId && (
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  if (taskId && !settingsApplied) {
                    onApplySettingsFromTask(taskId, true, []);
                    setSettingsApplied(true);
                    setTimeout(() => {
                      setSettingsApplied(false);
                    }, 2000);
                  }
                }}
                disabled={settingsApplied}
                className={`h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full text-white transition-all ${settingsApplied
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-black/50 hover:bg-black/70'
                  }`}
              >
                {settingsApplied ? (
                  <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                ) : (
                  <CornerDownLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{settingsApplied ? 'Settings applied!' : 'Apply settings & images from this video to the current shot'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Delete Button */}
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(video.id);
              }}
              disabled={deletingVideoId === video.id}
              className="h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-full"
            >
              <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>{deleteTooltip || 'Delete video'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
