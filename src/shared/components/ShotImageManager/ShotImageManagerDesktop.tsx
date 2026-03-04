import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShotImageManagerProps } from './types';
import { GRID_COLS_CLASSES } from './constants';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useTaskDetails } from './hooks/useTaskDetails';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';
import type { SegmentSlot } from '@/shared/hooks/segments';
import { getPreviewDimensions } from '@/shared/lib/media/aspectRatios';
import { usePrefetchTaskData } from '@/shared/hooks/tasks/useTaskPrefetch';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { usePendingImageOpen } from '@/shared/hooks/usePendingImageOpen';
import { useAdjacentSegmentsData } from './hooks/useAdjacentSegmentsData';
import { DesktopImageGrid } from './components/DesktopImageGrid';
import { DesktopLightboxOverlay } from './components/DesktopLightboxOverlay';
import { DesktopScrubbingPreview } from './components/DesktopScrubbingPreview';
import type { useSelection } from './hooks/useSelection';
import type { useDragAndDrop } from './hooks/useDragAndDrop';
import type { useLightbox } from './hooks/useLightbox';
import type { useBatchOperations } from './hooks/useBatchOperations';
import type { useOptimisticOrder } from './hooks/useOptimisticOrder';
import type { useExternalGenerations } from './hooks/useExternalGenerations';
import { useImageTickFeedback } from './hooks/useImageTickFeedback';

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
    showTickForSecondaryImageId,
    setShowTickForImageId,
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
      <DesktopScrubbingPreview
        activeScrubbingIndex={activeScrubbingIndex}
        activeSegmentSlot={activeSegmentSlot ?? null}
        activeSegmentVideoUrl={activeSegmentVideoUrl}
        clampedPreviewX={clampedPreviewX}
        previewY={previewPosition.y}
        previewDimensions={previewDimensions}
        previewVideoRef={previewVideoRef}
        scrubbing={scrubbing}
      />

      <DesktopImageGrid
        managerProps={props}
        currentImages={lightbox.currentImages}
        columns={props.columns || 4}
        gridColsClass={gridColsClass}
        isMobile={isMobile}
        dragAndDrop={dragAndDrop}
        selection={selection}
        lightbox={lightbox}
        batchOps={batchOps}
        getFramePositionForIndex={getFramePosition}
        segmentSlots={segmentSlots}
        onSegmentClick={onSegmentClick}
        hasPendingTask={hasPendingTask}
        onSegmentDelete={onSegmentDelete}
        deletingSegmentId={deletingSegmentId}
        activeScrubbingIndex={activeScrubbingIndex}
        onScrubbingStart={handleScrubbingStart}
        scrubbing={scrubbing}
        lightboxPanel={
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
        }
      />
    </>
  );
};
