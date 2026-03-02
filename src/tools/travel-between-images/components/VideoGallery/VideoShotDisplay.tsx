import React, { useState, useMemo } from 'react';
import type { Shot, GenerationRow } from '@/domains/generation/types';
import { useUpdateShotName, useDeleteShot, useDuplicateShot } from '@/shared/hooks/shots';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { Pencil, Trash2, Check, X, Copy, GripVertical, Loader2, Video, ChevronDown, ChevronUp, Images } from 'lucide-react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { cn } from '@/shared/components/ui/contracts/cn';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/components/ui/alert-dialog';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useClickRipple } from '@/shared/hooks/interaction/useClickRipple';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { isVideoGeneration, isPositioned } from '@/shared/lib/typeGuards';
import { VideoGenerationModal } from '../VideoGenerationModal';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useIsMobile } from '@/shared/hooks/mobile';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import MediaLightbox from '@/shared/components/MediaLightbox';
import type { ShotFinalVideo } from '../../hooks/video/useShotFinalVideos';
import { useShotAdditionSelectionOptional } from '@/shared/contexts/ShotAdditionSelectionContext';
import { useVideoShotDisplayState } from '../hooks/useVideoShotDisplayState';

// ---------------------------------------------------------------------------
// ActionButtonsRow - toolbar buttons (video, drag, rename, duplicate, delete)
// ---------------------------------------------------------------------------

interface ActionButtonsRowProps {
  isTempShot: boolean;
  displayImagesCount: number;
  isEditingName: boolean;
  dragHandleProps?: {
    disabled?: boolean;
    [key: string]: unknown;
  };
  dragDisabledReason?: string;
  duplicateIsPending: boolean;
  onVideoClick: () => void;
  onEditName: (e?: React.MouseEvent) => void;
  onDuplicate: (e?: React.MouseEvent) => void;
  onDelete: (e?: React.MouseEvent) => void;
}

const ActionButtonsRow: React.FC<ActionButtonsRowProps> = ({
  isTempShot,
  displayImagesCount,
  isEditingName,
  dragHandleProps,
  dragDisabledReason,
  duplicateIsPending,
  onVideoClick,
  onEditName,
  onDuplicate,
  onDelete,
}) => (
  <div className="flex items-center gap-x-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
    {/* Show loading indicator for temp shots */}
    {isTempShot && (
      <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Saving...</span>
      </div>
    )}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              if (displayImagesCount > 0 && !isTempShot) {
                onVideoClick();
              }
            }}
            disabled={displayImagesCount === 0 || isTempShot}
            className={`h-8 w-8 ${
              displayImagesCount === 0 || isTempShot
                ? 'text-zinc-400 cursor-not-allowed opacity-50'
                : 'text-violet-600 hover:text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-950'
            }`}
          >
            <Video className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isTempShot ? 'Saving...' : displayImagesCount === 0 ? 'Add images to generate video' : 'Generate Video'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    {/* Drag Handle Button - also disabled for temp shots */}
    {dragHandleProps && (
      (dragHandleProps.disabled || isTempShot) && (dragDisabledReason || isTempShot) ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 cursor-not-allowed opacity-50"
                  disabled={true}
                >
                  <GripVertical className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isTempShot ? 'Saving...' : dragDisabledReason}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 cursor-grab active:cursor-grabbing"
                disabled={dragHandleProps.disabled}
                {...dragHandleProps}
              >
                <GripVertical className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Drag to reorder</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    )}
    {!isEditingName && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onEditName} className="h-8 w-8" disabled={isTempShot}>
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isTempShot ? 'Saving...' : 'Edit shot name'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDuplicate}
            className="h-8 w-8"
            disabled={duplicateIsPending || isTempShot}
          >
            {duplicateIsPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
            <Copy className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isTempShot ? 'Saving...' : duplicateIsPending ? "Duplicating..." : "Duplicate shot"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive-foreground hover:bg-destructive h-8 w-8" disabled={isTempShot}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isTempShot ? 'Saving...' : 'Delete shot'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

// ---------------------------------------------------------------------------
// ThumbnailMosaic - image grid with expand/collapse, final video toggle,
// drop loading indicator, and mobile shot-selection overlay
// ---------------------------------------------------------------------------

const IMAGES_PER_ROW = 3;

interface ThumbnailMosaicProps {
  displayImages: GenerationRow[];
  pendingUploads: number;
  imagesOverlay?: React.ReactNode;
  finalVideo?: ShotFinalVideo;
  showVideo: boolean;
  onShowVideoChange: (show: boolean) => void;
  projectAspectRatio?: string;
  dropLoadingState: 'idle' | 'loading' | 'success';
  onFinalVideoLightboxOpen: () => void;
  // Mobile shot selection
  showMobileSelect: boolean;
  isSelectedForAddition: boolean;
  onSelectShotForAddition: (e: React.MouseEvent) => void;
}

const ThumbnailMosaic: React.FC<ThumbnailMosaicProps> = ({
  displayImages,
  pendingUploads,
  imagesOverlay,
  finalVideo,
  showVideo,
  onShowVideoChange,
  projectAspectRatio,
  dropLoadingState,
  onFinalVideoLightboxOpen,
  showMobileSelect,
  isSelectedForAddition,
  onSelectShotForAddition,
}) => {
  const [isImagesExpanded, setIsImagesExpanded] = useState(false);

  // Grid layout calculations
  const totalImageCount = displayImages.length + pendingUploads;
  const hasMultipleRows = totalImageCount > IMAGES_PER_ROW;
  const collapsedRealImages = Math.min(displayImages.length, IMAGES_PER_ROW);
  const collapsedSkeletonCount = !isImagesExpanded
    ? Math.min(pendingUploads, IMAGES_PER_ROW - collapsedRealImages)
    : 0;
  const emptyPlaceholderCount = !isImagesExpanded
    ? Math.max(0, IMAGES_PER_ROW - collapsedRealImages - collapsedSkeletonCount)
    : 0;

  return (
    <div className="flex-grow relative">
      {/* Optional overlay for loading states etc. */}
      {imagesOverlay}

      {/* Final video preview (shown when toggled on) */}
      {finalVideo && showVideo ? (
        <div className="relative group/video">
          <div
            className="rounded border border-border bg-muted shadow-sm overflow-hidden cursor-pointer"
            style={{
              aspectRatio: projectAspectRatio
                ? projectAspectRatio.replace(':', '/')
                : '16/9',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onFinalVideoLightboxOpen();
            }}
          >
            <HoverScrubVideo
              src={finalVideo.location}
              poster={finalVideo.thumbnailUrl ?? undefined}
              loadOnDemand
              preload="metadata"
              className="w-full h-full"
              videoClassName="object-cover pointer-events-none"
            />
          </div>
          {/* Toggle back to shot images */}
          <button
            className="absolute bottom-1 left-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1 z-10"
            onClick={(e) => {
              e.stopPropagation();
              onShowVideoChange(false);
            }}
          >
            <Images className="w-3 h-3" />
            Shot images
          </button>
        </div>
      ) : (
        <>
          {/* Built-in loading indicator for drops - only show when collapsed with >3 images */}
          {dropLoadingState !== 'idle' && displayImages.length > IMAGES_PER_ROW && !isImagesExpanded && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg',
                  dropLoadingState === 'loading' && 'bg-primary text-primary-foreground',
                  dropLoadingState === 'success' && 'bg-green-600 text-white'
                )}
              >
                {dropLoadingState === 'loading' && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                )}
                {dropLoadingState === 'success' && (
                  <>
                    <Check className="h-4 w-4" />
                    Added
                  </>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 relative">
            {/* When collapsed: show first row of existing images */}
            {/* When expanded: show all existing images */}
            {(isImagesExpanded ? displayImages : displayImages.slice(0, IMAGES_PER_ROW)).map((image, index) => (
              <img
                key={`${image.thumbUrl || image.imageUrl || image.location || 'img'}-${index}`}
                src={getDisplayUrl(image.thumbUrl || image.imageUrl || image.location)}
                alt={`Shot image ${index + 1}`}
                className="w-full aspect-square object-cover rounded border border-border bg-muted shadow-sm"
                title={`Image ${index + 1}`}
              />
            ))}

            {/* Show skeletons for pending uploads (with spinner) */}
            {collapsedSkeletonCount > 0 && Array.from({ length: collapsedSkeletonCount }).map((_, index) => (
              <div
                key={`pending-collapsed-${index}`}
                className="w-full aspect-square rounded border-2 border-dashed border-primary/30 bg-primary/5 flex items-center justify-center"
              >
                <Loader2 className="h-5 w-5 text-primary/60 animate-spin" />
              </div>
            ))}

            {/* Empty placeholder slots to fill up to 3 when collapsed (no spinner) */}
            {emptyPlaceholderCount > 0 && Array.from({ length: emptyPlaceholderCount }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="w-full aspect-square rounded border-2 border-dashed border-border"
              />
            ))}

            {/* Skeleton items for pending uploads - always appended at end, only visible when expanded */}
            {pendingUploads > 0 && isImagesExpanded && Array.from({ length: pendingUploads }).map((_, index) => (
              <div
                key={`pending-${index}`}
                className="w-full aspect-square rounded border-2 border-dashed border-primary/30 bg-primary/5 flex items-center justify-center"
              >
                <Loader2 className="h-5 w-5 text-primary/60 animate-spin" />
              </div>
            ))}

            {hasMultipleRows && !isImagesExpanded && (
              <button
                className="absolute bottom-1 right-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsImagesExpanded(true);
                }}
              >
                Show All ({totalImageCount}) <ChevronDown className="w-3 h-3" />
              </button>
            )}

            {isImagesExpanded && hasMultipleRows && (
              <button
                className="absolute bottom-1 right-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsImagesExpanded(false);
                }}
              >
                Hide <ChevronUp className="w-3 h-3" />
              </button>
            )}

            {/* Toggle to final video */}
            {finalVideo && !showVideo && (
              <button
                className="absolute bottom-1 left-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowVideoChange(true);
                }}
              >
                <Video className="w-3 h-3" />
                Final video
              </button>
            )}
          </div>
        </>
      )}

      {/* Select this shot button - shows when GenerationsPane is locked (mobile/tablet only) */}
      {showMobileSelect && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isSelectedForAddition ? "default" : "secondary"}
                size="sm"
                onClick={onSelectShotForAddition}
                className={`absolute bottom-1 left-1 h-7 px-2 text-xs shadow-sm z-10 transition-all duration-200 ${
                  isSelectedForAddition
                    ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                    : 'bg-background/90 hover:bg-background border'
                }`}
              >
                {isSelectedForAddition ? 'Selected' : 'Select'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isSelectedForAddition ? 'Images will be added to this shot' : 'Add images to this shot'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

interface ShotMetadataProps {
  shotName: string;
  displayName: string;
  isEditingName: boolean;
  editableName: string;
  onEditableNameChange: (value: string) => void;
  onSaveName: () => void;
  onCancelEdit: () => void;
}

const ShotMetadata: React.FC<ShotMetadataProps> = ({
  shotName,
  displayName,
  isEditingName,
  editableName,
  onEditableNameChange,
  onSaveName,
  onCancelEdit,
}) => {
  if (!isEditingName) {
    return (
      <h3 className="text-xl font-light group-hover:text-primary/80 transition-colors duration-300 flex-grow mr-2 truncate preserve-case">
        {displayName}
      </h3>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-grow" onClick={(e) => e.stopPropagation()}>
      <Input
        value={editableName}
        onChange={(e) => onEditableNameChange(e.target.value)}
        onBlur={onSaveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSaveName();
          if (e.key === 'Escape') onCancelEdit();
        }}
        className="!text-xl font-light h-auto py-0 px-2 border-0 bg-transparent shadow-none focus:ring-0 focus:border-0"
        autoFocus
        maxLength={30}
      />
      <Button variant="ghost" size="icon" onClick={(e) => {
        e.stopPropagation();
        onSaveName();
      }} className="h-9 w-9">
        <Check className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={(e) => {
        e.stopPropagation();
        onCancelEdit();
      }} className="h-9 w-9">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

interface ShotControlsProps {
  isTempShot: boolean;
  displayImagesCount: number;
  isEditingName: boolean;
  dragHandleProps?: {
    disabled?: boolean;
    [key: string]: unknown;
  };
  dragDisabledReason?: string;
  duplicateIsPending: boolean;
  onVideoClick: () => void;
  onEditName: (e?: React.MouseEvent) => void;
  onDuplicate: (e?: React.MouseEvent) => void;
  onDelete: (e?: React.MouseEvent) => void;
}

const ShotControls: React.FC<ShotControlsProps> = (props) => (
  <ActionButtonsRow {...props} />
);

interface ShotPreviewProps {
  displayImages: GenerationRow[];
  pendingUploads: number;
  imagesOverlay?: React.ReactNode;
  finalVideo?: ShotFinalVideo;
  showVideo: boolean;
  onShowVideoChange: (show: boolean) => void;
  projectAspectRatio?: string;
  dropLoadingState: 'idle' | 'loading' | 'success';
  onFinalVideoLightboxOpen: () => void;
  showMobileSelect: boolean;
  isSelectedForAddition: boolean;
  onSelectShotForAddition: (e: React.MouseEvent) => void;
}

const ShotPreview: React.FC<ShotPreviewProps> = (props) => (
  <ThumbnailMosaic {...props} />
);

// ---------------------------------------------------------------------------
// VideoShotDisplay - main orchestrator component
// ---------------------------------------------------------------------------

interface VideoShotDisplayProps {
  shot: Shot;
  onSelectShot: () => void;
  onDuplicateShot?: () => void;
  currentProjectId: string | null; // Needed for mutations
  dragHandleProps?: {
    disabled?: boolean;
    [key: string]: unknown; // For drag attributes and listeners
  };
  dragDisabledReason?: string;
  shouldLoadImages?: boolean;
  shotIndex?: number;
  projectAspectRatio?: string;
  isHighlighted?: boolean;
  pendingUploads?: number; // Number of images currently being uploaded
  imagesOverlay?: React.ReactNode; // Optional overlay to render over the images area
  dropLoadingState?: 'idle' | 'loading' | 'success'; // Loading state for drops with position
  dataTour?: string; // Data attribute for product tour
  finalVideo?: ShotFinalVideo; // Final video data for this shot (if available)
}

const SKIP_DELETE_CONFIRMATION_KEY = 'reigh-skip-delete-shot-confirmation';

const VideoShotDisplay: React.FC<VideoShotDisplayProps> = ({ shot, onSelectShot, onDuplicateShot, currentProjectId, dragHandleProps, dragDisabledReason, projectAspectRatio, isHighlighted = false, pendingUploads = 0, imagesOverlay, dropLoadingState = 'idle', dataTour, finalVideo }) => {
  // Check if this is a temp shot (optimistic duplicate waiting for real ID)
  const isTempShot = shot.id.startsWith('temp-');

  // Click ripple effect with button detection
  const { triggerRipple, rippleStyles, isRippleActive } = useClickRipple();

  const handleRippleTrigger = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const isButton = target.closest('button, [role="button"], input');
    if (!isButton) {
      triggerRipple(e);
    }
  };

  const updateShotNameMutation = useUpdateShotName();
  const deleteShotMutation = useDeleteShot();
  const duplicateShotMutation = useDuplicateShot();

  // Check if GenerationsPane is locked to show "Select this shot" button (mobile only)
  const { isGenerationsPaneLocked } = usePanes();
  const isMobile = useIsMobile();
  const shotAdditionSelection = useShotAdditionSelectionOptional();
  const {
    isEditingName,
    editableName,
    isDeleteDialogOpen,
    isVideoModalOpen,
    showVideo,
    isFinalVideoLightboxOpen,
    skipConfirmationChecked,
    isSelectedForAddition,
    startNameEdit,
    cancelNameEdit,
    setEditableName,
    finishNameEdit,
    setDeleteDialogOpen,
    setSkipConfirmationChecked,
    setVideoModalOpen,
    setShowVideo,
    setFinalVideoLightboxOpen,
    setSelectedForAddition,
  } = useVideoShotDisplayState({
    shotId: shot.id,
    shotName: shot.name,
    selectedShotId: shotAdditionSelection?.selectedShotId,
    isGenerationsPaneLocked,
  });

  // Build a minimal GenerationRow for the lightbox
  const finalVideoRow = useMemo((): GenerationRow | null => {
    if (!finalVideo) return null;
    return {
      id: finalVideo.id,
      location: finalVideo.location,
      thumbUrl: finalVideo.thumbnailUrl ?? undefined,
      type: 'video',
    };
  }, [finalVideo]);

  // Handle selecting this shot as the target for adding images in GenerationsPane
  const handleSelectShotForAddition = (e: React.MouseEvent) => {
    e.stopPropagation();
    shotAdditionSelection?.selectShotForAddition(shot.id);
    setSelectedForAddition(true);
  };

  const handleNameEditToggle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isEditingName) {
      cancelNameEdit(shot.name);
      return;
    }
    startNameEdit();
  };

  const handleSaveName = async () => {
    if (!currentProjectId) {
      toast.error('Cannot update shot: Project ID is missing.');
      return;
    }
    if (editableName.trim() === '') {
      toast.error('Shot name cannot be empty.');
      cancelNameEdit(shot.name);
      return;
    }
    if (editableName.trim() === shot.name) {
      finishNameEdit();
      return;
    }

    try {
      await updateShotNameMutation.mutateAsync(
        { shotId: shot.id, newName: editableName.trim(), projectId: currentProjectId }, // Pass projectId
        {
          onSuccess: () => {

            // Optimistic update already handles UI, or rely on query invalidation
          },
          onError: (error) => {
            toast.error(`Failed to update shot: ${error.message}`);
            cancelNameEdit(shot.name);
          },
        }
      );
    } finally {
      finishNameEdit();
    }
  };

  const handleDeleteShot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentProjectId) {
      toast.error('Cannot delete shot: Project ID is missing.');
      return;
    }

    // Check if user has opted to skip confirmation
    const skipConfirmation = localStorage.getItem(SKIP_DELETE_CONFIRMATION_KEY) === 'true';
    if (skipConfirmation) {
      // Delete immediately without confirmation
      await performDelete();
    } else {
      // Open the delete confirmation dialog
      setDeleteDialogOpen(true);
    }
  };

  const performDelete = async () => {
    if (!currentProjectId) {
      toast.error('Cannot delete shot: Project ID is missing.');
      return;
    }

    try {
      await deleteShotMutation.mutateAsync(
        { shotId: shot.id, projectId: currentProjectId },
        {
          onError: (error) => {
            toast.error(`Failed to delete shot: ${error.message}`);
          },
        }
      );
    } catch (error) {
      normalizeAndPresentError(error, { context: 'VideoShotDisplay', showToast: false });
    }
  };

  const handleConfirmDelete = async () => {
    // Save preference if checkbox was checked
    if (skipConfirmationChecked) {
      localStorage.setItem(SKIP_DELETE_CONFIRMATION_KEY, 'true');
    }

    setDeleteDialogOpen(false);
    await performDelete();
  };

  const handleDuplicateShot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentProjectId) {
      return;
    }

    try {
      onDuplicateShot?.();
      await duplicateShotMutation.mutateAsync({
        shotId: shot.id,
        projectId: currentProjectId,
      });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'VideoShotDisplay', toastTitle: 'Failed to duplicate shot' });
    }
  };

  // Thumbnail mosaic: show only positioned non-video images (images with valid timeline_frame)
  // Filter out videos AND unpositioned images (position removed = should not show in shot list)
  const displayImages = (shot.images || [])
    .filter(img => !isVideoGeneration(img) && isPositioned(img))
    .sort((a, b) => {
      const fa = a.timeline_frame ?? 0;
      const fb = b.timeline_frame ?? 0;
      return fa - fb;
    });

  // Handle click - block if temp shot
  const handleClick = () => {
    if (isTempShot) return;
    onSelectShot();
  };

  return (
    <>
      <div
        key={shot.id}
        className={`click-ripple group p-4 border rounded-lg bg-card/50 dark:bg-card/70 dark:border-border transition-all duration-700 relative flex flex-col ${isRippleActive ? 'ripple-active' : ''} ${isHighlighted ? 'ring-4 ring-blue-500 ring-opacity-75 shadow-[0_0_30px_rgba(59,130,246,0.6)] scale-105 animate-pulse' : ''} ${isTempShot ? 'opacity-70 cursor-wait animate-pulse' : 'hover:bg-card/80 hover:shadow-wes-hover hover:border-primary/30 hover:scale-105 cursor-pointer'}`}
        style={rippleStyles}
        onPointerDown={isTempShot ? undefined : handleRippleTrigger}
        onClick={handleClick}
        data-tour={dataTour}
      >
        <div className="flex justify-between items-start mb-3">
          <ShotMetadata
            shotName={shot.name}
            displayName={editableName || shot.name}
            isEditingName={isEditingName}
            editableName={editableName}
            onEditableNameChange={setEditableName}
            onSaveName={handleSaveName}
            onCancelEdit={() => {
              cancelNameEdit(shot.name);
            }}
          />
          <ShotControls
            isTempShot={isTempShot}
            displayImagesCount={displayImages.length}
            isEditingName={isEditingName}
            dragHandleProps={dragHandleProps}
            dragDisabledReason={dragDisabledReason}
            duplicateIsPending={duplicateShotMutation.isPending}
            onVideoClick={() => setVideoModalOpen(true)}
            onEditName={handleNameEditToggle}
            onDuplicate={handleDuplicateShot}
            onDelete={handleDeleteShot}
          />
        </div>

        {/* Thumbnail mosaic area - matches ShotGroup style */}
        <ShotPreview
          displayImages={displayImages}
          pendingUploads={pendingUploads}
          imagesOverlay={imagesOverlay}
          finalVideo={finalVideo}
          showVideo={showVideo}
          onShowVideoChange={setShowVideo}
          projectAspectRatio={projectAspectRatio}
          dropLoadingState={dropLoadingState}
          onFinalVideoLightboxOpen={() => setFinalVideoLightboxOpen(true)}
          showMobileSelect={isGenerationsPaneLocked && isMobile}
          isSelectedForAddition={isSelectedForAddition}
          onSelectShotForAddition={handleSelectShotForAddition}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete shot "<span className="preserve-case">{shot.name}</span>"? This will permanently remove the shot and all its associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-x-2 py-2">
            <Checkbox
              id="skip-confirmation"
              checked={skipConfirmationChecked}
              onCheckedChange={(checked) => setSkipConfirmationChecked(checked === true)}
            />
            <label
              htmlFor="skip-confirmation"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              Don't ask for confirmation
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteShotMutation.isPending}
            >
              {deleteShotMutation.isPending ? 'Deleting...' : 'Delete Shot'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Video Generation Modal - only mount when open to avoid 24+ useShotSettings hook instances */}
      {isVideoModalOpen && (
        <VideoGenerationModal
          isOpen={isVideoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          shot={shot}
        />
      )}

      {/* Lightbox for final video preview */}
      {isFinalVideoLightboxOpen && finalVideoRow && (
        <MediaLightbox
          media={finalVideoRow}
          onClose={() => setFinalVideoLightboxOpen(false)}
          showNavigation={false}
          showImageEditTools={false}
          showDownload={true}
          hasNext={false}
          hasPrevious={false}
          starred={false}
          shotId={shot.id}
          showVideoTrimEditor={true}
        />
      )}
    </>
  );
};

export default VideoShotDisplay;
