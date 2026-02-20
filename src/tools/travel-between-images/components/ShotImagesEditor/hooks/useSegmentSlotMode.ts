/**
 * Hook for managing segment slot lightbox state.
 * Orchestrates pair data, frame updates, and builds SegmentSlotModeData.
 *
 * Uses:
 * - usePairData: Pair computation
 * - useFrameCountUpdater: Frame count updates
 */

import { useState, useCallback, useEffect, useRef, useMemo, type MutableRefObject, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SegmentSlotModeData } from '@/shared/components/MediaLightbox/types';
import type { PairData } from '../../Timeline/TimelineContainer';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { GenerationRow } from '@/types/shots';
import type { SegmentSlot } from '@/shared/hooks/segments';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { usePairData } from './usePairData';
import { useFrameCountUpdater } from './useFrameCountUpdater';

export interface UseSegmentSlotModeProps {
  selectedShotId: string;
  projectId?: string;
  effectiveGenerationMode: 'batch' | 'timeline' | 'by-pair';
  batchVideoFrames: number;
  shotGenerations: GenerationRow[];
  segmentSlots: SegmentSlot[];
  selectedParentId: string | null;
  defaultPrompt: string;
  defaultNegativePrompt: string;
  resolvedProjectResolution?: string;
  structureVideos?: StructureVideoConfigWithMetadata[];
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  onSetStructureVideos?: (videos: StructureVideoConfigWithMetadata[]) => void;
  maxFrameLimit: number;
  loadPositions: (options?: { silent?: boolean; reason?: string }) => Promise<void>;
  navigateWithTransition: (doNavigation: () => void) => void;
  addOptimisticPending: (pairShotGenerationId: string) => void;
  /** Ref to trailing end frame updater from position system (for instant optimistic updates) */
  trailingFrameUpdateRef?: RefObject<((endFrame: number) => void) | null>;
  /** Callback to open preview-together dialog starting at a given pair index */
  onOpenPreviewDialog?: (startAtPairIndex: number) => void;
}

export interface UseSegmentSlotModeReturn {
  segmentSlotLightboxIndex: number | null;
  setSegmentSlotLightboxIndex: (index: number | null) => void;
  activePairData: PairData | null;
  setActivePairData: (data: PairData | null) => void;
  pendingImageToOpen: string | null;
  setPendingImageToOpen: (id: string | null) => void;
  pendingImageVariantId: string | null;
  pairDataByIndex: Map<number, PairData>;
  segmentSlotModeData: SegmentSlotModeData | null;
  handlePairClick: (pairIndex: number, passedPairData?: PairData) => void;
  updatePairFrameCount: (pairShotGenerationId: string, newFrameCount: number) => Promise<{ finalFrameCount: number } | void>;
}

interface SegmentSlotState {
  segmentSlotLightboxIndex: number | null;
  setSegmentSlotLightboxIndex: (index: number | null) => void;
  activePairData: PairData | null;
  setActivePairData: (data: PairData | null) => void;
  pendingImageToOpen: string | null;
  setPendingImageToOpen: (id: string | null) => void;
  pendingImageVariantId: string | null;
  setPendingImageVariantId: (id: string | null) => void;
}

function findCoveringStructureVideo(
  structureVideos: StructureVideoConfigWithMetadata[] | undefined,
  pairStartFrame: number,
  pairEndFrame: number,
  generationMode: UseSegmentSlotModeProps['effectiveGenerationMode'],
) {
  return (structureVideos || []).find(video => {
    const videoStart = video.start_frame ?? 0;
    const videoEnd = video.end_frame ?? Infinity;
    return pairEndFrame > videoStart && pairStartFrame < videoEnd;
  }) ?? (generationMode !== 'timeline' ? structureVideos?.[0] : undefined);
}

function getVideoThumb(slot: SegmentSlot | undefined): string | null {
  if (slot?.type !== 'child' || !slot.child?.location) return null;
  return getDisplayUrl(slot.child.thumbUrl || slot.child.location);
}

type SegmentChild = Extract<SegmentSlot, { type: 'child' }>['child'];

function buildAdjacentVideoThumbnails(
  segmentVideo: SegmentChild | null,
  pairSlot: SegmentSlot | undefined,
  segmentSlotLightboxIndex: number,
  segmentSlots: SegmentSlot[],
  totalPairs: number,
) {
  if (!segmentVideo) return undefined;

  const currentThumb = getVideoThumb(pairSlot);
  if (!currentThumb) return undefined;

  let prevInfo: { thumbUrl: string; pairIndex: number } | undefined;
  for (let i = segmentSlotLightboxIndex - 1; i >= 0; i--) {
    const thumb = getVideoThumb(segmentSlots.find(s => s.index === i));
    if (thumb) {
      prevInfo = { thumbUrl: thumb, pairIndex: i };
      break;
    }
  }

  let nextInfo: { thumbUrl: string; pairIndex: number } | undefined;
  for (let i = segmentSlotLightboxIndex + 1; i < totalPairs; i++) {
    const thumb = getVideoThumb(segmentSlots.find(s => s.index === i));
    if (thumb) {
      nextInfo = { thumbUrl: thumb, pairIndex: i };
      break;
    }
  }

  if (!prevInfo && !nextInfo) return undefined;

  return {
    prev: prevInfo,
    current: { thumbUrl: currentThumb, pairIndex: segmentSlotLightboxIndex },
    next: nextInfo,
  };
}

function resolveOverlappingStructureVideos(
  structureVideos: StructureVideoConfigWithMetadata[],
  newVideo: StructureVideoConfigWithMetadata,
) {
  const newStart = newVideo.start_frame ?? 0;
  const newEnd = newVideo.end_frame ?? Infinity;

  return structureVideos
    .flatMap(existing => {
      const existingStart = existing.start_frame ?? 0;
      const existingEnd = existing.end_frame ?? Infinity;

      if (newEnd <= existingStart || newStart >= existingEnd) return [existing];
      if (existingStart >= newStart && existingEnd <= newEnd) return [];
      if (existingStart < newStart && existingEnd > newEnd) {
        return [{ ...existing, end_frame: newStart }, { ...existing, start_frame: newEnd }];
      }
      if (existingStart < newStart) return [{ ...existing, end_frame: newStart }];
      if (existingEnd > newEnd) return [{ ...existing, start_frame: newEnd }];
      return [existing];
    })
    .filter(video => (video.end_frame ?? Infinity) > (video.start_frame ?? 0));
}

function getEnhancedPrompt(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const value = (metadata as { enhanced_prompt?: unknown }).enhanced_prompt;
  return typeof value === 'string' ? value : '';
}

function useSegmentSlotDeepLinking(
  props: UseSegmentSlotModeProps,
  state: SegmentSlotState,
  pairDataByIndex: Map<number, PairData>,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const isFirstMountRef = useRef(true);
  const navigateWithTransition = props.navigateWithTransition;
  const segmentSlots = props.segmentSlots;
  const {
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    setActivePairData,
    setPendingImageToOpen,
    setPendingImageVariantId,
  } = state;

  useEffect(() => {
    const wasFirstMount = isFirstMountRef.current;
    isFirstMountRef.current = false;

    const currentState = location.state as { openImageGenerationId?: string; openImageVariantId?: string; fromShotClick?: boolean } | null;
    if (!currentState?.openImageGenerationId) return;

    if (wasFirstMount) {
      navigate(location.pathname + location.hash, {
        replace: true,
        state: { fromShotClick: currentState.fromShotClick },
      });
      return;
    }

    if (segmentSlotLightboxIndex !== null) {
      setSegmentSlotLightboxIndex(null);
      setActivePairData(null);
    }

    navigateWithTransition(() => {
      setPendingImageToOpen(currentState.openImageGenerationId!);
      if (currentState.openImageVariantId) {
        setPendingImageVariantId(currentState.openImageVariantId);
      }
    });

    navigate(location.pathname + location.hash, {
      replace: true,
      state: { fromShotClick: currentState.fromShotClick },
    });
  }, [
    location.state,
    location.pathname,
    location.hash,
    navigate,
    navigateWithTransition,
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    setActivePairData,
    setPendingImageToOpen,
    setPendingImageVariantId,
  ]);

  useEffect(() => {
    const currentState = location.state as { openSegmentSlot?: string; fromShotClick?: boolean } | null;
    if (!currentState?.openSegmentSlot || pairDataByIndex.size === 0) return;

    for (const [pairIndex, pairData] of pairDataByIndex.entries()) {
      if (pairData.startImage?.id !== currentState.openSegmentSlot) continue;

      const matchingSlot = segmentSlots.find(slot => slot.index === pairIndex);
      const hasVideo = matchingSlot?.type === 'child' && matchingSlot.child?.location;
      if (!hasVideo) return;

      setActivePairData(pairData);
      setSegmentSlotLightboxIndex(pairIndex);
      navigate(location.pathname + location.hash, {
        replace: true,
        state: { fromShotClick: currentState.fromShotClick },
      });
      break;
    }
  }, [
    location.state,
    location.pathname,
    location.hash,
    navigate,
    pairDataByIndex,
    segmentSlots,
    setActivePairData,
    setSegmentSlotLightboxIndex,
  ]);
}

function useSegmentSlotModeData(
  props: UseSegmentSlotModeProps,
  state: SegmentSlotState,
  pairDataByIndex: Map<number, PairData>,
  trailingPairData: PairData | null,
  updatePairFrameCount: UseSegmentSlotModeReturn['updatePairFrameCount'],
  frameCountDebounceRef: MutableRefObject<NodeJS.Timeout | null>,
): SegmentSlotModeData | null {
  return useMemo(() => {
    if (state.segmentSlotLightboxIndex === null || !state.activePairData) return null;

    const pairData = state.activePairData;
    const pairSlot = props.segmentSlots.find(slot => slot.index === state.segmentSlotLightboxIndex);
    const segmentVideo = pairSlot?.type === 'child' ? pairSlot.child : null;

    // Include trailing slot in totalPairs when it has a video but isn't in pairDataByIndex
    const effectiveTotalPairs = trailingPairData ? pairDataByIndex.size + 1 : pairDataByIndex.size;

    const pairStartFrame = pairData.startFrame ?? 0;
    const pairEndFrame = pairData.endFrame ?? 0;
    const coveringVideo = findCoveringStructureVideo(
      props.structureVideos,
      pairStartFrame,
      pairEndFrame,
      props.effectiveGenerationMode,
    );

    const shotGen = props.shotGenerations.find(generation => generation.id === pairData.startImage?.id);
    const overrides = readSegmentOverrides(shotGen?.metadata as Record<string, unknown> | null);

    const adjacentVideoThumbnails = buildAdjacentVideoThumbnails(
      segmentVideo,
      pairSlot,
      state.segmentSlotLightboxIndex,
      props.segmentSlots,
      effectiveTotalPairs,
    );

    return {
      currentIndex: state.segmentSlotLightboxIndex,
      totalPairs: effectiveTotalPairs,
      pairData: {
        index: pairData.index,
        frames: pairData.frames,
        startFrame: pairData.startFrame,
        endFrame: pairData.endFrame,
        startImage: pairData.startImage,
        endImage: pairData.endImage,
      },
      segmentVideo,
      activeChildGenerationId: pairSlot?.type === 'child' ? pairSlot.child.id : undefined,
      onNavigateToPair: (index: number) => {
        const targetPairData = pairDataByIndex.get(index)
          ?? (index === pairDataByIndex.size ? trailingPairData : null);
        if (!targetPairData) return;

        const currentHasVideo = !!segmentVideo;
        const targetHasVideo = props.segmentSlots.find(slot => slot.index === index)?.type === 'child';

        if (currentHasVideo !== targetHasVideo) {
          props.navigateWithTransition(() => {
            state.setActivePairData(targetPairData);
            state.setSegmentSlotLightboxIndex(index);
          });
          return;
        }

        state.setActivePairData(targetPairData);
        state.setSegmentSlotLightboxIndex(index);
      },
      projectId: props.projectId || null,
      shotId: props.selectedShotId,
      parentGenerationId: props.selectedParentId || undefined,
      pairPrompt: overrides.prompt || '',
      pairNegativePrompt: overrides.negativePrompt || '',
      defaultPrompt: props.defaultPrompt,
      defaultNegativePrompt: props.defaultNegativePrompt,
      enhancedPrompt: getEnhancedPrompt(shotGen?.metadata),
      projectResolution: props.resolvedProjectResolution,
      structureVideoType: coveringVideo?.structure_type ?? null,
      structureVideoDefaults: coveringVideo ? {
        motionStrength: coveringVideo.motion_strength ?? 1.2,
        treatment: coveringVideo.treatment ?? 'adjust',
        uni3cEndPercent: coveringVideo.uni3c_end_percent ?? 0.1,
      } : undefined,
      structureVideoUrl: coveringVideo?.path,
      structureVideoFrameRange: (props.effectiveGenerationMode === 'timeline' || coveringVideo) ? {
        segmentStart: pairStartFrame,
        segmentEnd: pairEndFrame,
        videoTotalFrames: coveringVideo?.metadata?.total_frames ?? 60,
        videoFps: coveringVideo?.metadata?.frame_rate ?? 24,
        videoOutputStart: coveringVideo?.start_frame ?? 0,
        videoOutputEnd: coveringVideo?.end_frame ?? pairEndFrame,
      } : undefined,
      onFrameCountChange: (pairShotGenerationId: string, frameCount: number) => {
        if (props.effectiveGenerationMode !== 'timeline') return;

        if (frameCountDebounceRef.current) {
          clearTimeout(frameCountDebounceRef.current);
        }

        frameCountDebounceRef.current = setTimeout(() => {
          updatePairFrameCount(pairShotGenerationId, frameCount);
        }, 150);
      },
      onGenerateStarted: (pairShotGenerationId) => {
        if (!pairShotGenerationId) return;
        props.addOptimisticPending(pairShotGenerationId);
      },
      maxFrameLimit: props.maxFrameLimit,
      isTimelineMode: props.effectiveGenerationMode === 'timeline',
      existingStructureVideos: props.structureVideos ?? [],
      onAddSegmentStructureVideo: (video) => {
        if (props.effectiveGenerationMode !== 'timeline' || !props.onSetStructureVideos) {
          props.onAddStructureVideo?.(video);
          return;
        }

        const updatedVideos = resolveOverlappingStructureVideos(props.structureVideos || [], video);
        props.onSetStructureVideos([...updatedVideos, video]);
      },
      onUpdateSegmentStructureVideo: (updates) => {
        if (!props.onUpdateStructureVideo || !coveringVideo || !props.structureVideos) return;
        const index = props.structureVideos.findIndex(video => video.path === coveringVideo.path);
        if (index >= 0) props.onUpdateStructureVideo(index, updates);
      },
      onRemoveSegmentStructureVideo: () => {
        if (!props.onRemoveStructureVideo || !coveringVideo || !props.structureVideos) return;
        const index = props.structureVideos.findIndex(video => video.path === coveringVideo.path);
        if (index >= 0) props.onRemoveStructureVideo(index);
      },
      onNavigateToImage: (shotGenerationId: string) => {
        props.navigateWithTransition(() => {
          state.setSegmentSlotLightboxIndex(null);
          state.setPendingImageToOpen(shotGenerationId);
        });
      },
      adjacentVideoThumbnails,
      onOpenPreviewDialog: props.onOpenPreviewDialog,
    };
  }, [
    props,
    state,
    pairDataByIndex,
    trailingPairData,
    updatePairFrameCount,
    frameCountDebounceRef,
  ]);
}

export function useSegmentSlotMode(props: UseSegmentSlotModeProps): UseSegmentSlotModeReturn {
  const location = useLocation();

  const initialState = location.state as { openImageGenerationId?: string; openImageVariantId?: string } | null;
  const [segmentSlotLightboxIndex, setSegmentSlotLightboxIndex] = useState<number | null>(null);
  const [activePairData, setActivePairData] = useState<PairData | null>(null);
  const [pendingImageToOpen, setPendingImageToOpen] = useState<string | null>(
    initialState?.openImageGenerationId ?? null
  );
  const [pendingImageVariantId, setPendingImageVariantId] = useState<string | null>(
    initialState?.openImageVariantId ?? null
  );
  const frameCountDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!pendingImageToOpen) {
      setPendingImageVariantId(null);
    }
  }, [pendingImageToOpen]);

  const { pairDataByIndex } = usePairData({
    shotGenerations: props.shotGenerations,
    generationMode: props.effectiveGenerationMode,
    batchVideoFrames: props.batchVideoFrames,
  });

  const { updatePairFrameCount } = useFrameCountUpdater({
    shotId: props.selectedShotId,
    shotGenerations: props.shotGenerations,
    generationMode: props.effectiveGenerationMode,
    maxFrameLimit: props.maxFrameLimit,
    loadPositions: props.loadPositions,
    trailingFrameUpdateRef: props.trailingFrameUpdateRef,
  });

  const state: SegmentSlotState = {
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    activePairData,
    setActivePairData,
    pendingImageToOpen,
    setPendingImageToOpen,
    pendingImageVariantId,
    setPendingImageVariantId,
  };

  // Detect trailing child slot beyond pairDataByIndex and build synthetic pair data for it.
  // This handles the case where a trailing video exists but end_frame hasn't been
  // refreshed in shotGenerations metadata yet (stale query data).
  const trailingPairData = useMemo((): PairData | null => {
    const trailingSlotIndex = pairDataByIndex.size;
    const trailingSlot = props.segmentSlots.find(s => s.index === trailingSlotIndex);
    if (!trailingSlot || trailingSlot.type !== 'child' || !trailingSlot.child?.location) return null;

    const sortedImages = [...props.shotGenerations]
      .filter(g => g.timeline_frame != null && g.timeline_frame >= 0 && !isVideoAny(g))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    const lastImage = sortedImages[sortedImages.length - 1];
    if (!lastImage) return null;

    const startFrame = lastImage.timeline_frame ?? 0;
    const metadata = lastImage.metadata as Record<string, unknown> | null;
    const endFrame = (typeof metadata?.end_frame === 'number' ? metadata.end_frame : null) ?? startFrame + 17;

    return {
      index: trailingSlotIndex,
      frames: endFrame - startFrame,
      startFrame,
      endFrame,
      startImage: {
        id: lastImage.id,
        generationId: lastImage.generation_id || undefined,
        url: lastImage.imageUrl || lastImage.location || undefined,
        thumbUrl: lastImage.thumbUrl || lastImage.location || undefined,
        position: sortedImages.length,
      },
      endImage: null,
    };
  }, [pairDataByIndex, props.segmentSlots, props.shotGenerations]);

  useSegmentSlotDeepLinking(props, state, pairDataByIndex);

  const handlePairClick = useCallback((pairIndex: number, passedPairData?: PairData) => {
    // Prefer passed data when it has real content (startImage present).
    // Fall back to computed data (pairDataByIndex or trailingPairData) when
    // passed data is minimal (e.g., fallback from handleOpenPairSettings).
    const computedData = pairDataByIndex.get(pairIndex)
      || (pairIndex === pairDataByIndex.size ? trailingPairData : null);
    const pairData = (passedPairData?.startImage ? passedPairData : null)
      || computedData
      || passedPairData;
    if (pairData) {
      setActivePairData(pairData);
    }
    setSegmentSlotLightboxIndex(pairIndex);
  }, [pairDataByIndex, trailingPairData]);

  const segmentSlotModeData = useSegmentSlotModeData(
    props,
    state,
    pairDataByIndex,
    trailingPairData,
    updatePairFrameCount,
    frameCountDebounceRef,
  );

  return {
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    activePairData,
    setActivePairData,
    pendingImageToOpen,
    setPendingImageToOpen,
    pendingImageVariantId,
    pairDataByIndex,
    segmentSlotModeData,
    handlePairClick,
    updatePairFrameCount,
  };
}
