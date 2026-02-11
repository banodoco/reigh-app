import React, { useCallback, useMemo, useRef } from "react";
import { Eye, Share2, Copy, Loader2, Check } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/shared/components/ui/tooltip";
import { DraggableImage } from "@/shared/components/DraggableImage";
import { TimeStamp } from "@/shared/components/TimeStamp";
import type { Shot } from "@/types/shots";
import type { MediaGalleryItemProps } from "./MediaGalleryItem/types";
import { ActionButtons, InfoTooltip, VideoContent, ImageContent, ShotActions } from "./MediaGalleryItem/components";
import { useShotActions, useImageLoading, useMediaGalleryItemState, useStableMediaUrls, useShotPositionChecks } from "./MediaGalleryItem/hooks";
import { setGenerationDragData, createDragPreview } from '@/shared/lib/dragDrop';
import { cn } from "@/shared/lib/utils";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useProject } from "@/shared/contexts/ProjectContext";
import { TOOL_IDS } from '@/shared/lib/toolConstants';
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { useQuickShotCreate } from "@/shared/hooks/useQuickShotCreate";
import { parseRatio } from "@/shared/lib/aspectRatios";
import { useTaskFromUnifiedCache, usePrefetchTaskData } from "@/shared/hooks/useTaskPrefetch";
import { useTaskType } from "@/shared/hooks/useTaskType";
import { useGetTask } from "@/shared/hooks/useTasks";
import { useShareGeneration } from "@/shared/hooks/useShareGeneration";
import { deriveInputImages } from "./MediaGallery/utils";
import { isImageEditTaskType } from "@/shared/utils/taskParamsUtils";
import { VariantBadge } from "@/shared/components/VariantBadge";
import { useMarkVariantViewed } from "@/shared/hooks/useMarkVariantViewed";
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

export const MediaGalleryItem: React.FC<MediaGalleryItemProps> = ({
  image,
  index,
  isDeleting,
  onDelete,
  onOpenLightbox,
  onAddToLastShot,
  onAddToLastShotWithoutPosition,
  onToggleStar,
  selectedShotIdLocal,
  simplifiedShotOptions,
  showTickForImageId,
  onShowTick,
  onShowSecondaryTick,
  optimisticUnpositionedIds,
  optimisticPositionedIds,
  onOptimisticUnpositioned,
  onOptimisticPositioned,
  addingToShotImageId,
  setAddingToShotImageId,
  addingToShotWithoutPositionImageId,
  setAddingToShotWithoutPositionImageId,
  isMobile,
  mobileActiveImageId,
  mobilePopoverOpenImageId,
  onMobileTap,
  setSelectedShotIdLocal,
  setLastAffectedShotId,
  toggleStarMutation,
  shouldLoad = true,
  isPriority = false,
  onCreateShot,
  currentViewingShotId,
  projectAspectRatio,
  showShare = true,
  showDelete = true,
  showEdit = true,
  showStar = true,
  showAddToShot = true,
  enableSingleClick = false,
  onImageClick,
  videosAsThumbnails = false,
  dataTour,
  onImageLoaded,
}) => {
  // Consolidated local UI state management
  const {
    localStarred,
    setLocalStarred,
    isTogglingStar,
    setIsTogglingStar,
    isInfoOpen,
    setIsInfoOpen,
    isShotSelectorOpen,
    setIsShotSelectorOpen,
    isDragging,
    setIsDragging,
    isCreateShotModalOpen,
    setIsCreateShotModalOpen,
    isCreatingShot,
    handleCreateShot,
  } = useMediaGalleryItemState({ image, onCreateShot });

  // Prefetch task data on hover for faster lightbox loading
  const prefetchTaskData = usePrefetchTaskData();

  // Fetch task data for video tasks to show proper details
  // Try to get task ID from metadata first (more efficient), fallback to cache query
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager images, id is shot_generations.id but generation_id is the actual generation ID
  const taskIdFromMetadata = image.metadata?.taskId as string | undefined;
  const actualGenerationId = getGenerationId(image);
  const { data: taskIdMapping } = useTaskFromUnifiedCache(actualGenerationId);
  const taskIdFromCache = typeof taskIdMapping?.taskId === 'string' ? taskIdMapping.taskId : null;
  const taskId: string | null = taskIdFromMetadata || taskIdFromCache;

  const { data: taskData } = useGetTask(taskId);

  // Prefetch task data on mouse enter (desktop only)
  const handleMouseEnter = useCallback(() => {
    if (!isMobile && actualGenerationId) {
      prefetchTaskData(actualGenerationId);
    }
  }, [isMobile, actualGenerationId, prefetchTaskData]);
  
  // Derive input images for guidance tooltip
  const inputImages = useMemo(() => deriveInputImages(taskData), [taskData]);
  
  // Only use the actual task type name (like 'wan_2_2_t2i'), not tool_type (like 'image-generation')
  // tool_type and task type name are different concepts - tool_type is a broader category
  const taskType = taskData?.taskType;
  const { data: taskTypeInfo } = useTaskType(taskType || null);
  
  // Determine if this should show task details (GenerationDetails)
  // Use content_type from task_types table. Fallback to legacy tool_type for video travel.
  const isVideoTask = taskTypeInfo?.content_type === 'video' ||
    (!taskTypeInfo && image.metadata?.tool_type === TOOL_IDS.TRAVEL_BETWEEN_IMAGES);
  const isImageEditTask = isImageEditTaskType(taskType || undefined);
  const shouldShowTaskDetails = (!!taskData) && (isVideoTask || isImageEditTask);

  // Share functionality
  const { handleShare, isCreatingShare, shareCopied, shareSlug } = useShareGeneration(image.id, taskId);

  const { selectedProjectId } = useProject();
  const { markAllViewed } = useMarkVariantViewed();

  // Callback to mark all variants for this generation as viewed
  const handleMarkAllVariantsViewed = useCallback(() => {
    if (actualGenerationId) {
      markAllViewed(actualGenerationId);
    }
  }, [actualGenerationId, markAllViewed]);

  const { navigateToShot } = useShotNavigation();
  const { setLastAffectedShotId: updateLastAffectedShotId } = useLastAffectedShot();
  
  // Use consolidated hook for quick shot creation
  const {
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  } = useQuickShotCreate({
    generationId: image.id,
    generationPreview: {
      imageUrl: image.url,
      thumbUrl: image.thumbUrl,
      type: image.type,
      location: image.location,
    },
    shots: simplifiedShotOptions,
    onShotChange: (shotId) => {
      updateLastAffectedShotId(shotId);
      setSelectedShotIdLocal(shotId);
    },
    onLoadingStart: () => setAddingToShotImageId(image.id),
    onLoadingEnd: () => setAddingToShotImageId(null),
  });
  // Stable media URLs (handles progressive loading + token-rotation stability)
  const {
    isVideoContent,
    displayUrl,
    stableDisplayUrl,
    stableVideoUrl,
    progressiveEnabled,
    isThumbShowing,
    isFullLoaded,
    progressiveRef,
  } = useStableMediaUrls({ image, isPriority });

  // Image loading state management (error handling, retry logic, loading state)
  const {
    actualSrc,
    actualDisplayUrl,
    imageLoaded,
    imageLoadError,
    handleImageLoad,
    handleImageError,
    retryImageLoad,
    setImageLoading,
  } = useImageLoading({
    image,
    displayUrl,
    shouldLoad,
    onImageLoaded,
  });

  // Shot actions with retry logic
  const { addToShot, addToShotWithoutPosition } = useShotActions({
    imageId: image.id,
    imageUrl: image.url,
    thumbUrl: image.thumbUrl,
    displayUrl,
    selectedShotId: selectedShotIdLocal,
    isMobile,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    setAddingToShotImageId,
    setAddingToShotWithoutPositionImageId,
  });

  // Check if we should show metadata details (only when tooltip/popover is open for performance)
  const shouldShowMetadata = useMemo(() => {
    if (!image.metadata) return false;
    
    // On mobile, only show when popover is open; on desktop, only when tooltip might be shown
    return isMobile 
      ? (mobilePopoverOpenImageId === image.id)
      : isInfoOpen;
  }, [image.metadata, isMobile, mobilePopoverOpenImageId, image.id, isInfoOpen]);
  const isCurrentDeleting = isDeleting;
  const imageKey = image.id || `image-${actualDisplayUrl}-${index}`;


  // Placeholder check
  const isPlaceholder = !image.id && actualDisplayUrl === "/placeholder.svg";
  const currentTargetShotName = selectedShotIdLocal ? simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name : undefined;
  
  // Shot position state (positioned, associated-without-position, viewing selected shot)
  const {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    shouldShowAddWithoutPositionButton,
  } = useShotPositionChecks({
    image,
    selectedShotIdLocal,
    currentViewingShotId,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onAddToLastShotWithoutPosition,
    showTickForImageId,
    addingToShotImageId,
  });
  
  let aspectRatioPadding = '100%';
  const minHeight = '120px'; // Minimum height for very small images
  
  // Always use project aspect ratio for consistent gallery display
  if (projectAspectRatio) {
    const ratio = parseRatio(projectAspectRatio);
    if (!isNaN(ratio)) {
      const calculatedPadding = (1 / ratio) * 100; // height/width * 100
      // Ensure reasonable aspect ratio bounds
      const minPadding = 60; // Minimum 60% height (for very wide images)
      const maxPadding = 200; // Maximum 200% height (for very tall images)
      aspectRatioPadding = `${Math.min(Math.max(calculatedPadding, minPadding), maxPadding)}%`;
    }
  } else {
    // Fallback: try to get dimensions from image metadata if no project aspect ratio
    let width = image.metadata?.width;
    let height = image.metadata?.height;
    
    // If not found, try to extract from resolution string
    if (!width || !height) {
      const resolution = image.metadata?.originalParams?.orchestrator_details?.resolution;
      if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
        const [w, h] = resolution.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h)) {
          width = w;
          height = h;
        }
      }
    }
    
    if (width && height) {
      const calculatedPadding = (height / width) * 100;
      // Ensure reasonable aspect ratio bounds
      const minPadding = 60; // Minimum 60% height (for very wide images)
      const maxPadding = 200; // Maximum 200% height (for very tall images)
      aspectRatioPadding = `${Math.min(Math.max(calculatedPadding, minPadding), maxPadding)}%`;
    }
  }

  // If it's a placeholder, render simplified placeholder item
  if (isPlaceholder) {
    return (
      <div 
        key={imageKey}
        className="border rounded-lg overflow-hidden bg-muted animate-pulse"
      >
        <div style={{ paddingBottom: aspectRatioPadding }} className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <Eye className="h-12 w-12 text-muted-foreground opacity-30" />
          </div>
        </div>
      </div>
    );
  }

  // Handle drag start for dropping onto timeline
  const handleDragStart = useCallback((e: React.DragEvent) => {
    // Only enable drag on desktop
    if (isMobile) {
      e.preventDefault();
      return;
    }
    
    setIsDragging(true);
    
    // Use shared utility to set drag data
    setGenerationDragData(e, {
      generationId: image.id,
      imageUrl: image.url,
      thumbUrl: image.thumbUrl,
      metadata: image.metadata
    });
    
    // Create drag preview and clean up after brief moment
    const cleanup = createDragPreview(e);
    if (cleanup) {
      setTimeout(cleanup, 0);
    }
  }, [image, isMobile]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Track touch start position to detect scrolling vs tapping
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Helper to determine if interaction was a tap or a scroll/drag
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartPosRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  // Handle click/tap processing with scroll detection
  const handleInteraction = (e: React.TouchEvent | React.MouseEvent) => {
    // Check if touch/click originated from inside a button using composedPath (more reliable on touch devices)
    const path = (e.nativeEvent as Event)?.composedPath?.() as HTMLElement[] | undefined;
    const isInsideButton = path
      ? path.some((el) => (el as HTMLElement)?.tagName === 'BUTTON' || (el as HTMLElement)?.closest?.('button'))
      : !!(e.target as HTMLElement).closest('button');

    // Only allow button interaction if this item is already active (selected)
    // First tap should select the item, not trigger button actions
    const isItemActive = mobileActiveImageId === image.id;

    if (isInsideButton && isItemActive) {
      return;
    }

    // For touchend events, only proceed if touchstart happened on this element
    // This prevents clicks from firing when a dropdown (like ShotSelector) closes
    // and the touchend lands on the element behind it
    if (e.type === 'touchend') {
      if (!touchStartPosRef.current) {
        return;
      }

      const touch = (e as React.TouchEvent).changedTouches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

      // Reset touch start position
      touchStartPosRef.current = null;

      // If moved more than 10px, treat as scroll/drag and ignore click
      if (deltaX > 10 || deltaY > 10) {
        return;
      }
    }

    // Proceed with click logic
    e.preventDefault();

    if (enableSingleClick && onImageClick) {
      onImageClick(image);
    } else {
      onMobileTap(image);
    }
  };

  // Conditionally wrap with DraggableImage only on desktop to avoid interfering with mobile scrolling
  const imageContent = (
    <div
        className={`border rounded-lg overflow-hidden hover:shadow-md transition-all duration-200 relative group bg-card ${
          isDragging ? 'opacity-50 scale-75' : ''
        } ${!isMobile ? 'cursor-grab active:cursor-grabbing' : ''}`}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMouseEnter={handleMouseEnter}
        data-tour={dataTour}
        onClick={enableSingleClick || !isMobile ? (e) => {
          if (onImageClick) {
            e.stopPropagation();
            onImageClick(image);
          } else {
            // Fallback to standard behavior if onImageClick not provided but enabled
            onOpenLightbox(image);
          }
        } : undefined}
        // Mobile touch handlers on outer div as fallback for iPad Safari
        // This ensures touch events are captured even if inner elements don't receive them
        onTouchStart={isMobile && !enableSingleClick && !isVideoContent ? handleTouchStart : undefined}
        onTouchEnd={isMobile && !enableSingleClick && !isVideoContent ? handleInteraction : undefined}
    >
      <div className="relative w-full">
      <div
        style={{
          paddingBottom: aspectRatioPadding,
          minHeight: minHeight
        }}
        className="relative bg-muted/50"
      >
          {isVideoContent ? (
            <VideoContent
              image={image}
              stableDisplayUrl={stableDisplayUrl}
              stableVideoUrl={stableVideoUrl}
              actualSrc={actualSrc}
              shouldLoad={shouldLoad}
              imageLoaded={imageLoaded}
              videosAsThumbnails={videosAsThumbnails}
              isMobile={isMobile}
              enableSingleClick={enableSingleClick}
              onOpenLightbox={onOpenLightbox}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleInteraction}
              onVideoError={handleImageError}
              onLoadStart={() => setImageLoading(true)}
              onLoadedData={handleImageLoad}
            />
          ) : (
            <ImageContent
              image={image}
              index={index}
              actualSrc={actualSrc}
              imageLoaded={imageLoaded}
              imageLoadError={imageLoadError}
              progressiveEnabled={progressiveEnabled}
              isThumbShowing={isThumbShowing}
              isFullLoaded={isFullLoaded}
              progressiveRef={progressiveRef}
              isMobile={isMobile}
              onOpenLightbox={onOpenLightbox}
              onImageLoad={handleImageLoad}
              onImageError={handleImageError}
              onRetry={retryImageLoad}
              setImageLoading={setImageLoading}
            />
          )}
      </div>
      </div>
      
      {/* Action buttons and UI elements */}
      {image.id && ( // Ensure image has ID for actions
      <>
          {/* Shot Name Badge / Variant Name for Videos - Top Left */}
          {isVideoContent && (image.name || (image.shot_id && simplifiedShotOptions.length > 0) || (image.derivedCount && image.derivedCount > 0)) && (
          <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1 z-20">
              {/* Variant Name */}
              {image.name && (
                <div className="bg-black/50 text-white text-xs sm:text-sm px-2 py-0.5 rounded-md mb-1 font-medium backdrop-blur-sm preserve-case">
                  {image.name}
                </div>
              )}
              
              {/* "X new" badge + Variant Count - show below variant name */}
              <VariantBadge
                derivedCount={image.derivedCount}
                unviewedVariantCount={image.unviewedVariantCount}
                hasUnviewedVariants={image.hasUnviewedVariants}
                variant="inline"
                size="md"
                onMarkAllViewed={handleMarkAllVariantsViewed}
              />

              {/* Shot Navigation Button - only shows on hover */}
              {image.shot_id && simplifiedShotOptions.length > 0 && (
                <button
                    className="px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 text-white/90 hover:text-white text-xs font-normal transition-all backdrop-blur-sm flex items-center gap-1.5 preserve-case opacity-0 group-hover:opacity-100"
                    onClick={() => {
                        const targetShot = simplifiedShotOptions.find(s => s.id === image.shot_id);
                        if (targetShot) {
                            navigateToShot(targetShot as Shot, { scrollToTop: true });
                        }
                    }}
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    {simplifiedShotOptions.find(s => s.id === image.shot_id)?.name || 'Unknown Shot'}
                </button>
              )}
          </div>
          )}

          {/* Add to Shot UI - Top Left (for non-video content) */}
          {showAddToShot && simplifiedShotOptions.length > 0 && onAddToLastShot && (
            <ShotActions
              image={image}
              isMobile={isMobile}
              isVideoContent={isVideoContent}
              selectedShotId={selectedShotIdLocal}
              simplifiedShotOptions={simplifiedShotOptions}
              isShotSelectorOpen={isShotSelectorOpen}
              setIsShotSelectorOpen={setIsShotSelectorOpen}
              setSelectedShotIdLocal={setSelectedShotIdLocal}
              setLastAffectedShotId={setLastAffectedShotId}
              addingToShotImageId={addingToShotImageId}
              addingToShotWithoutPositionImageId={addingToShotWithoutPositionImageId}
              showTickForImageId={showTickForImageId}
              isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
              isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
              shouldShowAddWithoutPositionButton={shouldShowAddWithoutPositionButton}
              currentTargetShotName={currentTargetShotName}
              quickCreateSuccess={quickCreateSuccess}
              onCreateShot={onCreateShot}
              handleQuickCreateAndAdd={handleQuickCreateAndAdd}
              handleQuickCreateSuccess={handleQuickCreateSuccess}
              onNavigateToShot={(shot) => navigateToShot(shot as { id: string; name: string }, { scrollToTop: true })}
              onAddToShot={addToShot}
              onAddToShotWithoutPosition={addToShotWithoutPosition}
            />
          )}

          {/* Timestamp - Top Right (hides on hover for images, stays visible for videos) */}
          <TimeStamp
            createdAt={image.createdAt}
            position="top-right"
            showOnHover={false}
            hideOnHover={!isVideoContent}
            className="z-30"
          />

          {/* Action buttons - Top Right (Info & Variants) - below shot selector on mobile */}
          <div className={cn(
            "absolute right-1.5 flex flex-col items-end gap-1.5 z-20",
            isMobile ? "top-12" : "top-1.5 mt-8"
          )}>
              {/* Info Button + Variant Count + NEW badge Row (for non-video content) */}
              <div className="flex flex-row items-center gap-1.5">
                <InfoTooltip
                image={image}
                taskData={taskData}
                inputImages={inputImages}
                shouldShowMetadata={shouldShowMetadata}
                shouldShowTaskDetails={shouldShowTaskDetails}
                setIsInfoOpen={setIsInfoOpen}
                isMobile={isMobile}
              />

                {/* "X new" badge + Variant Count - positioned to the right of Info button */}
                {!isVideoContent && (
                  <VariantBadge
                    derivedCount={image.derivedCount}
                    unviewedVariantCount={image.unviewedVariantCount}
                    hasUnviewedVariants={image.hasUnviewedVariants}
                    variant="inline"
                    size="md"
                    tooltipSide="right"
                    onMarkAllViewed={handleMarkAllVariantsViewed}
                  />
                )}
              </div>

              {/* Share Button */}
              {showShare && taskId && (
                <TooltipProvider>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleShare}
                        disabled={isCreatingShare}
                        className={`h-7 w-7 p-0 rounded-full text-white transition-all opacity-0 group-hover:opacity-100 ${
                          shareCopied
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-black/50 hover:bg-black/70'
                        }`}
                      >
                        {isCreatingShare ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : shareCopied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : shareSlug ? (
                          <Copy className="h-3.5 w-3.5" />
                        ) : (
                          <Share2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{shareCopied ? 'Link copied!' : shareSlug ? 'Copy share link' : 'Share this generation'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
          </div>

          {/* Bottom Buttons - Star (left), Edit (center), Delete (right) */}
          <ActionButtons
            image={image}
            localStarred={localStarred}
            isTogglingStar={isTogglingStar}
            isDeleting={isCurrentDeleting}
            showStar={showStar}
            showEdit={showEdit}
            showDelete={showDelete}
            onToggleStar={onToggleStar}
            toggleStarMutation={toggleStarMutation}
            setIsTogglingStar={setIsTogglingStar}
            setLocalStarred={setLocalStarred}
            onOpenLightbox={onOpenLightbox}
            onDelete={onDelete}
          />
      </>)
      }
    </div>
  );

  // On mobile, drag is already disabled by using the non-draggable branch.
  return isMobile ? (
    <React.Fragment key={imageKey}>
      {imageContent}
      {onCreateShot && (
        <CreateShotModal
          isOpen={isCreateShotModalOpen}
          onClose={() => setIsCreateShotModalOpen(false)}
          onSubmit={handleCreateShot}
          isLoading={isCreatingShot}
          projectId={selectedProjectId}
        />
      )}
    </React.Fragment>
  ) : (
    <DraggableImage key={`draggable-${imageKey}`} image={image} onDoubleClick={() => onOpenLightbox(image)}>
      {imageContent}
      {onCreateShot && (
        <CreateShotModal
          isOpen={isCreateShotModalOpen}
          onClose={() => setIsCreateShotModalOpen(false)}
          onSubmit={handleCreateShot}
          isLoading={isCreatingShot}
          projectId={selectedProjectId}
        />
      )}
    </DraggableImage>
  );
}; 