import React, { useEffect } from 'react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { ShotImageManagerProps } from './types';
import { GRID_COLS_CLASSES } from './constants';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useTaskDetails } from './hooks/useTaskDetails';
import { useShotNavigation } from '@/shared/hooks/shots/useShotNavigation';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { GenerationRow } from '@/domains/generation/types';
import { usePrefetchTaskData } from '@/shared/hooks/tasks/useTaskPrefetch';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { usePendingImageOpen } from '@/shared/hooks/usePendingImageOpen';
import { useAdjacentSegmentsData } from './hooks/useAdjacentSegmentsData';
import { useImageTickFeedback } from './hooks/useImageTickFeedback';
import { useDesktopSegmentScrubbing } from './hooks/useDesktopSegmentScrubbing';
import BatchDropZone from './components/BatchDropZone';
import { DeleteConfirmationDialog } from './components/DeleteConfirmationDialog';
import { ImageGrid } from './components/ImageGrid';
import { SelectionActionBar } from './components/SelectionActionBar';
import { MultiImagePreview, SingleImagePreview } from '@/shared/components/ImageDragPreview';
import { DesktopLightboxOverlay } from './components/DesktopLightboxOverlay';
import { DesktopScrubbingPreview } from './components/DesktopScrubbingPreview';
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
  const {
    showTickForImageId,
    setShowTickForImageId,
    showTickForSecondaryImageId,
    setShowTickForSecondaryImageId,
  } = useImageTickFeedback();

  // Fetch task details for current lightbox image
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager, id is shot_generations.id but generation_id is the actual generation ID
  const currentLightboxImage = lightbox.lightboxIndex !== null
    ? lightbox.currentImages[lightbox.lightboxIndex]
    : null;
  const currentLightboxImageId = getGenerationId(currentLightboxImage) || null;
  const { taskDetailsData } = useTaskDetails({
    generationId: currentLightboxImageId,
    projectId: props.projectId ?? null,
  });

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

  const {
    activeScrubbingIndex,
    activeSegmentSlot,
    activeSegmentVideoUrl,
    clampedPreviewX,
    previewY,
    previewDimensions,
    previewVideoRef,
    scrubbing,
    handleScrubbingStart,
  } = useDesktopSegmentScrubbing({
    isMobile,
    segmentSlots,
    projectAspectRatio: props.projectAspectRatio,
  });

  return (
    <>
      <DesktopScrubbingPreview
        activeScrubbingIndex={activeScrubbingIndex}
        activeSegmentSlot={activeSegmentSlot ?? null}
        activeSegmentVideoUrl={activeSegmentVideoUrl}
        clampedPreviewX={clampedPreviewX}
        previewY={previewY}
        previewDimensions={previewDimensions}
        previewVideoRef={previewVideoRef}
        scrubbing={scrubbing}
      />

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
              items={lightbox.currentImages.map((image: GenerationRow) => image.shotImageEntryId ?? image.id)}
              strategy={rectSortingStrategy}
            >
              <ImageGrid
                images={lightbox.currentImages}
                selectedIds={selection.selectedIds}
                gridColsClass={gridColsClass}
                columns={props.columns || 4}
                onItemClick={selection.handleItemClick}
                onItemDoubleClick={(index) => lightbox.setLightboxIndex(index)}
                onInpaintClick={(index) => {
                  lightbox.setShouldAutoEnterInpaint(true);
                  lightbox.setLightboxIndex(index);
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
                  <MultiImagePreview
                    count={selection.selectedIds.length}
                    image={dragAndDrop.activeImage}
                  />
                ) : (
                  <SingleImagePreview image={dragAndDrop.activeImage} />
                )
              )}
            </DragOverlay>

            <DesktopLightboxOverlay
              lightbox={lightbox}
              optimistic={optimistic}
              externalGens={externalGens}
              managerProps={props}
              lightboxSelectedShotId={lightboxSelectedShotId}
              setLightboxSelectedShotId={setLightboxSelectedShotId}
              taskDetailsData={taskDetailsData ?? undefined}
              capturedVariantIdRef={capturedVariantIdRef}
              showTickForImageId={showTickForImageId}
              onShowTick={setShowTickForImageId}
              showTickForSecondaryImageId={showTickForSecondaryImageId}
              onShowSecondaryTick={setShowTickForSecondaryImageId}
              onNavigateToShot={(shot) => {
                navigateToShot(shot, { scrollToTop: true });
              }}
              adjacentSegments={adjacentSegmentsData}
            />

            {selection.showSelectionBar && selection.selectedIds.length >= 1 && (
              <SelectionActionBar
                selectedCount={selection.selectedIds.length}
                onDeselect={selection.clearSelection}
                onDelete={() => batchOps.handleBatchDelete(selection.selectedIds)}
                onNewShot={
                  props.onNewShotFromSelection
                    ? async () => {
                        const shotId = await props.onNewShotFromSelection!(selection.selectedIds);
                        return shotId;
                      }
                    : undefined
                }
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
