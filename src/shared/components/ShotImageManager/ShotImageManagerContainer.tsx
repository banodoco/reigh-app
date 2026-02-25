import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useIsMobile } from '@/shared/hooks/mobile';
import { isPositioned, isVideoGeneration } from '@/shared/lib/typeGuards';
import { usePendingSegmentTasks } from '@/shared/hooks/usePendingSegmentTasks';
import { useSegmentOutputsForShot } from '@/shared/hooks/segments';
import MediaLightbox from '../MediaLightbox';
import { DEFAULT_BATCH_VIDEO_FRAMES } from './constants';
import { ShotImageManagerDesktop } from './ShotImageManagerDesktop.tsx';
import { ShotImageManagerMobileWrapper } from './ShotImageManagerMobileWrapper.tsx';
import { EmptyState } from './components/EmptyState';
import { useBatchOperations } from './hooks/useBatchOperations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useExternalGenerations } from './hooks/useExternalGenerations';
import { useLightbox } from './hooks/useLightbox';
import { useMobileGestures } from './hooks/useMobileGestures';
import { useOptimisticOrder } from './hooks/useOptimisticOrder';
import { useSelection } from './hooks/useSelection';
import { getFramePositionForIndex } from './utils/image-utils';
import type { ShotImageManagerProps } from './types';

type SegmentOutputHookResult = ReturnType<typeof useSegmentOutputsForShot>;
type SegmentSlot = SegmentOutputHookResult['segmentSlots'][number];

interface SegmentLightboxState {
  segmentLightboxIndex: number | null;
  currentSegmentSlot: SegmentSlot | null;
  currentSegmentMedia: GenerationRow | null;
  segmentChildSlotIndices: number[];
  handleSegmentClick: (slotIndex: number) => void;
  handleSegmentLightboxNext: () => void;
  handleSegmentLightboxPrev: () => void;
  closeSegmentLightbox: () => void;
}

interface SegmentVideoLightboxProps {
  currentSegmentMedia: GenerationRow | null;
  selectedParentId: string | null;
  currentSegmentSlot: SegmentSlot | null;
  handleSegmentLightboxNext: () => void;
  handleSegmentLightboxPrev: () => void;
  closeSegmentLightbox: () => void;
  segmentChildCount: number;
  shotId?: string;
  readOnly?: boolean;
}

interface SelectionOrderController {
  optimistic: ReturnType<typeof useOptimisticOrder>;
  selection: ReturnType<typeof useSelection>;
  dragAndDrop: ReturnType<typeof useDragAndDrop>;
  batchOps: ReturnType<typeof useBatchOperations>;
  mobileGestures: ReturnType<typeof useMobileGestures>;
  getFramePosition: (index: number) => number | undefined;
}

interface NavigationController {
  lightbox: ReturnType<typeof useLightbox>;
  externalGens: ReturnType<typeof useExternalGenerations>;
  shotSelector: {
    lightboxSelectedShotId: string | undefined;
    setLightboxSelectedShotId: React.Dispatch<React.SetStateAction<string | undefined>>;
  };
}

interface SegmentController {
  segmentSlots: SegmentSlot[];
  selectedParentId: string | null;
  hasPendingTask: (pairShotGenerationId: string | null | undefined) => boolean;
  segmentLightbox: SegmentLightboxState;
}

interface ShotImageManagerContainerState {
  selectionOrder: SelectionOrderController;
  navigation: NavigationController;
  segments: SegmentController;
}

function useSegmentController(
  props: ShotImageManagerProps,
  currentImages: GenerationRow[],
): SegmentController {
  const localShotGenPositions = useMemo(() => {
    if (props.generationMode === 'timeline') {
      return undefined;
    }

    const orderedImages = currentImages.filter(
      (image) => isPositioned(image) && !isVideoGeneration(image)
    );
    if (orderedImages.length === 0) {
      return undefined;
    }

    const positions = new Map<string, number>();
    orderedImages.forEach((image, index) => {
      if (image.id) {
        positions.set(image.id, index);
      }
    });
    return positions;
  }, [currentImages, props.generationMode]);

  const shouldFetchSegments = props.generationMode !== 'timeline' &&
    (!props.segmentSlots || (localShotGenPositions && localShotGenPositions.size > 0));

  const hookResult = useSegmentOutputsForShot(
    shouldFetchSegments ? props.shotId || null : null,
    shouldFetchSegments ? props.projectId || null : null,
    shouldFetchSegments ? localShotGenPositions : undefined
  );

  const segmentSlots = (localShotGenPositions && localShotGenPositions.size > 0)
    ? (hookResult.segmentSlots.length > 0 ? hookResult.segmentSlots : props.segmentSlots ?? [])
    : (props.segmentSlots ?? hookResult.segmentSlots);

  const selectedParentId = hookResult.selectedParentId;
  const { hasPendingTask } = usePendingSegmentTasks(
    props.generationMode !== 'timeline' ? props.shotId || null : null,
    props.generationMode !== 'timeline' ? props.projectId || null : null
  );

  const segmentLightbox = useSegmentLightboxState(segmentSlots, props.onPairClick);

  return {
    segmentSlots,
    selectedParentId,
    hasPendingTask,
    segmentLightbox,
  };
}

function useSegmentLightboxState(
  segmentSlots: SegmentSlot[],
  onPairClick?: ShotImageManagerProps['onPairClick']
): SegmentLightboxState {
  const [segmentLightboxIndex, setSegmentLightboxIndex] = useState<number | null>(null);

  const handleSegmentClick = useCallback((slotIndex: number) => {
    const slot = segmentSlots[slotIndex];
    if (onPairClick && slot) {
      onPairClick(slot.index);
      return;
    }

    setSegmentLightboxIndex(slotIndex);
  }, [onPairClick, segmentSlots]);

  const currentSegmentSlot = segmentLightboxIndex !== null ? segmentSlots[segmentLightboxIndex] : null;
  const currentSegmentMedia = currentSegmentSlot?.type === 'child'
    ? currentSegmentSlot.child
    : null;

  const segmentChildSlotIndices = useMemo(
    () =>
      segmentSlots
        .map((slot, idx) => (slot.type === 'child' && slot.child.location ? idx : null))
        .filter((idx): idx is number => idx !== null),
    [segmentSlots]
  );

  const handleSegmentLightboxNext = useCallback(() => {
    if (segmentLightboxIndex === null || segmentChildSlotIndices.length === 0) {
      return;
    }

    const currentPos = segmentChildSlotIndices.indexOf(segmentLightboxIndex);
    const nextPos = (currentPos + 1) % segmentChildSlotIndices.length;
    setSegmentLightboxIndex(segmentChildSlotIndices[nextPos]);
  }, [segmentChildSlotIndices, segmentLightboxIndex]);

  const handleSegmentLightboxPrev = useCallback(() => {
    if (segmentLightboxIndex === null || segmentChildSlotIndices.length === 0) {
      return;
    }

    const currentPos = segmentChildSlotIndices.indexOf(segmentLightboxIndex);
    const prevPos = (currentPos - 1 + segmentChildSlotIndices.length) % segmentChildSlotIndices.length;
    setSegmentLightboxIndex(segmentChildSlotIndices[prevPos]);
  }, [segmentChildSlotIndices, segmentLightboxIndex]);

  const closeSegmentLightbox = useCallback(() => {
    setSegmentLightboxIndex(null);
  }, []);

  return {
    segmentLightboxIndex,
    currentSegmentSlot,
    currentSegmentMedia,
    segmentChildSlotIndices,
    handleSegmentClick,
    handleSegmentLightboxNext,
    handleSegmentLightboxPrev,
    closeSegmentLightbox,
  };
}

function useShotImageManagerContainerState(
  props: ShotImageManagerProps,
  isMobile: boolean
): ShotImageManagerContainerState {
  const optimistic = useOptimisticOrder({ images: props.images });
  const setLightboxIndexRef = useRef<(index: number) => void>(() => {});

  const externalGens = useExternalGenerations({
    selectedShotId: props.selectedShotId,
    optimisticOrder: optimistic.optimisticOrder,
    images: props.images,
    setLightboxIndexRef,
  });

  const [lightboxSelectedShotId, setLightboxSelectedShotId] = useState<string | undefined>(props.selectedShotId);

  const selection = useSelection({
    images: optimistic.optimisticOrder,
    isMobile,
    generationMode: props.generationMode,
    onSelectionChange: props.onSelectionChange,
  });

  const lightbox = useLightbox({
    images: optimistic.optimisticOrder,
    externalGenerations: externalGens.externalGenerations,
    tempDerivedGenerations: externalGens.tempDerivedGenerations,
    derivedNavContext: externalGens.derivedNavContext,
    handleOpenExternalGeneration: externalGens.handleOpenExternalGeneration,
  });
  const segments = useSegmentController(props, lightbox.currentImages);

  useEffect(() => {
    setLightboxIndexRef.current = lightbox.setLightboxIndex;
  }, [lightbox.setLightboxIndex]);

  const dragAndDrop = useDragAndDrop({
    images: lightbox.currentImages,
    selectedIds: selection.selectedIds,
    onImageReorder: props.onImageReorder,
    isMobile,
    setSelectedIds: selection.setSelectedIds,
    setLastSelectedIndex: selection.setLastSelectedIndex,
    setOptimisticOrder: optimistic.setOptimisticOrder,
    setIsOptimisticUpdate: optimistic.setIsOptimisticUpdate,
    setReconciliationId: optimistic.setReconciliationId,
    onDragStateChange: props.onDragStateChange,
  });

  const batchOps = useBatchOperations({
    currentImages: lightbox.currentImages,
    onImageDelete: props.onImageDelete,
    onBatchImageDelete: props.onBatchImageDelete,
    onSelectionChange: props.onSelectionChange,
    setSelectedIds: selection.setSelectedIds,
    setMobileSelectedIds: selection.setMobileSelectedIds,
    setLastSelectedIndex: selection.setLastSelectedIndex,
  });

  const mobileGestures = useMobileGestures({
    currentImages: lightbox.currentImages,
    mobileSelectedIds: selection.mobileSelectedIds,
    onImageReorder: props.onImageReorder,
    setMobileSelectedIds: selection.setMobileSelectedIds,
    setLightboxIndex: lightbox.setLightboxIndex,
  });

  const getFramePosition = useMemo(
    () => (index: number) =>
      getFramePositionForIndex(
        index,
        lightbox.currentImages,
        props.batchVideoFrames || DEFAULT_BATCH_VIDEO_FRAMES
      ),
    [lightbox.currentImages, props.batchVideoFrames]
  );

  const selectionOrder: SelectionOrderController = {
    optimistic,
    selection,
    dragAndDrop,
    batchOps,
    mobileGestures,
    getFramePosition,
  };

  const navigation: NavigationController = {
    lightbox,
    externalGens,
    shotSelector: {
      lightboxSelectedShotId,
      setLightboxSelectedShotId,
    },
  };

  return {
    selectionOrder,
    navigation,
    segments,
  };
}

const SegmentVideoLightbox: React.FC<SegmentVideoLightboxProps> = ({
  currentSegmentMedia,
  selectedParentId,
  currentSegmentSlot,
  handleSegmentLightboxNext,
  handleSegmentLightboxPrev,
  closeSegmentLightbox,
  segmentChildCount,
  shotId,
  readOnly,
}) => {
  if (!currentSegmentMedia) {
    return null;
  }

  return (
    <MediaLightbox
      media={currentSegmentMedia}
      parentGenerationIdOverride={selectedParentId}
      onClose={closeSegmentLightbox}
      onNext={handleSegmentLightboxNext}
      onPrevious={handleSegmentLightboxPrev}
      showNavigation={true}
      showImageEditTools={false}
      showDownload={true}
      hasNext={segmentChildCount > 1}
      hasPrevious={segmentChildCount > 1}
      starred={currentSegmentMedia.starred ?? false}
      shotId={shotId}
      readOnly={readOnly}
      showTaskDetails={true}
      showVideoTrimEditor={true}
      fetchVariantsForSelf={true}
      currentSegmentImages={{
        startShotGenerationId: currentSegmentSlot?.pairShotGenerationId,
      }}
    />
  );
};

/**
 * Main container component for ShotImageManager
 *
 * CRITICAL: All hooks MUST be called before any early returns to satisfy Rules of Hooks.
 * This prevents hook ordering violations that occur when responsive breakpoints change.
 */
export const ShotImageManagerContainer: React.FC<ShotImageManagerProps> = (props) => {
  const isMobile = useIsMobile();
  const state = useShotImageManagerContainerState(props, isMobile);

  if (!props.images || props.images.length === 0) {
    return (
      <EmptyState
        onImageUpload={props.onImageUpload}
        isUploadingImage={props.isUploadingImage}
        shotId={props.selectedShotId}
        onGenerationDrop={props.onGenerationDrop
          ? (generationId, imageUrl, thumbUrl) =>
              props.onGenerationDrop!(generationId, imageUrl, thumbUrl, 0)
          : undefined}
      />
    );
  }

  if (isMobile && props.generationMode !== 'timeline') {
    return (
      <>
        <ShotImageManagerMobileWrapper
          {...props}
          selection={state.selectionOrder.selection}
          lightbox={state.navigation.lightbox}
          batchOps={state.selectionOrder.batchOps}
          mobileGestures={state.selectionOrder.mobileGestures}
          optimistic={state.selectionOrder.optimistic}
          externalGens={state.navigation.externalGens}
          lightboxSelectedShotId={state.navigation.shotSelector.lightboxSelectedShotId}
          setLightboxSelectedShotId={state.navigation.shotSelector.setLightboxSelectedShotId}
          segmentSlots={state.segments.segmentSlots}
          onSegmentClick={state.segments.segmentLightbox.handleSegmentClick}
          hasPendingTask={state.segments.hasPendingTask}
          onSegmentDelete={props.onSegmentDelete}
          deletingSegmentId={props.deletingSegmentId}
        />

        <SegmentVideoLightbox
          currentSegmentMedia={state.segments.segmentLightbox.currentSegmentMedia}
          selectedParentId={state.segments.selectedParentId}
          currentSegmentSlot={state.segments.segmentLightbox.currentSegmentSlot}
          handleSegmentLightboxNext={state.segments.segmentLightbox.handleSegmentLightboxNext}
          handleSegmentLightboxPrev={state.segments.segmentLightbox.handleSegmentLightboxPrev}
          closeSegmentLightbox={state.segments.segmentLightbox.closeSegmentLightbox}
          segmentChildCount={state.segments.segmentLightbox.segmentChildSlotIndices.length}
          shotId={props.shotId}
          readOnly={props.readOnly}
        />
      </>
    );
  }

  return (
    <>
      <ShotImageManagerDesktop
        {...props}
        selection={state.selectionOrder.selection}
        dragAndDrop={state.selectionOrder.dragAndDrop}
        lightbox={state.navigation.lightbox}
        batchOps={state.selectionOrder.batchOps}
        optimistic={state.selectionOrder.optimistic}
        externalGens={state.navigation.externalGens}
        getFramePosition={state.selectionOrder.getFramePosition}
        lightboxSelectedShotId={state.navigation.shotSelector.lightboxSelectedShotId}
        setLightboxSelectedShotId={state.navigation.shotSelector.setLightboxSelectedShotId}
        segmentSlots={state.segments.segmentSlots}
        onSegmentClick={state.segments.segmentLightbox.handleSegmentClick}
        hasPendingTask={state.segments.hasPendingTask}
        onSegmentDelete={props.onSegmentDelete}
        deletingSegmentId={props.deletingSegmentId}
      />

      <SegmentVideoLightbox
        currentSegmentMedia={state.segments.segmentLightbox.currentSegmentMedia}
        selectedParentId={state.segments.selectedParentId}
        currentSegmentSlot={state.segments.segmentLightbox.currentSegmentSlot}
        handleSegmentLightboxNext={state.segments.segmentLightbox.handleSegmentLightboxNext}
        handleSegmentLightboxPrev={state.segments.segmentLightbox.handleSegmentLightboxPrev}
        closeSegmentLightbox={state.segments.segmentLightbox.closeSegmentLightbox}
        segmentChildCount={state.segments.segmentLightbox.segmentChildSlotIndices.length}
        shotId={props.shotId}
        readOnly={props.readOnly}
      />
    </>
  );
};
