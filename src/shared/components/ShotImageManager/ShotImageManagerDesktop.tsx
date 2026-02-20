import React, { useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { ShotImageManagerProps } from './types';
import { GRID_COLS_CLASSES } from './constants';
import { ImageGrid } from './components/ImageGrid';
import { SelectionActionBar } from './components/SelectionActionBar';
import { DeleteConfirmationDialog } from './components/DeleteConfirmationDialog';
import { MultiImagePreview, SingleImagePreview } from '../ImageDragPreview';
import BatchDropZone from '../BatchDropZone';
import MediaLightbox from '../MediaLightbox';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useState, useEffect, useCallback } from 'react';
import { useTaskDetails } from './hooks/useTaskDetails';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';
import type { SegmentSlot } from '@/shared/hooks/segments';
import { cn } from '@/shared/lib/utils';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';
import { getPreviewDimensions } from '@/shared/lib/aspectRatios';
import { usePrefetchTaskData } from '@/shared/hooks/useTaskPrefetch';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { usePendingImageOpen } from '@/shared/hooks/usePendingImageOpen';
import { useAdjacentSegmentsData } from './hooks/useAdjacentSegmentsData';
import type { GenerationRow } from '@/types/shots';
import type { useSelection } from './hooks/useSelection';
import type { useDragAndDrop } from './hooks/useDragAndDrop';
import type { useLightbox } from './hooks/useLightbox';
import type { useBatchOperations } from './hooks/useBatchOperations';
import type { useOptimisticOrder } from './hooks/useOptimisticOrder';
import type { useExternalGenerations } from './hooks/useExternalGenerations';

interface ShotImageManagerDesktopProps extends ShotImageManagerProps {
  selection: ReturnType<typeof useSelection>;
  dragAndDrop: ReturnType<typeof useDragAndDrop>;
  lightbox: ReturnType<typeof useLightbox>;
  batchOps: ReturnType<typeof useBatchOperations>;
  optimistic: ReturnType<typeof useOptimisticOrder>;
  externalGens: ReturnType<typeof useExternalGenerations>;
  getFramePosition: (index: number) => number | undefined;
  lightboxSelectedShotId?: string;
  setLightboxSelectedShotId?: (shotId: string | undefined) => void;
  // Segment video output props
  segmentSlots?: SegmentSlot[];
  onSegmentClick?: (slotIndex: number) => void;
  /** Check if a pair_shot_generation_id has a pending task */
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  /** Delete a segment video */
  onSegmentDelete?: (generationId: string) => void;
  /** ID of segment currently being deleted */
  deletingSegmentId?: string | null;
  /** Request to open lightbox for specific image (from segment constituent navigation) */
  pendingImageToOpen?: string | null;
  /** Variant ID to auto-select when opening from pendingImageToOpen */
  pendingImageVariantId?: string | null;
  /** Callback to clear the pending image request after handling */
  onClearPendingImageToOpen?: () => void;
  /** Helper to navigate with transition overlay (prevents flash when component type changes) */
  navigateWithTransition?: (doNavigation: () => void) => void;
}

export const ShotImageManagerDesktop: React.FC<ShotImageManagerDesktopProps> = ({
  selection,
  dragAndDrop,
  lightbox,
  batchOps,
  optimistic,
  externalGens,
  getFramePosition,
  lightboxSelectedShotId,
  setLightboxSelectedShotId,
  segmentSlots,
  onSegmentClick,
  hasPendingTask,
  onSegmentDelete,
  deletingSegmentId,
  pendingImageToOpen,
  pendingImageVariantId,
  onClearPendingImageToOpen,
  navigateWithTransition,
  ...props
}) => {
  // State for showing success tick after adding to shot (positioned)
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);
  // State for showing success tick after adding to shot (without position)
  const [showTickForSecondaryImageId, setShowTickForSecondaryImageIdInternal] = useState<string | null>(null);
  
  // Wrapper to log when setter is called
  const setShowTickForSecondaryImageId = useCallback((id: string | null) => {
    setShowTickForSecondaryImageIdInternal(id);
  }, []);
  
  // Clear ticks after 3 seconds
  useEffect(() => {
    if (showTickForImageId) {
      const timer = setTimeout(() => {
        setShowTickForImageId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showTickForImageId]);
  
  useEffect(() => {
    if (showTickForSecondaryImageId) {
      const timer = setTimeout(() => {
        setShowTickForSecondaryImageId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showTickForSecondaryImageId, setShowTickForSecondaryImageId]);
  
  // Fetch task details for current lightbox image
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager, id is shot_generations.id but generation_id is the actual generation ID
  const currentLightboxImage = lightbox.lightboxIndex !== null
    ? lightbox.currentImages[lightbox.lightboxIndex]
    : null;
  const currentLightboxImageId = getGenerationId(currentLightboxImage) || null;
  const { taskDetailsData } = useTaskDetails({ generationId: currentLightboxImageId });

  // Prefetch task data for adjacent items when lightbox is open
  const prefetchTaskData = usePrefetchTaskData();

  useEffect(() => {
    if (lightbox.lightboxIndex === null) return;

    // Prefetch previous item
    if (lightbox.lightboxIndex > 0) {
      const prevItem = lightbox.currentImages[lightbox.lightboxIndex - 1];
      const prevGenerationId = getGenerationId(prevItem);
      if (prevGenerationId) {
        prefetchTaskData(prevGenerationId);
      }
    }

    // Prefetch next item
    if (lightbox.lightboxIndex < lightbox.currentImages.length - 1) {
      const nextItem = lightbox.currentImages[lightbox.lightboxIndex + 1];
      const nextGenerationId = getGenerationId(nextItem);
      if (nextGenerationId) {
        prefetchTaskData(nextGenerationId);
      }
    }

    // Prefetch current item too
    if (currentLightboxImageId) {
      prefetchTaskData(currentLightboxImageId);
    }
  }, [lightbox.lightboxIndex, lightbox.currentImages, currentLightboxImageId, prefetchTaskData]);

  // Handle pending image to open (from constituent image navigation / TasksPane deep-link)
  const capturedVariantIdRef = usePendingImageOpen({
    pendingImageToOpen,
    pendingImageVariantId,
    images: lightbox.currentImages,
    openLightbox: lightbox.setLightboxIndex,
    onClear: onClearPendingImageToOpen,
  });

  // Build adjacent segments data for the current lightbox image
  // This enables navigation to videos that start/end with the current image
  const adjacentSegmentsData = useAdjacentSegmentsData({
    segmentSlots,
    onPairClick: props.onPairClick,
    lightboxIndex: lightbox.lightboxIndex,
    currentImages: lightbox.currentImages,
    setLightboxIndex: lightbox.setLightboxIndex,
    navigateWithTransition,
  });

  const gridColsClass = GRID_COLS_CLASSES[props.columns || 4] || 'grid-cols-4';
  const isMobile = useIsMobile();
  
  // Shot navigation for "add without position" flow
  const { navigateToShot } = useShotNavigation();

  // ===== SCRUBBING PREVIEW STATE =====
  const [activeScrubbingIndex, setActiveScrubbingIndex] = useState<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Video scrubbing hook - controls the preview video
  const scrubbing = useVideoScrubbing({
    enabled: !isMobile && activeScrubbingIndex !== null,
    playOnStopScrubbing: true,
    playDelay: 400,
    resetOnLeave: true,
    onHoverEnd: () => setActiveScrubbingIndex(null),
  });
  const handleScrubbingMouseEnter = scrubbing.containerProps.onMouseEnter;
  const resetScrubbing = scrubbing.reset;
  const setScrubbingVideoElement = scrubbing.setVideoElement;

  // When active scrubbing index changes, manually trigger onMouseEnter
  useEffect(() => {
    if (activeScrubbingIndex !== null) {
      handleScrubbingMouseEnter();
    }
  }, [activeScrubbingIndex, handleScrubbingMouseEnter]);

  // Clear scrubbing preview on scroll
  useEffect(() => {
    if (activeScrubbingIndex === null) return;

    const handleScroll = () => {
      setActiveScrubbingIndex(null);
      resetScrubbing();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeScrubbingIndex, resetScrubbing]);

  // Get the active segment's video URL
  const activeSegmentSlot = activeScrubbingIndex !== null ? segmentSlots?.[activeScrubbingIndex] : null;
  const activeSegmentVideoUrl = activeSegmentSlot?.type === 'child' ? activeSegmentSlot.child.location : null;

  // Connect preview video to scrubbing hook when active segment changes
  useEffect(() => {
    if (previewVideoRef.current && activeScrubbingIndex !== null) {
      setScrubbingVideoElement(previewVideoRef.current);
    }
  }, [activeScrubbingIndex, activeSegmentVideoUrl, setScrubbingVideoElement]);

  // Handle scrubbing start - capture the segment's position for preview placement
  const handleScrubbingStart = useCallback((index: number, segmentRect: DOMRect) => {
    setActiveScrubbingIndex(index);
    // Position preview centered above the hovered segment
    setPreviewPosition({
      x: segmentRect.left + segmentRect.width / 2,
      y: segmentRect.top,
    });
  }, []);

  // Calculate preview dimensions based on aspect ratio
  const previewDimensions = useMemo(() => getPreviewDimensions(props.projectAspectRatio), [props.projectAspectRatio]);

  // Calculate clamped preview position to keep it within viewport
  const clampedPreviewX = useMemo(() => {
    const padding = 16;
    const halfWidth = previewDimensions.width / 2;
    const minX = padding + halfWidth;
    const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1920) - padding - halfWidth;
    return Math.max(minX, Math.min(maxX, previewPosition.x));
  }, [previewPosition.x, previewDimensions.width]);

  return (
    <>
      {/* Scrubbing Preview Portal - shared video preview for segment hover */}
      {activeScrubbingIndex !== null && activeSegmentVideoUrl && createPortal(
        <div
          className="fixed pointer-events-none"
          style={{
            left: `${clampedPreviewX}px`,
            top: `${previewPosition.y - previewDimensions.height - 16}px`,
            transform: 'translateX(-50%)',
            zIndex: 999999,
          }}
        >
          <div
            className="relative bg-black rounded-lg overflow-hidden shadow-xl border-2 border-primary/50"
            style={{
              width: previewDimensions.width,
              height: previewDimensions.height,
            }}
          >
            <video
              ref={previewVideoRef}
              src={getDisplayUrl(activeSegmentVideoUrl)}
              className="w-full h-full object-contain"
              muted
              playsInline
              preload="auto"
              loop
              {...scrubbing.videoProps}
            />

            {/* Scrubber progress bar */}
            {scrubbing.scrubberPosition !== null && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div
                  className={cn(
                    "h-full bg-primary transition-opacity duration-200",
                    scrubbing.scrubberVisible ? "opacity-100" : "opacity-50"
                  )}
                  style={{ width: `${scrubbing.scrubberPosition}%` }}
                />
              </div>
            )}

            {/* Segment label */}
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              Segment {(activeSegmentSlot?.index ?? 0) + 1}
              {scrubbing.duration > 0 && (
                <span className="ml-2 text-white/70">
                  {scrubbing.currentTime.toFixed(1)}s / {scrubbing.duration.toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <BatchDropZone
      onFileDrop={props.onFileDrop}
      onGenerationDrop={props.onGenerationDrop}
      columns={props.columns || 4}
      itemCount={lightbox.currentImages.length}
      disabled={props.readOnly || (!props.onFileDrop && !props.onGenerationDrop)}
      getFramePositionForIndex={getFramePosition}
      projectAspectRatio={props.projectAspectRatio}
    >
      {(_isFileDragOver, dropTargetIndex) => (
        <DndContext
          sensors={dragAndDrop.sensors}
          collisionDetection={closestCenter}
          onDragStart={dragAndDrop.handleDragStart}
          onDragEnd={dragAndDrop.handleDragEnd}
        >
          <SortableContext
            items={lightbox.currentImages.map((img: GenerationRow) => img.shotImageEntryId ?? img.id)}
            strategy={rectSortingStrategy}
          >
            <ImageGrid
              images={lightbox.currentImages}
              selectedIds={selection.selectedIds}
              gridColsClass={gridColsClass}
              columns={props.columns || 4}
              onItemClick={selection.handleItemClick}
              onItemDoubleClick={(idx) => lightbox.setLightboxIndex(idx)}
              onInpaintClick={(idx) => {
                lightbox.setShouldAutoEnterInpaint(true);
                lightbox.setLightboxIndex(idx);
              }}
              onDelete={batchOps.handleIndividualDelete}
              onDuplicate={props.onImageDuplicate}
              isMobile={isMobile}
              duplicatingImageId={props.duplicatingImageId}
              duplicateSuccessImageId={props.duplicateSuccessImageId}
              projectAspectRatio={props.projectAspectRatio}
              batchVideoFrames={props.batchVideoFrames}
              onGridDoubleClick={() => {
                selection.setSelectedIds([]);
                selection.setLastSelectedIndex(null);
              }}
              onImageUpload={props.onImageUpload}
              isUploadingImage={props.isUploadingImage}
              readOnly={props.readOnly}
              onPairClick={props.onPairClick}
              pairPrompts={props.pairPrompts}
              enhancedPrompts={props.enhancedPrompts}
              defaultPrompt={props.defaultPrompt}
              defaultNegativePrompt={props.defaultNegativePrompt}
              onClearEnhancedPrompt={props.onClearEnhancedPrompt}
              pairOverrides={props.pairOverrides}
              activeDragId={dragAndDrop.activeId}
              dropTargetIndex={dropTargetIndex}
              segmentSlots={segmentSlots}
              onSegmentClick={onSegmentClick}
              hasPendingTask={hasPendingTask}
              onSegmentDelete={onSegmentDelete}
              deletingSegmentId={deletingSegmentId}
              // Scrubbing props
              activeScrubbingIndex={activeScrubbingIndex}
              onScrubbingStart={handleScrubbingStart}
              scrubbing={scrubbing}
            />
          </SortableContext>
          
          <DragOverlay>
            {dragAndDrop.activeImage && (
              selection.selectedIds.length > 1 &&
              dragAndDrop.activeId !== null &&
              selection.selectedIds.includes(dragAndDrop.activeId) ? (
                <MultiImagePreview count={selection.selectedIds.length} image={dragAndDrop.activeImage} />
              ) : (
                <SingleImagePreview image={dragAndDrop.activeImage} />
              )
            )}
          </DragOverlay>
          
          {lightbox.lightboxIndex !== null && lightbox.currentImages[lightbox.lightboxIndex] && (() => {
            const lightboxIndex = lightbox.lightboxIndex;
            if (lightboxIndex === null) {
              return null;
            }
            const baseImagesCount = (optimistic.optimisticOrder && optimistic.optimisticOrder.length > 0) ? optimistic.optimisticOrder.length : (props.images || []).length;
            const isExternalGen = lightboxIndex >= baseImagesCount;
            
            let hasNext: boolean;
            let hasPrevious: boolean;
            
            if (externalGens.derivedNavContext) {
              const currentId = lightbox.currentImages[lightboxIndex]?.id;
              if (!currentId) {
                hasNext = false;
                hasPrevious = false;
              } else {
                const currentDerivedIndex = externalGens.derivedNavContext.derivedGenerationIds.indexOf(currentId);
                hasNext = currentDerivedIndex !== -1 && currentDerivedIndex < externalGens.derivedNavContext.derivedGenerationIds.length - 1;
                hasPrevious = currentDerivedIndex !== -1 && currentDerivedIndex > 0;
              }
            } else {
              hasNext = lightboxIndex < lightbox.currentImages.length - 1;
              hasPrevious = lightboxIndex > 0;
            }
            
            const currentImage = lightbox.currentImages[lightboxIndex];

            // Extended fields that may be present at runtime from external generation lookups
            const currentImageShotId = (currentImage as GenerationRow & { shot_id?: string }).shot_id;
            const currentImageAssociations = (currentImage as GenerationRow & { all_shot_associations?: Array<{ shot_id: string; timeline_frame?: number | null }> }).all_shot_associations;

            // Determine if the current image is positioned in the selected shot
            // For non-external gens (images from the shot itself), check if they have a timeline_frame
            // Use lightboxSelectedShotId instead of props.selectedShotId so it updates when dropdown changes
            const effectiveSelectedShotId = lightboxSelectedShotId || props.selectedShotId;
            const isInSelectedShot = !isExternalGen && effectiveSelectedShotId && (
              props.shotId === effectiveSelectedShotId ||
              currentImageShotId === effectiveSelectedShotId ||
              (Array.isArray(currentImageAssociations) &&
               currentImageAssociations.some((assoc) => assoc.shot_id === effectiveSelectedShotId))
            );

            const positionedInSelectedShot = isInSelectedShot
              ? currentImage.timeline_frame !== null && currentImage.timeline_frame !== undefined
              : undefined;

            const associatedWithoutPositionInSelectedShot = isInSelectedShot
              ? currentImage.timeline_frame === null || currentImage.timeline_frame === undefined
              : undefined;

            return (
              <MediaLightbox
                media={lightbox.currentImages[lightboxIndex]}
                shotId={props.shotId}
                toolTypeOverride={props.toolTypeOverride}
                autoEnterInpaint={lightbox.shouldAutoEnterInpaint}
                initialVariantId={capturedVariantIdRef.current ?? undefined}
                onClose={() => {
                  capturedVariantIdRef.current = null;
                  lightbox.setLightboxIndex(null);
                  lightbox.setShouldAutoEnterInpaint(false);
                  externalGens.setDerivedNavContext(null);
                  externalGens.setTempDerivedGenerations([]);
                  if (isExternalGen) {
                    externalGens.setExternalGenLightboxSelectedShot(props.selectedShotId);
                  }
                  // Reset dropdown to current shot when closing
                  setLightboxSelectedShotId?.(props.selectedShotId);
                }}
                onNext={lightbox.handleNext}
                onPrevious={lightbox.handlePrevious}
                onDelete={!props.readOnly ? (_mediaId: string) => {
                  const currentImage = lightbox.currentImages[lightboxIndex];
                  const shotImageEntryId = currentImage.shotImageEntryId || currentImage.id;
                  props.onImageDelete(shotImageEntryId);
                } : undefined}
                showNavigation={true}
                showImageEditTools={true}
                showDownload={true}
                showMagicEdit={true}
                hasNext={hasNext}
                hasPrevious={hasPrevious}
                starred={lightbox.currentImages[lightboxIndex]?.starred || false}
                onMagicEdit={props.onMagicEdit}
                readOnly={props.readOnly}
                showTaskDetails={true}
                taskDetailsData={taskDetailsData ?? undefined}
                onNavigateToGeneration={(generationId: string) => {
                  const index = lightbox.currentImages.findIndex((img: GenerationRow) => img.id === generationId);
                  if (index !== -1) {
                    lightbox.setLightboxIndex(index);
                  }
                }}
                onOpenExternalGeneration={externalGens.handleOpenExternalGeneration}
                allShots={props.allShots}
                selectedShotId={isExternalGen ? externalGens.externalGenLightboxSelectedShot : (lightboxSelectedShotId || props.selectedShotId)}
                onShotChange={isExternalGen ? (shotId) => {
                  externalGens.setExternalGenLightboxSelectedShot(shotId);
                } : (shotId) => {
                  setLightboxSelectedShotId?.(shotId);
                  props.onShotChange?.(shotId);
                }}
                onAddToShot={(() => {
                  const result = isExternalGen ? externalGens.handleExternalGenAddToShot : props.onAddToShot;
                  return result;
                })()}
                onAddToShotWithoutPosition={isExternalGen ? externalGens.handleExternalGenAddToShotWithoutPosition : props.onAddToShotWithoutPosition}
                onCreateShot={props.onCreateShot}
                positionedInSelectedShot={positionedInSelectedShot}
                associatedWithoutPositionInSelectedShot={associatedWithoutPositionInSelectedShot}
                showTickForImageId={showTickForImageId}
                onShowTick={setShowTickForImageId}
                showTickForSecondaryImageId={showTickForSecondaryImageId}
                onShowSecondaryTick={setShowTickForSecondaryImageId}
                onNavigateToShot={(shot) => {
                  navigateToShot(shot, { scrollToTop: true });
                }}
                adjacentSegments={adjacentSegmentsData}
              />
            );
          })()}
          
          {selection.showSelectionBar && selection.selectedIds.length >= 1 && (
            <SelectionActionBar
              selectedCount={selection.selectedIds.length}
              onDeselect={selection.clearSelection}
              onDelete={() => batchOps.handleBatchDelete(selection.selectedIds)}
              onNewShot={props.onNewShotFromSelection ? async () => {
                const shotId = await props.onNewShotFromSelection!(selection.selectedIds);
                return shotId;
              } : undefined}
              onJumpToShot={props.onShotChange}
            />
          )}
          
          <DeleteConfirmationDialog
            open={batchOps.confirmOpen}
            onOpenChange={batchOps.setConfirmOpen}
            pendingDeleteIds={batchOps.pendingDeleteIds}
            onConfirm={batchOps.performBatchDelete}
          />
        </DndContext>
      )}
    </BatchDropZone>
    </>
  );
};
