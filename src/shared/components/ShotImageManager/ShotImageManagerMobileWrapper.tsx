import React, { useState, useEffect } from 'react';
import { ShotImageManagerProps } from './types';
import { ShotImageManagerMobile } from './ShotImageManagerMobile';
import MediaLightbox from '../MediaLightbox';
import { useTaskDetails } from './hooks/useTaskDetails';
import type { SegmentSlot } from '@/shared/hooks/segments';
import { usePrefetchTaskData } from '@/shared/hooks/useTaskPrefetch';
import { useAdjacentSegmentsData } from './hooks/useAdjacentSegmentsData';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { usePendingImageOpen } from '@/shared/hooks/usePendingImageOpen';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { GenerationRow } from '@/types/shots';
import type { useSelection } from './hooks/useSelection';
import type { useLightbox } from './hooks/useLightbox';
import type { useBatchOperations } from './hooks/useBatchOperations';
import type { useMobileGestures } from './hooks/useMobileGestures';
import type { useOptimisticOrder } from './hooks/useOptimisticOrder';
import type { useExternalGenerations } from './hooks/useExternalGenerations';

interface ShotImageManagerMobileWrapperProps extends ShotImageManagerProps {
  selection: ReturnType<typeof useSelection>;
  lightbox: ReturnType<typeof useLightbox>;
  batchOps: ReturnType<typeof useBatchOperations>;
  mobileGestures: ReturnType<typeof useMobileGestures>;
  optimistic: ReturnType<typeof useOptimisticOrder>;
  externalGens: ReturnType<typeof useExternalGenerations>;
  lightboxSelectedShotId?: string;
  setLightboxSelectedShotId?: (shotId: string | undefined) => void;
  // Segment video output props
  segmentSlots?: SegmentSlot[];
  onSegmentClick?: (slotIndex: number) => void;
  /** Check if a pair_shot_generation_id has a pending task */
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  /** Request to open lightbox for specific image (from segment constituent navigation) */
  pendingImageToOpen?: string | null;
  /** Variant ID to auto-select when opening from pendingImageToOpen */
  pendingImageVariantId?: string | null;
  /** Callback to clear the pending image request after handling */
  onClearPendingImageToOpen?: () => void;
  /** Helper to navigate with transition overlay (prevents flash when component type changes) */
  navigateWithTransition?: (doNavigation: () => void) => void;
}

export const ShotImageManagerMobileWrapper: React.FC<ShotImageManagerMobileWrapperProps> = ({
  selection,
  lightbox,
  batchOps,
  mobileGestures,
  optimistic,
  externalGens,
  lightboxSelectedShotId,
  setLightboxSelectedShotId,
  segmentSlots,
  onSegmentClick,
  hasPendingTask,
  pendingImageToOpen,
  pendingImageVariantId,
  onClearPendingImageToOpen,
  navigateWithTransition,
  ...props
}) => {
  // State for showing success tick after adding to shot (positioned)
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);
  // State for showing success tick after adding to shot (without position)
  const [showTickForSecondaryImageId, setShowTickForSecondaryImageId] = useState<string | null>(null);
  
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
  }, [showTickForSecondaryImageId]);

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
  
  return (
    <>
      <ShotImageManagerMobile
        images={props.images}
        onImageDelete={props.onImageDelete}
        onBatchImageDelete={props.onBatchImageDelete}
        onImageDuplicate={props.onImageDuplicate}
        onImageReorder={props.onImageReorder}
        generationMode={props.generationMode}
        onOpenLightbox={props.onOpenLightbox || lightbox.setLightboxIndex}
        onInpaintClick={(index) => {
          lightbox.setShouldAutoEnterInpaint(true);
          lightbox.setLightboxIndex(index);
        }}
        columns={props.columns}
        duplicatingImageId={props.duplicatingImageId}
        duplicateSuccessImageId={props.duplicateSuccessImageId}
        projectAspectRatio={props.projectAspectRatio}
        batchVideoFrames={props.batchVideoFrames}
        onImageUpload={props.onImageUpload}
        readOnly={props.readOnly}
        isUploadingImage={props.isUploadingImage}
        onSelectionChange={props.onSelectionChange}
        onPairClick={props.onPairClick}
        pairPrompts={props.pairPrompts}
        enhancedPrompts={props.enhancedPrompts}
        defaultPrompt={props.defaultPrompt}
        defaultNegativePrompt={props.defaultNegativePrompt}
        onClearEnhancedPrompt={props.onClearEnhancedPrompt}
        segmentSlots={segmentSlots}
        onSegmentClick={onSegmentClick}
        hasPendingTask={hasPendingTask}
        onNewShotFromSelection={props.onNewShotFromSelection}
        onShotChange={props.onShotChange}
      />
      
      {lightbox.lightboxIndex !== null && lightbox.currentImages[lightbox.lightboxIndex] && (() => {
        const baseImagesCount = (optimistic.optimisticOrder && optimistic.optimisticOrder.length > 0) ? optimistic.optimisticOrder.length : (props.images || []).length;
        const isExternalGen = lightbox.lightboxIndex >= baseImagesCount;
        
        let hasNext: boolean;
        let hasPrevious: boolean;
        
        if (externalGens.derivedNavContext) {
          const currentId = lightbox.currentImages[lightbox.lightboxIndex]?.id;
          const currentDerivedIndex = externalGens.derivedNavContext.derivedGenerationIds.indexOf(currentId);
          hasNext = currentDerivedIndex !== -1 && currentDerivedIndex < externalGens.derivedNavContext.derivedGenerationIds.length - 1;
          hasPrevious = currentDerivedIndex !== -1 && currentDerivedIndex > 0;
        } else {
          hasNext = lightbox.lightboxIndex < lightbox.currentImages.length - 1;
          hasPrevious = lightbox.lightboxIndex > 0;
        }
        
        const currentImage = lightbox.currentImages[lightbox.lightboxIndex];

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
            media={lightbox.currentImages[lightbox.lightboxIndex]}
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
            showNavigation={true}
            showImageEditTools={true}
            showDownload={true}
            showMagicEdit={true}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            starred={lightbox.currentImages[lightbox.lightboxIndex]?.starred || false}
            onMagicEdit={props.onMagicEdit}
            readOnly={props.readOnly}
            showTaskDetails={true}
            taskDetailsData={taskDetailsData ?? undefined}
            adjacentSegments={adjacentSegmentsData}
            onNavigateToGeneration={(generationId: string) => {
              const index = lightbox.currentImages.findIndex((img: GenerationRow) => img.id === generationId);
              if (index !== -1) {
                lightbox.setLightboxIndex(index);
              } else {
                handleError(new Error('Generation not found in current images'), {
                  context: 'ShotImageManagerMobileWrapper',
                  showToast: false,
                  logData: {
                    searchedId: generationId.substring(0, 8),
                    availableIds: lightbox.currentImages.map((img: GenerationRow) => img.id.substring(0, 8))
                  },
                });
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
          />
        );
      })()}
    </>
  );
};
