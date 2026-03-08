import React, { useState, useEffect } from 'react';
import type { ShotImageManagerProps, ShotLightboxSelectionProps } from './types';
import { ShotImageManagerMobile } from './ShotImageManagerMobile';
import { DesktopLightboxOverlay } from './components/DesktopLightboxOverlay';
import { useLightboxContextData } from './hooks/useLightboxContextData';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { useSelection } from './hooks/useSelection';
import type { useLightbox } from './hooks/useLightbox';
import type { useBatchOperations } from './hooks/useBatchOperations';
import type { useMobileGestures } from './hooks/useMobileGestures';
import type { useOptimisticOrder } from './hooks/useOptimisticOrder';
import type { useExternalGenerations } from './hooks/useExternalGenerations';

interface ShotImageManagerMobileWrapperProps extends ShotImageManagerProps, ShotLightboxSelectionProps {
  selection: ReturnType<typeof useSelection>;
  lightbox: ReturnType<typeof useLightbox>;
  batchOps: ReturnType<typeof useBatchOperations>;
  mobileGestures: ReturnType<typeof useMobileGestures>;
  optimistic: ReturnType<typeof useOptimisticOrder>;
  externalGens: ReturnType<typeof useExternalGenerations>;
}

export const ShotImageManagerMobileWrapper: React.FC<ShotImageManagerMobileWrapperProps> = ({
  lightbox,
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
        adjacentSegments={adjacentSegmentsData}
        includeDeleteAction={false}
        onMissingGenerationNavigate={(generationId) => {
          normalizeAndPresentError(new Error('Generation not found in current images'), {
            context: 'ShotImageManagerMobileWrapper',
            showToast: false,
            logData: {
              searchedId: generationId.substring(0, 8),
              availableIds: lightbox.currentImages.map((img) => img.id.substring(0, 8)),
            },
          });
        }}
      />
    </>
  );
};
