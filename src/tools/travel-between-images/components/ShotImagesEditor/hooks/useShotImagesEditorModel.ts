import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { usePendingSegmentTasks } from '@/shared/hooks/tasks/usePendingSegmentTasks';
import { useSegmentOutputsForShot } from '@/shared/hooks/segments';
import { useDownloadImages } from './useDownloadImages';
import { useLightboxTransition } from './useLightboxTransition';
import { usePreviewSegments } from './usePreviewSegments';
import { useSegmentSlotMode } from './useSegmentSlotMode';
import { useShotGenerationsData } from './useShotGenerationsData';
import { useSmoothContinuations } from './useSmoothContinuations';
import type { ShotImagesEditorResolvedProps } from '../types';
import type { TimelineMediaContextValue } from '../../Timeline/TimelineMediaContext';
import { resolvePrimaryStructureVideo } from '@/shared/lib/tasks/travelBetweenImages';

function useShotData(
  props: ShotImagesEditorResolvedProps,
  effectiveGenerationMode: 'batch' | 'timeline' | 'by-pair',
) {
  const {
    selectedShotId,
    projectId,
    preloadedImages,
    selectedOutputId,
    onSelectedOutputChange,
    readOnly,
  } = props;

  const shotData = useShotGenerationsData({
    selectedShotId,
    projectId,
    generationMode: effectiveGenerationMode,
    preloadedImages,
  });

  const {
    shotGenerations,
    memoizedShotGenerations,
    imagesWithBadges,
    pairPrompts,
    isLoading: positionsLoading,
    updateTimelineFrame,
    batchExchangePositions,
    moveItemsToMidpoint,
    deleteItem,
    loadPositions,
    clearEnhancedPrompt,
    getImagesForMode,
    hasEverHadData,
  } = shotData;

  const { lastImageShotGenId } = useMemo(() => {
    const positioned = shotGenerations
      .filter((generation) => generation.timeline_frame != null && generation.timeline_frame >= 0)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    return {
      lastImageShotGenId: positioned[positioned.length - 1]?.id ?? null,
    };
  }, [shotGenerations]);

  const segmentOutputData = useSegmentOutputsForShot(
    selectedShotId,
    projectId || '',
    undefined,
    selectedOutputId,
    onSelectedOutputChange,
    readOnly ? preloadedImages : undefined,
    lastImageShotGenId ?? undefined,
  );

  const pendingSegmentData = usePendingSegmentTasks(selectedShotId, projectId || null);

  return {
    shotGenerations,
    memoizedShotGenerations,
    imagesWithBadges,
    pairPrompts,
    positionsLoading,
    updateTimelineFrame,
    batchExchangePositions,
    moveItemsToMidpoint,
    deleteItem,
    loadPositions,
    clearEnhancedPrompt,
    getImagesForMode,
    hasEverHadData,
    segmentSlots: segmentOutputData.segmentSlots,
    selectedParentId: segmentOutputData.selectedParentId,
    isSegmentsLoading: segmentOutputData.isLoading,
    addOptimisticPending: pendingSegmentData.addOptimisticPending,
    hasPendingTask: pendingSegmentData.hasPendingTask,
  };
}

function usePruneOffscreenStructureVideos(
  props: ShotImagesEditorResolvedProps,
  effectiveGenerationMode: 'batch' | 'timeline' | 'by-pair',
  shotGenerations: Array<{ timeline_frame?: number | null }>,
  positionsLoading: boolean,
) {
  const { structureVideos, onSetStructureVideos, selectedShotId } = props;

  const pruneRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !structureVideos?.length
      || !onSetStructureVideos
      || !shotGenerations.length
      || positionsLoading
      || effectiveGenerationMode !== 'timeline'
    ) {
      return;
    }

    if (pruneRef.current === selectedShotId) {
      return;
    }

    const maxFrame = Math.max(...shotGenerations.map((generation) => generation.timeline_frame ?? 0));
    if (maxFrame <= 0) {
      return;
    }

    const visible = structureVideos.filter((video) => (video.start_frame ?? 0) < maxFrame);
    if (visible.length < structureVideos.length) {
      onSetStructureVideos(visible);
    }

    pruneRef.current = selectedShotId;
  }, [
    structureVideos,
    onSetStructureVideos,
    shotGenerations,
    positionsLoading,
    effectiveGenerationMode,
    selectedShotId,
  ]);
}

function useModeOrchestration(
  props: ShotImagesEditorResolvedProps,
  data: ReturnType<typeof useShotData>,
  effectiveGenerationMode: 'batch' | 'timeline' | 'by-pair',
  resolvedProjectResolution: string | undefined,
  trailingFrameUpdateRef: MutableRefObject<((endFrame: number) => void) | null>,
) {
  const {
    selectedShotId,
    projectId,
    batchVideoFrames,
    defaultPrompt = '',
    defaultNegativePrompt = '',
    structureVideos,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    onSetStructureVideos,
    maxFrameLimit = 81,
    shotName,
    smoothContinuations = false,
    readOnly = false,
  } = props;

  const {
    shotGenerations,
    segmentSlots,
    selectedParentId,
    loadPositions,
    addOptimisticPending,
    updateTimelineFrame,
    imagesWithBadges,
  } = data;

  const [previewInitialPairIndex, setPreviewInitialPairIndex] = useState<number | null>(null);

  const {
    transitionOverlayRef,
    completeTransition,
    navigateWithTransition,
  } = useLightboxTransition();

  const openPreviewRef = useRef<((startAtPairIndex: number) => void) | null>(null);
  const handleOpenPreviewFromLightbox = useCallback((startAtPairIndex: number) => {
    openPreviewRef.current?.(startAtPairIndex);
  }, []);

  const segmentSlot = useSegmentSlotMode({
    selectedShotId,
    projectId,
    effectiveGenerationMode,
    maxFrameLimit,
    resolvedProjectResolution,
    batchVideoFrames,
    shotGenerations,
    segmentSlots,
    selectedParentId,
    defaultPrompt,
    defaultNegativePrompt,
    structureVideos,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    onSetStructureVideos,
    loadPositions,
    navigateWithTransition,
    addOptimisticPending,
    trailingFrameUpdateRef,
    onOpenPreviewDialog: handleOpenPreviewFromLightbox,
  });

  const preview = usePreviewSegments({
    generationMode: effectiveGenerationMode,
    batchVideoFrames,
    shotGenerations,
    segmentSlots,
  });

  openPreviewRef.current = (startAtPairIndex: number) => {
    segmentSlot.setSegmentSlotLightboxIndex(null);
    setPreviewInitialPairIndex(startAtPairIndex);
    preview.setIsPreviewTogetherOpen(true);
  };

  const download = useDownloadImages({
    images: imagesWithBadges,
    shotName,
  });

  useSmoothContinuations({
    smoothContinuations,
    images: imagesWithBadges,
    maxFrameLimit,
    updateTimelineFrame,
    readOnly,
  });

  const handleClearPendingImageToOpen = useCallback(() => {
    segmentSlot.setPendingImageToOpen(null);
    completeTransition(200);
  }, [completeTransition, segmentSlot]);

  return {
    transitionOverlayRef,
    navigateWithTransition,
    segmentSlot,
    preview,
    previewInitialPairIndex,
    setPreviewInitialPairIndex,
    download,
    handleClearPendingImageToOpen,
  };
}

function useTimelineMediaValue(props: ShotImagesEditorResolvedProps) {
  const {
    onPrimaryStructureVideoInputChange,
    structureVideos,
    isStructureVideoLoading,
    cachedHasStructureVideo,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    audioUrl,
    audioMetadata,
    onAudioChange,
  } = props;

  const primaryStructureVideo = useMemo(
    () => resolvePrimaryStructureVideo(structureVideos, props.structureGuidance),
    [props.structureGuidance, structureVideos],
  );

  return useMemo<TimelineMediaContextValue>(() => ({
    primaryStructureVideo,
    onPrimaryStructureVideoInputChange,
    structureVideos,
    isStructureVideoLoading,
    cachedHasStructureVideo,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    audioUrl,
    audioMetadata,
    onAudioChange,
  }), [
    primaryStructureVideo,
    onPrimaryStructureVideoInputChange,
    structureVideos,
    isStructureVideoLoading,
    cachedHasStructureVideo,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    audioUrl,
    audioMetadata,
    onAudioChange,
  ]);
}

export type ShotImagesEditorDataModel = ReturnType<typeof useShotData>;
export type ShotImagesEditorModeModel = ReturnType<typeof useModeOrchestration>;

export function useShotImagesEditorModel(
  props: ShotImagesEditorResolvedProps,
  effectiveGenerationMode: 'batch' | 'timeline' | 'by-pair',
  resolvedProjectResolution: string | undefined,
  trailingFrameUpdateRef: MutableRefObject<((endFrame: number) => void) | null>,
) {
  const data = useShotData(props, effectiveGenerationMode);

  usePruneOffscreenStructureVideos(
    props,
    effectiveGenerationMode,
    data.shotGenerations,
    data.positionsLoading,
  );

  const mode = useModeOrchestration(
    props,
    data,
    effectiveGenerationMode,
    resolvedProjectResolution,
    trailingFrameUpdateRef,
  );

  const timelineMediaValue = useTimelineMediaValue(props);

  return {
    data,
    mode,
    timelineMediaValue,
  };
}
