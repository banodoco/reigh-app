/**
 * Timeline - orchestrates timeline hooks and renders TimelineContainer + MediaLightbox.
 * Modular sub-components live in ./Timeline/hooks/, ./Timeline/utils/, ./Timeline/ (components).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { GenerationRow } from "@/types/shots";
import { toast } from "@/shared/components/ui/sonner";
import { handleError } from "@/shared/lib/errorHandler";
import { TOOL_IDS } from "@/shared/lib/toolConstants";
import MediaLightbox from "@/shared/components/MediaLightbox";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { TimelineEmptyState } from "./TimelineEmptyState";
import { transformForTimeline, type RawShotGeneration } from "@/shared/lib/generationTransformers";
import { isVideoGeneration } from "@/shared/lib/typeGuards";
import { useTaskFromUnifiedCache } from "@/shared/hooks/useTaskPrefetch";
import { useGetTask } from "@/shared/hooks/useTasks";
import { deriveInputImages } from "@/shared/components/MediaGallery/utils";
import type { SegmentSlot } from "../hooks/useSegmentOutputsForShot";

// Clear legacy timeline cache on import
import "@/utils/clearTimelineCache";

import { useAdjacentSegments } from "./Timeline/hooks/useAdjacentSegments";
import { usePositionManagement } from "./Timeline/hooks/usePositionManagement";
import { useLightbox } from "./Timeline/hooks/useLightbox";
import { useTimelineCore } from "@/shared/hooks/useTimelineCore";
import { useTimelinePositionUtils } from "../hooks/useTimelinePositionUtils";
import { quantizeGap } from "./Timeline/utils/time-utils";
import { useExternalGenerations } from "@/shared/components/ShotImageManager/hooks/useExternalGenerations";
import { useDerivedNavigation } from "../hooks/useDerivedNavigation";
import { usePendingImageOpen } from "@/shared/hooks/usePendingImageOpen";

import TimelineContainer from "./Timeline/TimelineContainer";
import { useEmptyStateDrop } from "./Timeline/hooks/useEmptyStateDrop";

// Main Timeline component props
interface TimelineProps {
  shotId: string;
  projectId?: string;
  frameSpacing: number;
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
  onFileDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  // Read-only mode - disables all interactions
  readOnly?: boolean;
  // Shared data props to prevent hook re-instantiation
  shotGenerations?: import("@/shared/hooks/useEnhancedShotPositions").ShotGeneration[];
  images?: GenerationRow[]; // Filtered images for display
  allGenerations?: GenerationRow[]; // ALL generations for lookups (unfiltered)
  // Pair-specific prompt editing
  onPairClick?: (pairIndex: number, pairData: {
    index: number;
    frames: number;
    startFrame: number;
    endFrame: number;
    startImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      timeline_frame: number;
      position: number;
    } | null;
    endImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      timeline_frame: number;
      position: number;
    } | null;
  }) => void;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  /** Callback to notify parent of drag state changes - used to suppress query refetches during drag */
  onDragStateChange?: (isDragging: boolean) => void;
  // Action handlers
  onImageDelete: (imageId: string) => void;
  onImageDuplicate?: (imageId: string, timeline_frame: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
  // Image upload handler for empty state
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  uploadProgress?: number;
  // Shot management for external generation viewing
  allShots?: Array<{ id: string; name: string }>;
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  // Multi-select: callback to create a new shot from selected images (returns new shot ID)
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;
  // Maximum frame limit for timeline gaps (77 with smooth continuations, 81 otherwise)
  maxFrameLimit?: number;
  // Shared output selection state (syncs FinalVideoSection with SegmentOutputStrip)
  selectedOutputId?: string | null;
  // Callback when segment frame count changes (for instant timeline updates)
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  // Segment slots for adjacent segment navigation in lightbox
  segmentSlots?: SegmentSlot[];
  // Loading state for segment slots (from consolidated hook in ShotImagesEditor)
  isSegmentsLoading?: boolean;
  // Pending task checker (from consolidated hook in ShotImagesEditor — includes optimistic state)
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  // Callback to open segment slot in unified lightbox
  onOpenSegmentSlot?: (pairIndex: number) => void;
  // Request to open lightbox for specific image (from segment constituent navigation)
  pendingImageToOpen?: string | null;
  // Variant ID to auto-select when opening from pendingImageToOpen (e.g. from TasksPane)
  pendingImageVariantId?: string | null;
  // Callback to clear the pending image request after handling
  onClearPendingImageToOpen?: () => void;
  // Helper to navigate with transition overlay (prevents flash when component type changes)
  navigateWithTransition?: (doNavigation: () => void) => void;
  // Position system: register trailing end frame updater from TimelineContainer
  onRegisterTrailingUpdater?: (fn: (endFrame: number) => void) => void;
}

const Timeline: React.FC<TimelineProps> = ({
  shotId,
  projectId,
  frameSpacing,
  onImageReorder,
  onFramePositionsChange,
  onFileDrop,
  onGenerationDrop,
  readOnly = false,
  // Shared data props
  shotGenerations: propShotGenerations,
  images: propImages,
  allGenerations: propAllGenerations,
  onPairClick,
  defaultPrompt,
  defaultNegativePrompt,
  onClearEnhancedPrompt,
  onDragStateChange,
  onImageDelete,
  onImageDuplicate,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  onImageUpload,
  isUploadingImage,
  uploadProgress = 0,
  // Shot management props
  allShots,
  selectedShotId,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  onCreateShot,
  onNewShotFromSelection,
  // Frame limit
  maxFrameLimit = 81,
  // Shared output selection (syncs FinalVideoSection with SegmentOutputStrip)
  selectedOutputId,
  // Instant timeline updates from MediaLightbox
  onSegmentFrameCountChange,
  // Segment slots for adjacent segment navigation
  segmentSlots,
  isSegmentsLoading,
  hasPendingTask,
  onOpenSegmentSlot,
  // Constituent image navigation support
  pendingImageToOpen,
  pendingImageVariantId,
  onClearPendingImageToOpen,
  // Lightbox transition support (prevents flash during navigation)
  navigateWithTransition,
  // Position system: trailing end frame updater registration
  onRegisterTrailingUpdater,
}) => {
  // Local state for shot selector dropdown (separate from the shot being viewed)
  const [lightboxSelectedShotId, setLightboxSelectedShotId] = useState<string | undefined>(selectedShotId || shotId);
  const [isDragInProgress, setIsDragInProgress] = useState<boolean>(false);

  // Notify parent when drag state changes - used to suppress query refetches
  useEffect(() => {
    onDragStateChange?.(isDragInProgress);
  }, [isDragInProgress, onDragStateChange]);

  // Use shared hook data if provided, otherwise create new instance (for backward compatibility)
  // NEW: When propAllGenerations is provided, use utility hook for position management with ALL data
  const coreHookData = useTimelineCore(!propAllGenerations ? shotId : null);
  const utilsHookData = useTimelinePositionUtils({
    shotId: propAllGenerations ? shotId : null,
    generations: propAllGenerations || [], // Use ALL generations for lookups, not filtered images
    projectId: projectId, // Pass projectId to invalidate ShotsPane cache
  });
  
  // Choose data source: props > utility hook (when allGenerations provided) > core hook
  const shotGenerations = propShotGenerations || (propAllGenerations ? utilsHookData.shotGenerations : coreHookData.positionedItems);
  const loadPositions = propAllGenerations ? utilsHookData.loadPositions : coreHookData.refetch;
  const actualPairPrompts = propAllGenerations ? utilsHookData.pairPrompts : coreHookData.pairPrompts;
  
  // Use provided images or generate from shotGenerations
  const images = React.useMemo(() => {
    let result: (GenerationRow & { timeline_frame?: number })[];
    
    if (propImages) {
      result = propImages;
    } else {
      result = shotGenerations
        .filter(shotGen => shotGen.generation)
        .map(shotGen => transformForTimeline(shotGen as unknown as RawShotGeneration));
    }
    
    // CRITICAL: Filter out videos - they should never appear on timeline
    // Uses canonical isVideoGeneration from typeGuards
    result = result.filter(img => !isVideoGeneration(img));
    
    // CRITICAL: Filter out unpositioned items (timeline_frame = null, undefined, or negative)
    // These should NOT be included in timeline drag calculations
    // Without this filter, unpositioned items get assigned frame 0 via ?? fallback
    // and incorrectly get batch-updated when other items are dragged
    // NOTE: -1 is used as a sentinel value in useTimelinePositionUtils for unpositioned items
    result = result.filter(img => img.timeline_frame !== null && img.timeline_frame !== undefined && img.timeline_frame >= 0);

    // Deterministic ordering: sort by timeline_frame, then by id as a stable tie-breaker.
    // This matches backend ordering used by update-shot-pair-prompts.
    result = result.sort((a, b) => {
      const frameDiff = (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0);
      if (frameDiff !== 0) return frameDiff;
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });

    return result;
  }, [shotGenerations, propImages]);

  // In readOnly mode, pass all generations so SegmentOutputStrip can derive
  // parent/child videos without database queries
  const readOnlyGenerations = readOnly ? propAllGenerations : undefined;

  // Position management hook
  const {
    displayPositions,
    setFramePositions,
  } = usePositionManagement({
    shotId,
    shotGenerations,
    frameSpacing,
    isDragInProgress,
    onFramePositionsChange,
  });

  // Ref for lightbox index setter (needed for external generations)
  const setLightboxIndexRef = useRef<(index: number) => void>(() => {});
  
  // External generations hook (same as ShotImageManager)
  const externalGens = useExternalGenerations({
    selectedShotId: shotId,
    optimisticOrder: images,
    images: images,
    setLightboxIndexRef
  });
  
  // Combine timeline images with external generations for navigation
  const currentImages = useMemo(() => {
    return [...images, ...externalGens.externalGenerations, ...externalGens.tempDerivedGenerations];
  }, [images, externalGens.externalGenerations, externalGens.tempDerivedGenerations]);

  // Lightbox hook  
  const isMobile = useIsMobile();
  const {
    lightboxIndex,
    autoEnterInpaint,
    goNext,
    goPrev,
    closeLightbox: hookCloseLightbox,
    openLightbox,
    openLightboxWithInpaint,
    handleDesktopDoubleClick,
    handleMobileTap,
    showNavigation,
    setLightboxIndex,
  } = useLightbox({ images: currentImages, shotId, isMobile });
  
  // Update the ref with the actual setter, using the raw state setter to avoid stale closures
  useEffect(() => {
    setLightboxIndexRef.current = setLightboxIndex;
  }, [setLightboxIndex]);
  
  // Wrap closeLightbox to clear external generations
  const closeLightbox = useCallback(() => {
    externalGens.setExternalGenerations([]);
    externalGens.setTempDerivedGenerations([]);
    externalGens.setDerivedNavContext(null);
    hookCloseLightbox();
  }, [hookCloseLightbox, externalGens]);

  // Handle pending image to open (from constituent image navigation / TasksPane deep-link)
  const capturedVariantIdRef = usePendingImageOpen({
    pendingImageToOpen,
    pendingImageVariantId,
    images: currentImages,
    openLightbox,
    onClear: onClearPendingImageToOpen,
  });

  // Add derived navigation mode support (navigates only through "Based on this" items when active)
  const { wrappedGoNext, wrappedGoPrev, hasNext: derivedHasNext, hasPrevious: derivedHasPrevious } = useDerivedNavigation({
    derivedNavContext: externalGens.derivedNavContext,
    lightboxIndex,
    currentImages,
    handleOpenExternalGeneration: externalGens.handleOpenExternalGeneration,
    goNext,
    goPrev,
    logPrefix: '[Timeline:DerivedNav]'
  });
  
  // Use combined images for current image and navigation
  const currentLightboxImage = lightboxIndex !== null ? currentImages[lightboxIndex] : null;
  const hasNext = derivedHasNext;
  const hasPrevious = derivedHasPrevious;

  const adjacentSegmentsData = useAdjacentSegments({
    segmentSlots,
    onOpenSegmentSlot,
    lightboxIndex,
    images,
    currentImages,
    closeLightbox,
    navigateWithTransition,
  });

  // Adapter: adds error toasting over the raw onAddToShot/onAddToShotWithoutPosition props
  const handleAddToShotAdapter = useCallback(async (
    targetShotId: string,
    generationId: string,
  ): Promise<boolean> => {
    if (!onAddToShot || !targetShotId) return false;
    try {
      await onAddToShot(targetShotId, generationId, undefined);
      return true;
    } catch (error) {
      handleError(error, { context: 'Timeline', toastTitle: 'Failed to add to shot' });
      return false;
    }
  }, [onAddToShot]);

  const handleAddToShotWithoutPositionAdapter = useCallback(async (
    targetShotId: string,
    generationId: string,
  ): Promise<boolean> => {
    if (!onAddToShotWithoutPosition || !targetShotId) return false;
    try {
      await onAddToShotWithoutPosition(targetShotId, generationId);
      return true;
    } catch (error) {
      handleError(error, { context: 'Timeline', toastTitle: 'Failed to add to shot' });
      return false;
    }
  }, [onAddToShotWithoutPosition]);

  // Fetch task ID mapping from unified cache
  // Uses generation_id (the actual generation record) not id (shot_generations entry)
  const { data: taskMapping } = useTaskFromUnifiedCache(
    currentLightboxImage?.generation_id || null
  );

  // Extract taskId and convert from Json to string
  const taskId = React.useMemo(() => {
    if (!taskMapping?.taskId) return undefined;
    return String(taskMapping.taskId);
  }, [taskMapping]);

  // Fetch full task details using the task ID (only enabled when we have a taskId)
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(
    taskId || ''  // Pass empty string if no taskId, hook will be disabled via enabled: !!taskId
  );

  // Derive input images from task metadata
  const inputImages = React.useMemo(() => {
    if (!task) return [];
    return deriveInputImages(task);
  }, [task]);

  // Preload next/previous images when lightbox is open for faster navigation
  useEffect(() => {
    if (!currentLightboxImage) return;
    
    // Preload next image
    if (hasNext && lightboxIndex !== null && lightboxIndex + 1 < images.length) {
      const nextImage = images[lightboxIndex + 1];
      if (nextImage?.imageUrl) {
        const img = new window.Image();
        img.src = nextImage.imageUrl;
      }
    }
    
    // Preload previous image
    if (hasPrevious && lightboxIndex !== null && lightboxIndex > 0) {
      const prevImage = images[lightboxIndex - 1];
      if (prevImage?.imageUrl) {
        const img = new window.Image();
        img.src = prevImage.imageUrl;
      }
    }
  }, [currentLightboxImage, lightboxIndex, images, hasNext, hasPrevious]);

  // Close lightbox if current image no longer exists (e.g., deleted)
  useEffect(() => {
    if (lightboxIndex !== null && !currentLightboxImage) {
      closeLightbox();
    }
  }, [lightboxIndex, currentLightboxImage, closeLightbox]);

  // Listen for star updates and refetch shot data
  useEffect(() => {
    const handleStarUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { shotId: updatedShotId } = customEvent.detail || {};
      
      // Only refetch if this event is for our current shot
      if (updatedShotId === shotId) {
        loadPositions?.({ silent: true, reason: 'shot_change' });
      }
    };

    window.addEventListener('generation-star-updated', handleStarUpdated);
    return () => window.removeEventListener('generation-star-updated', handleStarUpdated);
  }, [shotId, loadPositions]);

  // Handle resetting frames to evenly spaced intervals
  // Gap values are quantized to 4N+1 format for Wan model compatibility
  const handleResetFrames = useCallback(async (gap: number) => {
    // Quantize the gap to 4N+1 format (5, 9, 13, 17, 21, 25, 29, 33, ...)
    const quantizedGap = quantizeGap(gap, 5);
    
    // Then set the positions with the specified quantized gap
    const newPositions = new Map<string, number>();
    images.forEach((image, index) => {
      // Use id (shot_generations.id) for position mapping - unique per entry
      // First image at 0, subsequent images at quantized intervals
      newPositions.set(image.id, index * quantizedGap);
    });

    await setFramePositions(newPositions);
  }, [images, setFramePositions]);

  // Check if timeline is empty
  const hasNoImages = images.length === 0;

  // Empty-state drag and drop (supports both files and internal generations)
  const {
    isDragOver,
    dragType,
    handleEmptyStateDragEnter,
    handleEmptyStateDragOver,
    handleEmptyStateDragLeave,
    handleEmptyStateDrop,
  } = useEmptyStateDrop({
    onFileDrop,
    onGenerationDrop,
    onImageUpload,
  });

  // Derive lightbox shot state for the current image (replaces inline IIFE in JSX)
  const lightboxShotState = useMemo(() => {
    if (lightboxIndex === null || !currentLightboxImage) return null;
    const isExternalGen = lightboxIndex >= images.length;
    const imageWithAssociations = currentLightboxImage as GenerationRow & {
      shot_id?: string;
      all_shot_associations?: Array<{ shot_id: string; position: number | null; timeline_frame?: number | null }>;
    };
    const isInSelectedShot = !isExternalGen && lightboxSelectedShotId && (
      shotId === lightboxSelectedShotId ||
      imageWithAssociations.shot_id === lightboxSelectedShotId ||
      (Array.isArray(imageWithAssociations.all_shot_associations) &&
       imageWithAssociations.all_shot_associations.some((assoc) => assoc.shot_id === lightboxSelectedShotId))
    );
    return {
      isExternalGen,
      positionedInSelectedShot: isInSelectedShot
        ? currentLightboxImage.timeline_frame !== null && currentLightboxImage.timeline_frame !== undefined
        : undefined,
      associatedWithoutPositionInSelectedShot: isInSelectedShot
        ? currentLightboxImage.timeline_frame === null || currentLightboxImage.timeline_frame === undefined
        : undefined,
    };
  }, [lightboxIndex, currentLightboxImage, images.length, lightboxSelectedShotId, shotId]);

  return (
    <div className="w-full overflow-x-hidden relative" data-tour="timeline">
      {/* Blur and overlay when no images */}
      {hasNoImages && (
        <TimelineEmptyState
          isDragOver={isDragOver}
          dragType={dragType}
          shotId={shotId}
          onImageUpload={onImageUpload}
          isUploadingImage={isUploadingImage}
          onDragEnter={handleEmptyStateDragEnter}
          onDragOver={handleEmptyStateDragOver}
          onDragLeave={handleEmptyStateDragLeave}
          onDrop={handleEmptyStateDrop}
          hasDropHandler={!!(onFileDrop || onGenerationDrop)}
        />
      )}
      
      {/* Timeline Container - includes both controls and timeline */}
      <TimelineContainer
        shotId={shotId}
        projectId={projectId}
        images={images}
        framePositions={displayPositions}
        onResetFrames={handleResetFrames}
        setFramePositions={setFramePositions}
        onImageReorder={onImageReorder}
        onFileDrop={onFileDrop}
        onGenerationDrop={onGenerationDrop}
        setIsDragInProgress={setIsDragInProgress}
        onPairClick={onPairClick}
        pairPrompts={actualPairPrompts}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
        onClearEnhancedPrompt={readOnly ? undefined : onClearEnhancedPrompt}
        onImageDelete={onImageDelete}
        onImageDuplicate={onImageDuplicate}
        duplicatingImageId={duplicatingImageId}
        duplicateSuccessImageId={duplicateSuccessImageId}
        projectAspectRatio={projectAspectRatio}
        handleDesktopDoubleClick={handleDesktopDoubleClick}
        handleMobileTap={handleMobileTap}
        handleInpaintClick={openLightboxWithInpaint}
        hasNoImages={hasNoImages}
        readOnly={readOnly}
        isUploadingImage={isUploadingImage}
        uploadProgress={uploadProgress}
        maxFrameLimit={maxFrameLimit}
        selectedOutputId={selectedOutputId}
        onSegmentFrameCountChange={onSegmentFrameCountChange}
        segmentSlots={segmentSlots}
        isSegmentsLoading={isSegmentsLoading}
        hasPendingTask={hasPendingTask}
        videoOutputs={readOnlyGenerations}
        onNewShotFromSelection={onNewShotFromSelection}
        onShotChange={onShotChange}
        onRegisterTrailingUpdater={onRegisterTrailingUpdater}
      />

      {/* Lightbox */}
      {lightboxShotState && currentLightboxImage && (
        <MediaLightbox
          media={currentLightboxImage}
          shotId={shotId}
          starred={currentLightboxImage.starred ?? false}
          autoEnterInpaint={autoEnterInpaint}
          toolTypeOverride={TOOL_IDS.TRAVEL_BETWEEN_IMAGES}
          initialVariantId={capturedVariantIdRef.current ?? undefined}
          onClose={() => {
            capturedVariantIdRef.current = null;
            closeLightbox();
            setLightboxSelectedShotId(selectedShotId || shotId);
          }}
          onNext={images.length > 1 ? wrappedGoNext : undefined}
          onPrevious={images.length > 1 ? wrappedGoPrev : undefined}
          readOnly={readOnly}
          onDelete={!readOnly ? (_mediaId: string) => {
            onImageDelete(currentLightboxImage.id);
          } : undefined}
          showNavigation={showNavigation}
          showMagicEdit={true}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          onNavigateToGeneration={(generationId: string) => {
            const index = currentImages.findIndex((img) => img.id === generationId);
            if (index !== -1) {
              openLightbox(index);
            } else {
              toast.info('This generation is not currently loaded');
            }
          }}
          onOpenExternalGeneration={externalGens.handleOpenExternalGeneration}
          onMagicEdit={(_imageUrl, _prompt, _numImages) => {
            // TODO: Implement magic edit generation
          }}
          showTaskDetails={true}
          taskDetailsData={{
            task,
            isLoading: isLoadingTask,
            error: taskError,
            inputImages,
            taskId: task?.id || null,
            onClose: closeLightbox
          }}
          allShots={allShots}
          selectedShotId={lightboxShotState.isExternalGen ? externalGens.externalGenLightboxSelectedShot : lightboxSelectedShotId}
          onShotChange={lightboxShotState.isExternalGen ? (shotId) => {
            externalGens.setExternalGenLightboxSelectedShot(shotId);
          } : (shotId) => {
            setLightboxSelectedShotId(shotId);
            onShotChange?.(shotId);
          }}
          onAddToShot={lightboxShotState.isExternalGen ? externalGens.handleExternalGenAddToShot : (onAddToShot ? handleAddToShotAdapter : undefined)}
          onAddToShotWithoutPosition={lightboxShotState.isExternalGen ? externalGens.handleExternalGenAddToShotWithoutPosition : (onAddToShotWithoutPosition ? handleAddToShotWithoutPositionAdapter : undefined)}
          onCreateShot={onCreateShot}
          positionedInSelectedShot={lightboxShotState.positionedInSelectedShot}
          associatedWithoutPositionInSelectedShot={lightboxShotState.associatedWithoutPositionInSelectedShot}
          adjacentSegments={!lightboxShotState.isExternalGen ? adjacentSegmentsData : undefined}
        />
      )}
    </div>
  );
};

// 🎯 PERF FIX: Wrap in React.memo to prevent re-renders when props haven't changed
// Timeline receives many callback props from ShotImagesEditor that are now stable (via refs)
export default React.memo(Timeline);
