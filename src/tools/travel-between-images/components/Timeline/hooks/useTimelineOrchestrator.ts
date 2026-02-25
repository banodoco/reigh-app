import { useCallback, useEffect, useRef } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useIsMobile, useIsTablet } from '@/shared/hooks/mobile';
import { usePrefetchTaskData } from '@/shared/hooks/useTaskPrefetch';
import {
  calculateNewVideoPlacement,
  getTrailingEffectiveEnd,
  getPairInfo,
  getTimelineDimensions,
  TRAILING_ENDPOINT_KEY,
} from '../utils/timeline-utils';
import { calculateDuplicateFrame } from '@/shared/lib/timelinePositionCalculator';
import { useTimelineDrag } from './useTimelineDrag';
import { useTimelineSelection } from './useTimelineSelection';
import { usePendingFrames } from './usePendingFrames';
import { useComputedTimelineData } from './useComputedTimelineData';
import { useTimelineUiState } from './useTimelineUiState';
import { useEndpointDrag } from './useEndpointDrag';
import { useTapToMove } from './useTapToMove';
import { useTimelineViewportController } from './useTimelineViewportController';
import { useUnifiedDrop } from './useUnifiedDrop';
import type { GenerationRow } from '@/domains/generation/types';
import type { PairData } from '../TimelineContainer/types';
import type { Resource, StructureVideoMetadata } from '@/shared/hooks/useResources';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { DragType } from '@/shared/lib/dnd/dragDrop';

interface UseTimelineOrchestratorProps {
  shotId: string;
  projectId?: string;
  images: GenerationRow[];
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  onFileDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  onGenerationDrop?: (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number,
  ) => Promise<void>;
  setIsDragInProgress: (dragging: boolean) => void;
  onImageDuplicate: (imageId: string, timeline_frame: number) => void;
  readOnly?: boolean;
  isUploadingImage?: boolean;
  maxFrameLimit?: number;
  hasExistingTrailingVideo?: boolean;
  structureVideos?: StructureVideoConfigWithMetadata[];
  primaryStructureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  primaryStructureVideoTreatment?: 'adjust' | 'clip';
  primaryStructureVideoMotionStrength?: number;
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onPrimaryStructureVideoInputChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string,
  ) => void;
}

interface UseTimelineOrchestratorReturn {
  refs: {
    timelineRef: RefObject<HTMLDivElement>;
    containerRef: RefObject<HTMLDivElement>;
  };
  viewport: {
    fullMin: number;
    fullMax: number;
    fullRange: number;
    containerWidth: number;
    zoomLevel: number;
    handleZoomInToCenter: () => void;
    handleZoomOutFromCenter: () => void;
    handleZoomReset: () => void;
    handleZoomToStart: () => void;
    handleTimelineDoubleClick: (e: ReactMouseEvent<HTMLDivElement>, containerRef: RefObject<HTMLDivElement>) => void;
  };
  drag: {
    state: { isDragging: boolean; activeId: string | null };
    dragOffset: { x: number; y: number } | null;
    currentDragFrame: number | null;
    swapTargetId: string | null;
    pushMode: 'right' | 'left' | null;
    handleMouseDown: (e: ReactMouseEvent, id: string, containerRef: RefObject<HTMLDivElement>) => void;
  };
  selection: {
    selectedIds: string[];
    showSelectionBar: boolean;
    isSelected: (id: string) => boolean;
    toggleSelection: (id: string) => void;
    clearSelection: () => void;
  };
  pending: {
    pendingDropFrame: number | null;
    pendingDuplicateFrame: number | null;
    pendingExternalAddFrame: number | null;
    activePendingFrame: number | null;
    isInternalDropProcessing: boolean;
  };
  drop: {
    isFileOver: boolean;
    dropTargetFrame: number | null;
    dragType: DragType;
    handleDragEnter: (e: DragEvent<HTMLDivElement>) => void;
    handleDragOver: (e: DragEvent<HTMLDivElement>, containerRef: RefObject<HTMLDivElement>) => void;
    handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
    handleDrop: (e: DragEvent<HTMLDivElement>, containerRef: RefObject<HTMLDivElement>) => Promise<void>;
  };
  computed: {
    currentPositions: Map<string, number>;
    pairInfo: ReturnType<typeof getPairInfo>;
    pairDataByIndex: Map<number, PairData>;
    localShotGenPositions: Map<string, number>;
    showPairLabels: boolean;
  };
  actions: {
    handleImageDropInterceptor: (files: File[], targetFrame?: number) => Promise<void>;
    handleGenerationDropInterceptor: (
      generationId: string,
      imageUrl: string,
      thumbUrl: string | undefined,
      targetFrame?: number,
    ) => Promise<void>;
    handleDuplicateInterceptor: (imageId: string, timelineFrame: number) => void;
    handleTapToMoveAction: (imageId: string, targetFrame: number) => Promise<void>;
    handleTapToMoveMultiAction: (imageIds: string[], targetFrame: number) => Promise<void>;
    handleTimelineTapToMove: (clientX: number) => void;
    handleVideoBrowserSelect: (resource: Resource) => void;
    handleEndpointMouseDown: (e: ReactMouseEvent, endpointId: string) => void;
  };
  endpoint: {
    endpointDragFrame: number | null;
    isEndpointDragging: boolean;
  };
  uiState: {
    resetGap: number;
    setResetGap: (value: number) => void;
    maxGap: number;
    showVideoBrowser: boolean;
    setShowVideoBrowser: (value: boolean) => void;
    isUploadingStructureVideo: boolean;
    setIsUploadingStructureVideo: (value: boolean) => void;
  };
  device: {
    isMobile: boolean;
    isTablet: boolean;
    enableTapToMove: boolean;
    prefetchTaskData: (generationId: string) => void;
  };
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
  primaryStructureVideoType = 'flow',
  primaryStructureVideoTreatment = 'adjust',
  primaryStructureVideoMotionStrength = 1.0,
  onAddStructureVideo,
  onUpdateStructureVideo,
  onPrimaryStructureVideoInputChange,
  hasExistingTrailingVideo = false,
}: UseTimelineOrchestratorProps): UseTimelineOrchestratorReturn {
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isEndpointDraggingRef = useRef(false);

  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const enableTapToMove = isTablet && !readOnly;
  const prefetchTaskData = usePrefetchTaskData();

  const uiState = useTimelineUiState();
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

  const {
    selectedIds,
    showSelectionBar,
    isSelected,
    toggleSelection,
    clearSelection,
    lockSelection,
    unlockSelection,
  } = useTimelineSelection({ isEnabled: !readOnly });

  const trailingEffectiveEnd = getTrailingEffectiveEnd({
    framePositions,
    imagesCount: images.length,
    hasExistingTrailingVideo,
  });
  const rawDimensions = getTimelineDimensions(
    framePositions,
    [pendingDropFrame, pendingDuplicateFrame, pendingExternalAddFrame, trailingEffectiveEnd],
  );
  const containerRect = containerRef.current?.getBoundingClientRect() || null;

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

  const viewport = useTimelineViewportController({
    framePositions,
    pendingDropFrame,
    pendingDuplicateFrame,
    pendingExternalAddFrame,
    imagesCount: images.length,
    hasExistingTrailingVideo,
    timelineRef,
    containerRef,
    isEndpointDraggingRef,
    dragState,
    shotId,
    handleMouseMove,
    handleMouseUp,
  });

  useEffect(() => {
    if (uiState.resetGap > uiState.maxGap) {
      uiState.setResetGap(uiState.maxGap);
    }
  }, [uiState]);

  const handleImageDropInterceptor = useCallback(async (files: File[], targetFrame?: number) => {
    if (targetFrame !== undefined) {
      setPendingDropFrame(targetFrame);
    }
    if (onFileDrop) {
      await onFileDrop(files, targetFrame);
    }
  }, [onFileDrop, setPendingDropFrame]);

  const handleGenerationDropInterceptor = useCallback(async (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number,
  ) => {
    if (targetFrame !== undefined) {
      setPendingDropFrame(targetFrame);
      setIsInternalDropProcessing(true);
    }
    try {
      if (onGenerationDrop) {
        await onGenerationDrop(generationId, imageUrl, thumbUrl, targetFrame);
      }
    } finally {
      setIsInternalDropProcessing(false);
      setPendingDropFrame(null);
    }
  }, [onGenerationDrop, setIsInternalDropProcessing, setPendingDropFrame]);

  const drop = useUnifiedDrop({
    onFileDrop: handleImageDropInterceptor,
    onGenerationDrop: handleGenerationDropInterceptor,
    fullMin: viewport.fullMin,
    fullRange: viewport.fullRange,
  });

  const handleDuplicateInterceptor = useCallback((imageId: string, timelineFrame: number) => {
    const sortedImages = [...images]
      .filter((img) => img.timeline_frame !== undefined && img.timeline_frame !== null)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    const currentIndex = sortedImages.findIndex((img) => img.timeline_frame === timelineFrame);
    const nextImage = currentIndex >= 0 && currentIndex < sortedImages.length - 1
      ? sortedImages[currentIndex + 1]
      : null;

    const existingFrames = images
      .map((img) => img.timeline_frame)
      .filter((frame): frame is number => frame !== null && frame !== undefined);
    const nextFrame = nextImage?.timeline_frame;
    const finalFrame = calculateDuplicateFrame({
      currentFrame: timelineFrame,
      nextFrame: nextFrame ?? null,
      existingFrames,
      singleItemTrailingFrame: framePositions.get(TRAILING_ENDPOINT_KEY) ?? null,
      isSingleItem: images.length === 1,
    });

    setPendingDuplicateFrame(finalFrame);
    onImageDuplicate(imageId, finalFrame);
  }, [framePositions, images, onImageDuplicate, setPendingDuplicateFrame]);

  const {
    handleTapToMoveAction,
    handleTapToMoveMultiAction,
    handleTimelineTapToMove,
  } = useTapToMove({
    enableTapToMove,
    framePositions,
    setFramePositions,
    fullMin: viewport.fullMin,
    fullMax: viewport.fullMax,
    fullRange: viewport.fullRange,
    containerWidth: viewport.containerWidth,
    selectedIds,
    clearSelection,
    containerRef,
  });

  const handleVideoBrowserSelect = useCallback((resource: Resource) => {
    const metadata = resource.metadata as StructureVideoMetadata;
    if (onAddStructureVideo && metadata.videoMetadata) {
      const placement = calculateNewVideoPlacement(
        metadata.videoMetadata.total_frames,
        structureVideos,
        viewport.fullMax,
      );

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
        structure_type: primaryStructureVideoType,
        metadata: metadata.videoMetadata,
        resource_id: resource.id,
      });
    } else if (onPrimaryStructureVideoInputChange) {
      onPrimaryStructureVideoInputChange(
        metadata.videoUrl,
        metadata.videoMetadata,
        primaryStructureVideoTreatment,
        primaryStructureVideoMotionStrength,
        primaryStructureVideoType,
      );
    }
    uiState.setShowVideoBrowser(false);
  }, [
    onAddStructureVideo,
    onPrimaryStructureVideoInputChange,
    onUpdateStructureVideo,
    primaryStructureVideoMotionStrength,
    primaryStructureVideoTreatment,
    primaryStructureVideoType,
    structureVideos,
    uiState,
    viewport.fullMax,
  ]);

  const {
    endpointDragFrame,
    isEndpointDragging,
    handleEndpointMouseDown,
  } = useEndpointDrag({
    readOnly,
    fullMin: viewport.fullMin,
    fullMax: viewport.fullMax,
    fullRange: viewport.fullRange,
    containerWidth: viewport.containerWidth,
    maxFrameLimit,
    dynamicPositions,
    framePositions,
    setFramePositions,
    containerRef,
    dragStartDimensionsRef: viewport.dragStartDimensionsRef,
    isEndpointDraggingRef,
  });

  const currentPositions = dynamicPositions();
  const {
    pairInfo,
    pairDataByIndex,
    localShotGenPositions,
    showPairLabels,
  } = useComputedTimelineData({
    currentPositions,
    images,
    containerWidth: viewport.containerWidth,
    fullRange: viewport.fullRange,
    zoomLevel: viewport.zoomLevel,
  });

  return {
    refs: {
      timelineRef,
      containerRef,
    },
    viewport: {
      fullMin: viewport.fullMin,
      fullMax: viewport.fullMax,
      fullRange: viewport.fullRange,
      containerWidth: viewport.containerWidth,
      zoomLevel: viewport.zoomLevel,
      handleZoomInToCenter: viewport.handleZoomInToCenter,
      handleZoomOutFromCenter: viewport.handleZoomOutFromCenter,
      handleZoomReset: viewport.handleZoomReset,
      handleZoomToStart: viewport.handleZoomToStart,
      handleTimelineDoubleClick: viewport.handleTimelineDoubleClick,
    },
    drag: {
      state: dragState,
      dragOffset,
      currentDragFrame,
      swapTargetId,
      pushMode,
      handleMouseDown,
    },
    selection: {
      selectedIds,
      showSelectionBar,
      isSelected,
      toggleSelection,
      clearSelection,
    },
    pending: {
      pendingDropFrame,
      pendingDuplicateFrame,
      pendingExternalAddFrame,
      activePendingFrame,
      isInternalDropProcessing,
    },
    drop,
    computed: {
      currentPositions,
      pairInfo,
      pairDataByIndex,
      localShotGenPositions,
      showPairLabels,
    },
    actions: {
      handleImageDropInterceptor,
      handleGenerationDropInterceptor,
      handleDuplicateInterceptor,
      handleTapToMoveAction,
      handleTapToMoveMultiAction,
      handleTimelineTapToMove,
      handleVideoBrowserSelect,
      handleEndpointMouseDown,
    },
    endpoint: {
      endpointDragFrame,
      isEndpointDragging,
    },
    uiState,
    device: {
      isMobile,
      isTablet,
      enableTapToMove,
      prefetchTaskData,
    },
  };
}
