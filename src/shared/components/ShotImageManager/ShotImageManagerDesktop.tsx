import React from 'react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { ShotImageManagerProps, ShotLightboxSelectionProps } from './types';
import { GRID_COLS_CLASSES } from './constants';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useLightboxContextData } from './hooks/useLightboxContextData';
import { useShotNavigation } from '@/shared/hooks/shots/useShotNavigation';
import type { GenerationRow } from '@/domains/generation/types';
import { useImageTickFeedback } from './hooks/useImageTickFeedback';
import { useDesktopSegmentScrubbing } from './hooks/useDesktopSegmentScrubbing';
import { BatchDropZone } from './components/BatchDropZone';
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

interface ShotImageManagerDesktopProps extends ShotImageManagerProps, ShotLightboxSelectionProps {
  selection: ReturnType<typeof useSelection>;
  dragAndDrop: ReturnType<typeof useDragAndDrop>;
  lightbox: ReturnType<typeof useLightbox>;
  batchOps: ReturnType<typeof useBatchOperations>;
  optimistic: ReturnType<typeof useOptimisticOrder>;
  externalGens: ReturnType<typeof useExternalGenerations>;
  getFramePosition: (index: number) => number | undefined;
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

  const { capturedVariantIdRef, adjacentSegmentsData, taskDetailsData } = useLightboxContextData({
    lightboxIndex: lightbox.lightboxIndex,
    currentImages: lightbox.currentImages,
    setLightboxIndex: lightbox.setLightboxIndex,
    projectId: props.projectId ?? null,
    pendingImageToOpen,
    pendingImageVariantId,
    onClearPendingImageToOpen,
    segmentSlots,
    onPairClick: props.onPairClick,
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
