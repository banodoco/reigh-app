import { useRef, useState, useEffect, useCallback } from 'react';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';
import { usePrefetchTaskData } from '@/shared/hooks/useTaskPrefetch';
import { getPairInfo, getTimelineDimensions, calculateNewVideoPlacement, TRAILING_ENDPOINT_KEY } from '../utils/timeline-utils';
import { useZoom } from './useZoom';
import { useUnifiedDrop } from './useUnifiedDrop';
import { useTimelineDrag } from './useTimelineDrag';
import { useGlobalEvents } from './useGlobalEvents';
import { useTimelineSelection } from './useTimelineSelection';
import { usePendingFrames } from './usePendingFrames';
import { useEndpointDrag } from './useEndpointDrag';
import { useTapToMove } from './useTapToMove';
import { useComputedTimelineData } from './useComputedTimelineData';
import type { GenerationRow } from '@/types/shots';
import type { PairData } from '../TimelineContainer/types';
import type { Resource, StructureVideoMetadata } from '@/shared/hooks/useResources';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { VideoMetadata } from '@/shared/lib/videoUploader';

interface UseTimelineOrchestratorProps {
  shotId: string;
  projectId?: string;
  images: GenerationRow[];
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  onFileDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  setIsDragInProgress: (dragging: boolean) => void;
  onImageDuplicate: (imageId: string, timeline_frame: number) => void;
  readOnly?: boolean;
  isUploadingImage?: boolean;
  maxFrameLimit?: number;
  /** Whether a trailing video already exists (affects timeline dimensions) */
  hasExistingTrailingVideo?: boolean;
  // Structure video props for video browser handler
  structureVideos?: StructureVideoConfigWithMetadata[];
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
}

interface UseTimelineOrchestratorReturn {
  // Refs
  timelineRef: React.RefObject<HTMLDivElement>;
  containerRef: React.RefObject<HTMLDivElement>;

  // Dimensions
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;

  // Drag state
  dragState: { isDragging: boolean; activeId: string | null };
  dragOffset: number;
  currentDragFrame: number | null;
  swapTargetId: string | null;
  pushMode: 'right' | 'left' | null;
  handleMouseDown: (e: React.MouseEvent, id: string, containerRef: React.RefObject<HTMLDivElement>) => void;

  // Zoom state
  zoomLevel: number;
  handleZoomInToCenter: () => void;
  handleZoomOutFromCenter: () => void;
  handleZoomReset: () => void;
  handleZoomToStart: () => void;
  handleTimelineDoubleClick: (e: React.MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => void;

  // Selection state
  selectedIds: string[];
  showSelectionBar: boolean;
  isSelected: (id: string) => boolean;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;

  // Pending state
  pendingDropFrame: number | null;
  pendingDuplicateFrame: number | null;
  pendingExternalAddFrame: number | null;
  activePendingFrame: number | null;
  isInternalDropProcessing: boolean;

  // Drop state
  isFileOver: boolean;
  dropTargetFrame: number | null;
  dragType: string | null;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent, containerRef: React.RefObject<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, containerRef: React.RefObject<HTMLDivElement>) => void;

  // Computed data
  currentPositions: Map<string, number>;
  pairInfo: ReturnType<typeof getPairInfo>;
  pairDataByIndex: Map<number, PairData>;
  localShotGenPositions: Map<string, number>;
  showPairLabels: boolean;

  // Handlers
  handleImageDropInterceptor: (files: File[], targetFrame?: number) => Promise<void>;
  handleGenerationDropInterceptor: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  handleDuplicateInterceptor: (imageId: string, timeline_frame: number) => void;
  handleTapToMoveAction: (imageId: string, targetFrame: number) => Promise<void>;
  handleTapToMoveMultiAction: (imageIds: string[], targetFrame: number) => Promise<void>;
  handleTimelineTapToMove: (clientX: number) => void;
  handleVideoBrowserSelect: (resource: Resource) => void;
  handleEndpointMouseDown: (e: React.MouseEvent, endpointId: string) => void;

  // Endpoint drag state (visual-only during drag, persisted on mouseup)
  endpointDragFrame: number | null;
  isEndpointDragging: boolean;

  // Local state
  resetGap: number;
  setResetGap: (value: number) => void;
  maxGap: number;
  showVideoBrowser: boolean;
  setShowVideoBrowser: (value: boolean) => void;
  isUploadingStructureVideo: boolean;
  setIsUploadingStructureVideo: (value: boolean) => void;

  // Device info
  isMobile: boolean;
  isTablet: boolean;
  enableTapToMove: boolean;
  prefetchTaskData: (generationId: string) => void;
}

export function useTimelineOrchestrator({
  shotId,
  images,
  framePositions,
  setFramePositions,
  onImageReorder,
  onFileDrop,
  onGenerationDrop,
  setIsDragInProgress,
  onImageDuplicate,
  readOnly = false,
  isUploadingImage = false,
  maxFrameLimit = 81,
  structureVideos,
  structureVideoType = 'flow',
  structureVideoTreatment = 'adjust',
  structureVideoMotionStrength = 1.0,
  onAddStructureVideo,
  onUpdateStructureVideo,
  onStructureVideoChange,
  hasExistingTrailingVideo = false,
}: UseTimelineOrchestratorProps): UseTimelineOrchestratorReturn {
  // Local state
  const [resetGap, setResetGap] = useState<number>(50);
  const maxGap = 81;
  const [showVideoBrowser, setShowVideoBrowser] = useState(false);
  const [isUploadingStructureVideo, setIsUploadingStructureVideo] = useState(false);

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragJustEndedRef = useRef(false);
  const dragEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartDimensionsRef = useRef<{ fullMin: number; fullMax: number; fullRange: number } | null>(null);
  const isEndpointDraggingRef = useRef(false);

  // Device detection
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const enableTapToMove = isTablet && !readOnly;
  const prefetchTaskData = usePrefetchTaskData();

  // Pending frames hook
  const {
    pendingDropFrame,
    setPendingDropFrame,
    pendingDuplicateFrame,
    setPendingDuplicateFrame,
    pendingExternalAddFrame,
    isInternalDropProcessing,
    setIsInternalDropProcessing,
    activePendingFrame,
  } = usePendingFrames({ shotId, images, isUploadingImage });

  // Multi-select state
  const {
    selectedIds,
    showSelectionBar,
    isSelected,
    toggleSelection,
    clearSelection,
    lockSelection,
    unlockSelection,
  } = useTimelineSelection({ isEnabled: !readOnly });

  // Calculate coordinate system
  // Compute effective end frame for trailing segment's timeline extent
  // The trailing endpoint is now in framePositions (as TRAILING_ENDPOINT_KEY), so
  // getTimelineDimensions picks it up automatically. But for single-image mode without
  // a saved end_frame, we still need to expand the timeline to show the default trailing region.
  const isMultiImage = images.length > 1;
  const trailingDefaultOffset = isMultiImage ? 17 : 49;
  const trailingEffectiveEnd = (() => {
    if (images.length === 0) return null;
    // If trailing is already in positions, getTimelineDimensions handles it
    if (framePositions.has(TRAILING_ENDPOINT_KEY)) return null;
    // For multi-image without trailing, only include for existing video
    if (isMultiImage && !hasExistingTrailingVideo) return null;
    // Single-image without saved end_frame: use default offset for minimum timeline extent
    const imageValues = [...framePositions.entries()]
      .filter(([id]) => id !== TRAILING_ENDPOINT_KEY)
      .map(([, v]) => v);
    return (Math.max(...imageValues, 0) + trailingDefaultOffset);
  })();

  const rawDimensions = getTimelineDimensions(
    framePositions,
    [
      pendingDropFrame,
      pendingDuplicateFrame,
      pendingExternalAddFrame,
      trailingEffectiveEnd
    ]
  );

  const containerWidth = containerRef.current?.clientWidth || 1000;
  const containerRect = containerRef.current?.getBoundingClientRect() || null;

  // Drag hook
  const {
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    pushMode,
    dynamicPositions,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useTimelineDrag({
    framePositions,
    setFramePositions,
    images,
    onImageReorder,
    fullMin: rawDimensions.fullMin,
    fullMax: rawDimensions.fullMax,
    fullRange: rawDimensions.fullRange,
    containerRect,
    setIsDragInProgress,
    selectedIds,
    onDragStart: lockSelection,
    onDragEnd: unlockSelection,
  });

  // Frozen dimensions during drag
  useEffect(() => {
    if (dragState.isDragging && dragState.activeId && !dragStartDimensionsRef.current) {
      dragStartDimensionsRef.current = {
        fullMin: rawDimensions.fullMin,
        fullMax: rawDimensions.fullMax,
        fullRange: rawDimensions.fullRange,
      };
    } else if (!dragState.isDragging && !isEndpointDraggingRef.current && dragStartDimensionsRef.current) {
      dragStartDimensionsRef.current = null;
    }
  }, [dragState.isDragging, dragState.activeId, rawDimensions.fullMin, rawDimensions.fullMax, rawDimensions.fullRange]);

  const isDraggingAnything = dragState.isDragging || isEndpointDraggingRef.current;

  let fullMin = rawDimensions.fullMin;
  let fullMax = rawDimensions.fullMax;
  let fullRange = rawDimensions.fullRange;

  if (isDraggingAnything && dragStartDimensionsRef.current) {
    fullMax = Math.max(rawDimensions.fullMax, dragStartDimensionsRef.current.fullMax);
    fullMin = Math.min(rawDimensions.fullMin, dragStartDimensionsRef.current.fullMin);
    fullRange = fullMax - fullMin;
  }

  // Zoom hook
  const {
    zoomLevel,
    zoomCenter,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
    isZooming,
  } = useZoom({ fullMin, fullMax, fullRange, containerRef: timelineRef });

  // Custom zoom handlers that preserve viewport center
  const handleZoomInToCenter = useCallback(() => {
    const scrollContainer = timelineRef.current;
    const timelineContainer = containerRef.current;
    if (!scrollContainer || !timelineContainer) {
      handleZoomIn(fullMin);
      return;
    }
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollWidth = timelineContainer.scrollWidth;
    const viewportWidth = scrollContainer.clientWidth;
    const viewportCenterPixel = scrollLeft + (viewportWidth / 2);
    const viewportCenterFraction = scrollWidth > 0 ? viewportCenterPixel / scrollWidth : 0;
    const viewportCenterFrame = fullMin + (viewportCenterFraction * fullRange);
    handleZoomIn(viewportCenterFrame);
  }, [fullMin, fullRange, handleZoomIn]);

  const handleZoomOutFromCenter = useCallback(() => {
    const scrollContainer = timelineRef.current;
    const timelineContainer = containerRef.current;
    if (!scrollContainer || !timelineContainer) {
      handleZoomOut(fullMin);
      return;
    }
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollWidth = timelineContainer.scrollWidth;
    const viewportWidth = scrollContainer.clientWidth;
    const viewportCenterPixel = scrollLeft + (viewportWidth / 2);
    const viewportCenterFraction = scrollWidth > 0 ? viewportCenterPixel / scrollWidth : 0;
    const viewportCenterFrame = fullMin + (viewportCenterFraction * fullRange);
    handleZoomOut(viewportCenterFrame);
  }, [fullMin, fullRange, handleZoomOut]);

  // Force re-render when zoom changes
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const timer = setTimeout(() => forceUpdate({}), 0);
    return () => clearTimeout(timer);
  }, [zoomLevel]);

  // Global events hook
  useGlobalEvents({
    isDragging: dragState.isDragging,
    activeId: dragState.activeId,
    shotId,
    handleMouseMove,
    handleMouseUp,
    containerRef
  });

  // Track when drag ends to prevent scroll jumps
  useEffect(() => {
    if (!dragState.isDragging && dragState.activeId === null) {
      dragJustEndedRef.current = true;
      if (dragEndTimeoutRef.current) clearTimeout(dragEndTimeoutRef.current);
      dragEndTimeoutRef.current = setTimeout(() => {
        dragJustEndedRef.current = false;
      }, 500);
    }
    return () => {
      if (dragEndTimeoutRef.current) clearTimeout(dragEndTimeoutRef.current);
    };
  }, [dragState.isDragging, dragState.activeId]);

  // Scroll timeline to center on zoom (only during active zoom, not dimension changes)
  useEffect(() => {
    if (!isZooming || dragState.isDragging || dragJustEndedRef.current || zoomLevel <= 1) return;
    if (timelineRef.current && containerRef.current) {
      const timer = setTimeout(() => {
        if (dragJustEndedRef.current) return;
        const scrollContainer = timelineRef.current;
        const timelineContainer = containerRef.current;
        if (!scrollContainer || !timelineContainer) return;
        const scrollWidth = timelineContainer.scrollWidth;
        const scrollContainerWidth = scrollContainer.clientWidth;
        const centerFraction = (zoomCenter - fullMin) / fullRange;
        const centerPixelInZoomedTimeline = centerFraction * scrollWidth;
        const targetScroll = centerPixelInZoomedTimeline - (scrollContainerWidth / 2);
        scrollContainer.scrollTo({ left: Math.max(0, targetScroll), behavior: 'instant' });
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isZooming, zoomLevel, zoomCenter, fullMin, fullRange, dragState.isDragging]);

  // Drop interceptors
  const handleImageDropInterceptor = useCallback(async (files: File[], targetFrame?: number) => {
    if (targetFrame !== undefined) setPendingDropFrame(targetFrame);
    if (onFileDrop) await onFileDrop(files, targetFrame);
  }, [onFileDrop, setPendingDropFrame]);

  const handleGenerationDropInterceptor = useCallback(async (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number
  ) => {
    if (targetFrame !== undefined) {
      setPendingDropFrame(targetFrame);
      setIsInternalDropProcessing(true);
    }
    try {
      if (onGenerationDrop) await onGenerationDrop(generationId, imageUrl, thumbUrl, targetFrame);
    } finally {
      setIsInternalDropProcessing(false);
      setPendingDropFrame(null);
    }
  }, [onGenerationDrop, setPendingDropFrame, setIsInternalDropProcessing]);

  // Duplicate interceptor
  const handleDuplicateInterceptor = useCallback((imageId: string, timeline_frame: number) => {
    const sortedImages = [...images]
      .filter(img => img.timeline_frame !== undefined && img.timeline_frame !== null)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    const currentIndex = sortedImages.findIndex(img => img.timeline_frame === timeline_frame);
    const nextImage = currentIndex >= 0 && currentIndex < sortedImages.length - 1
      ? sortedImages[currentIndex + 1]
      : null;
    const DEFAULT_DUPLICATE_GAP = 30;
    let duplicateTargetFrame: number;

    // For single image, duplicate to the trailing endpoint position
    if (images.length === 1) {
      duplicateTargetFrame = framePositions.get(TRAILING_ENDPOINT_KEY) ?? (timeline_frame + 49);
    } else if (nextImage && nextImage.timeline_frame !== undefined) {
      duplicateTargetFrame = Math.floor((timeline_frame + nextImage.timeline_frame) / 2);
    } else {
      duplicateTargetFrame = timeline_frame + DEFAULT_DUPLICATE_GAP;
    }

    // Apply collision avoidance (same logic as server-side mutation)
    // This ensures skeleton position matches where item will actually appear
    const existingFrames = new Set(
      images
        .map(img => img.timeline_frame)
        .filter((f): f is number => f !== null && f !== undefined)
    );

    let finalFrame = Math.max(0, Math.round(duplicateTargetFrame));
    if (existingFrames.has(finalFrame)) {
      let offset = 1;
      while (offset < 1000) {
        const higher = finalFrame + offset;
        if (!existingFrames.has(higher)) {
          finalFrame = higher;
          break;
        }
        const lower = finalFrame - offset;
        if (lower >= 0 && !existingFrames.has(lower)) {
          finalFrame = lower;
          break;
        }
        offset += 1;
      }
    }

    setPendingDuplicateFrame(finalFrame);
    onImageDuplicate(imageId, finalFrame);
  }, [images, onImageDuplicate, setPendingDuplicateFrame, framePositions]);

  // Unified drop hook
  const {
    isFileOver,
    dropTargetFrame,
    dragType,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useUnifiedDrop({
    onFileDrop: handleImageDropInterceptor,
    onGenerationDrop: handleGenerationDropInterceptor,
    fullMin,
    fullRange
  });

  // Adjust resetGap when maxGap changes
  useEffect(() => {
    if (resetGap > maxGap) setResetGap(maxGap);
  }, [maxGap, resetGap]);

  // Tap-to-move handlers (extracted hook)
  const {
    handleTapToMoveAction,
    handleTapToMoveMultiAction,
    handleTimelineTapToMove,
  } = useTapToMove({
    enableTapToMove,
    framePositions,
    setFramePositions,
    fullMin,
    fullMax,
    fullRange,
    containerWidth,
    selectedIds,
    clearSelection,
    containerRef,
  });

  // Video browser resource select handler
  const handleVideoBrowserSelect = useCallback((resource: Resource) => {
    const metadata = resource.metadata as StructureVideoMetadata;
    if (onAddStructureVideo && metadata.videoMetadata) {
      const placement = calculateNewVideoPlacement(
        metadata.videoMetadata.total_frames,
        structureVideos,
        fullMax
      );

      // Apply clipping to last video if needed
      if (placement.lastVideoUpdate && onUpdateStructureVideo) {
        onUpdateStructureVideo(placement.lastVideoUpdate.index, {
          end_frame: placement.lastVideoUpdate.newEndFrame,
        });
      }

      onAddStructureVideo({
        path: metadata.videoUrl,
        start_frame: placement.start_frame,
        end_frame: placement.end_frame,
        treatment: 'adjust',
        motion_strength: 1.0,
        structure_type: structureVideoType,
        metadata: metadata.videoMetadata,
        resource_id: resource.id,
      });
    } else if (onStructureVideoChange) {
      onStructureVideoChange(
        metadata.videoUrl,
        metadata.videoMetadata,
        structureVideoTreatment,
        structureVideoMotionStrength,
        structureVideoType
      );
    }
    setShowVideoBrowser(false);
  }, [fullMax, structureVideos, structureVideoType, structureVideoTreatment, structureVideoMotionStrength, onAddStructureVideo, onUpdateStructureVideo, onStructureVideoChange]);

  // Endpoint drag (extracted hook)
  const {
    endpointDragFrame,
    isEndpointDragging,
    handleEndpointMouseDown,
  } = useEndpointDrag({
    readOnly,
    fullMin,
    fullMax,
    fullRange,
    containerWidth,
    maxFrameLimit,
    dynamicPositions,
    framePositions,
    setFramePositions,
    containerRef,
    dragStartDimensionsRef,
    isEndpointDraggingRef,
  });

  // Computed timeline data (extracted hook)
  const currentPositions = dynamicPositions();
  const {
    pairInfo,
    pairDataByIndex,
    localShotGenPositions,
    showPairLabels,
  } = useComputedTimelineData({
    currentPositions,
    images,
    shotId,
    containerWidth,
    fullRange,
    zoomLevel,
  });

  return {
    // Refs
    timelineRef,
    containerRef,

    // Dimensions
    fullMin,
    fullMax,
    fullRange,
    containerWidth,

    // Drag state
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    pushMode,
    handleMouseDown,

    // Zoom state
    zoomLevel,
    handleZoomInToCenter,
    handleZoomOutFromCenter,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,

    // Selection state
    selectedIds,
    showSelectionBar,
    isSelected,
    toggleSelection,
    clearSelection,

    // Pending state
    pendingDropFrame,
    pendingDuplicateFrame,
    pendingExternalAddFrame,
    activePendingFrame,
    isInternalDropProcessing,

    // Drop state
    isFileOver,
    dropTargetFrame,
    dragType,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,

    // Computed data
    currentPositions,
    pairInfo,
    pairDataByIndex,
    localShotGenPositions,
    showPairLabels,

    // Handlers
    handleImageDropInterceptor,
    handleGenerationDropInterceptor,
    handleDuplicateInterceptor,
    handleTapToMoveAction,
    handleTapToMoveMultiAction,
    handleTimelineTapToMove,
    handleVideoBrowserSelect,
    handleEndpointMouseDown,

    // Endpoint drag state (visual-only during drag, persisted on mouseup)
    endpointDragFrame,
    isEndpointDragging,

    // Local state
    resetGap,
    setResetGap,
    maxGap,
    showVideoBrowser,
    setShowVideoBrowser,
    isUploadingStructureVideo,
    setIsUploadingStructureVideo,

    // Device info
    isMobile,
    isTablet,
    enableTapToMove,
    prefetchTaskData,
  };
}
