import { useMemo, type MutableRefObject } from 'react';
import { readSegmentOverrides } from '@/shared/lib/settingsMigration';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { asNumber, asRecord, asString } from '@/shared/lib/tasks/taskParamParsers';
import { resolvePrimaryStructureVideo } from '@/shared/lib/tasks/travelBetweenImages';
import type { PairData } from '../../Timeline/TimelineContainer/types';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { SegmentSlotModeData } from '@/domains/media-lightbox/types';
import type {
  SegmentSlotGenerationMode,
  SegmentSlotState,
  UseSegmentSlotModeResolvedProps,
  UseSegmentSlotModeReturn,
} from './segmentSlotContracts';

function findCoveringStructureVideo(
  structureVideos: UseSegmentSlotModeResolvedProps['structureVideos'],
  pairStartFrame: number,
  pairEndFrame: number,
  generationMode: SegmentSlotGenerationMode,
) {
  return (structureVideos || []).find((video) => {
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
  slotByIndex: Map<number, SegmentSlot>,
  totalPairs: number,
) {
  if (!segmentVideo) return undefined;

  const currentThumb = getVideoThumb(pairSlot);
  if (!currentThumb) return undefined;

  let prevInfo: { thumbUrl: string; pairIndex: number } | undefined;
  for (let i = segmentSlotLightboxIndex - 1; i >= 0; i -= 1) {
    const thumb = getVideoThumb(slotByIndex.get(i));
    if (thumb) {
      prevInfo = { thumbUrl: thumb, pairIndex: i };
      break;
    }
  }

  let nextInfo: { thumbUrl: string; pairIndex: number } | undefined;
  for (let i = segmentSlotLightboxIndex + 1; i < totalPairs; i += 1) {
    const thumb = getVideoThumb(slotByIndex.get(i));
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
  structureVideos: NonNullable<UseSegmentSlotModeResolvedProps['structureVideos']>,
  newVideo: NonNullable<UseSegmentSlotModeResolvedProps['structureVideos']>[number],
) {
  const newStart = newVideo.start_frame ?? 0;
  const newEnd = newVideo.end_frame ?? Infinity;

  return structureVideos
    .flatMap((existing) => {
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
    .filter((video) => (video.end_frame ?? Infinity) > (video.start_frame ?? 0));
}

function getEnhancedPrompt(metadata: unknown): string {
  const record = asRecord(metadata);
  return asString(record?.enhanced_prompt) ?? '';
}

interface BuildTrailingPairDataInput {
  pairDataByIndex: Map<number, PairData>;
  segmentSlots: SegmentSlot[];
  shotGenerations: UseSegmentSlotModeResolvedProps['shotGenerations'];
}

export function buildTrailingPairData({
  pairDataByIndex,
  segmentSlots,
  shotGenerations,
}: BuildTrailingPairDataInput): PairData | null {
  const trailingSlotIndex = pairDataByIndex.size;
  const trailingSlot = segmentSlots.find((slot) => slot.index === trailingSlotIndex);
  if (!trailingSlot || trailingSlot.type !== 'child' || !trailingSlot.child?.location) return null;

  const sortedImages = [...shotGenerations]
    .filter((generation) => generation.timeline_frame != null && generation.timeline_frame >= 0 && !isVideoAny(generation))
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  const lastImage = sortedImages[sortedImages.length - 1];
  if (!lastImage) return null;

  const startFrame = lastImage.timeline_frame ?? 0;
  const metadata = asRecord(lastImage.metadata);
  const endFrame = asNumber(metadata?.end_frame) ?? startFrame + 17;

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
}

export function buildSegmentSlotIndexMap(segmentSlots: SegmentSlot[]): Map<number, SegmentSlot> {
  const indexMap = new Map<number, SegmentSlot>();
  for (const slot of segmentSlots) {
    indexMap.set(slot.index, slot);
  }
  return indexMap;
}

interface UseSegmentSlotPresentationAdapterInput {
  props: UseSegmentSlotModeResolvedProps;
  state: SegmentSlotState;
  pairDataByIndex: Map<number, PairData>;
  slotByIndex: Map<number, SegmentSlot>;
  trailingPairData: PairData | null;
  updatePairFrameCount: UseSegmentSlotModeReturn['updatePairFrameCount'];
  frameCountDebounceRef: MutableRefObject<NodeJS.Timeout | null>;
}

export function useSegmentSlotPresentationAdapter({
  props,
  state,
  pairDataByIndex,
  slotByIndex,
  trailingPairData,
  updatePairFrameCount,
  frameCountDebounceRef,
}: UseSegmentSlotPresentationAdapterInput): SegmentSlotModeData | null {
  return useMemo(() => {
    if (state.segmentSlotLightboxIndex === null || !state.activePairData) return null;

    const pairData = state.activePairData;
    const pairSlot = slotByIndex.get(state.segmentSlotLightboxIndex);
    const segmentVideo = pairSlot?.type === 'child' ? pairSlot.child : null;

    const effectiveTotalPairs = trailingPairData ? pairDataByIndex.size + 1 : pairDataByIndex.size;
    const pairStartFrame = pairData.startFrame ?? 0;
    const pairEndFrame = pairData.endFrame ?? 0;
    const coveringVideo = findCoveringStructureVideo(
      props.structureVideos,
      pairStartFrame,
      pairEndFrame,
      props.effectiveGenerationMode,
    );
    const primaryStructureVideo = resolvePrimaryStructureVideo(
      props.structureVideos,
      props.structureGuidance,
    );

    const shotGen = props.shotGenerations.find((generation) => generation.id === pairData.startImage?.id);
    const overrides = readSegmentOverrides(asRecord(shotGen?.metadata) ?? null);
    const adjacentVideoThumbnails = buildAdjacentVideoThumbnails(
      segmentVideo,
      pairSlot,
      state.segmentSlotLightboxIndex,
      slotByIndex,
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
        const targetHasVideo = slotByIndex.get(index)?.type === 'child';

        if (currentHasVideo !== targetHasVideo) {
          props.navigateWithTransition(() => {
            state.setSegmentSlotLightboxIndex(index);
          });
          return;
        }

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
      structureVideoType: coveringVideo ? primaryStructureVideo.structureType : null,
      structureVideoDefaults: coveringVideo ? {
        mode: primaryStructureVideo.structureType,
        motionStrength: primaryStructureVideo.motionStrength,
        treatment: coveringVideo.treatment ?? primaryStructureVideo.treatment,
        uni3cEndPercent: primaryStructureVideo.uni3cEndPercent,
      } : undefined,
      structureVideoDefaultsByModel: props.structureVideoDefaultsByModel,
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
          void updatePairFrameCount(pairShotGenerationId, frameCount);
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
        const index = props.structureVideos.findIndex((video) => video.path === coveringVideo.path);
        if (index >= 0) props.onUpdateStructureVideo(index, updates);
      },
      onRemoveSegmentStructureVideo: () => {
        if (!props.onRemoveStructureVideo || !coveringVideo || !props.structureVideos) return;
        const index = props.structureVideos.findIndex((video) => video.path === coveringVideo.path);
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
    frameCountDebounceRef,
    pairDataByIndex,
    props,
    slotByIndex,
    state,
    trailingPairData,
    updatePairFrameCount,
  ]);
}
