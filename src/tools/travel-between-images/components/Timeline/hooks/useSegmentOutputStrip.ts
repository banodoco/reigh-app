/**
 * useSegmentOutputStrip - Orchestrator hook for SegmentOutputStrip.
 *
 * Composes sub-hooks for deletion, scrubbing, and lightbox concerns.
 * Pure functions handle display slot computation and source info extraction.
 */

import { useCallback, useMemo, useEffect } from 'react';
import { useSourceImageChanges } from '@/shared/hooks/useSourceImageChanges';
import { useMarkVariantViewed } from '@/shared/hooks/useMarkVariantViewed';
import { TIMELINE_PADDING_OFFSET } from '../constants';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { PairData } from '@/shared/types/pairData';

import { useSegmentDeletion } from './useSegmentDeletion';
import { useSegmentScrubbing } from './useSegmentScrubbing';
import { useSegmentLightbox } from './useSegmentLightbox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PairInfo {
  index: number;
  startFrame: number;
  endFrame: number;
  frames: number;
}

/** Timeline layout dimensions for pixel position calculations */
interface SegmentLayoutProps {
  containerWidth: number;
  fullMin: number;
  fullRange: number;
}

/** Segment data inputs for display slot computation */
interface SegmentDataProps {
  pairInfo: PairInfo[];
  rawSegmentSlots: SegmentSlot[];
  pairDataByIndex?: Map<number, PairData>;
  lastImageId?: string;
  trailingSegmentMode?: {
    imageId: string;
    imageFrame: number;
    endFrame: number;
  };
}

/** A display slot merged with its pixel position — ready for rendering */
interface PositionedSlot {
  slot: SegmentSlot;
  leftPercent: number;
  widthPercent: number;
  isTrailing: boolean;
}

interface UseSegmentOutputStripProps {
  shotId: string;
  projectAspectRatio?: string;
  layout: SegmentLayoutProps;
  segmentData: SegmentDataProps;
  hasPendingTaskProp?: (pairShotGenerationId: string | null | undefined) => boolean;
  readOnly: boolean;
  onTrailingVideoInfo?: (videoUrl: string | null) => void;
  selectedParentId?: string | null;
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  isMultiImage?: boolean;
  lastImageFrame?: number;
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Build the ordered list of display slots (child videos + placeholders)
 * from raw segment data and pair information.
 */
function buildDisplaySlots(
  pairInfo: PairInfo[],
  rawSegmentSlots: SegmentSlot[],
  pairDataByIndex?: Map<number, PairData>,
  lastImageId?: string,
  trailingSegmentMode?: SegmentDataProps['trailingSegmentMode'],
): SegmentSlot[] {
  // Build lookup: pairShotGenerationId → best slot (prefer child over placeholder)
  const byPsgId = new Map<string, SegmentSlot>();
  for (const slot of rawSegmentSlots) {
    if (!slot.pairShotGenerationId) continue;
    const existing = byPsgId.get(slot.pairShotGenerationId);
    if (!existing || (slot.type === 'child' && existing.type !== 'child')) {
      byPsgId.set(slot.pairShotGenerationId, slot);
    }
  }

  // Collect child (video) slots for each pair
  const children: SegmentSlot[] = [];
  for (const pair of pairInfo) {
    const startImageId = pairDataByIndex?.get(pair.index)?.startImage?.id;
    const segment = startImageId ? byPsgId.get(startImageId) : undefined;
    if (segment?.type === 'child') {
      children.push({ ...segment, index: pair.index });
    }
  }

  // Trailing video (after last pair)
  const trailingIndex = pairInfo.length;
  if (lastImageId) {
    const trailingSegment = byPsgId.get(lastImageId);
    const isTrailingVideo = trailingSegment?.type === 'child'
      && (!pairDataByIndex || ![...pairDataByIndex.values()].some(pd => pd.startImage?.id === lastImageId));
    if (isTrailingVideo && trailingSegment) {
      children.push({ ...trailingSegment, index: trailingIndex, isTrailingSegment: true } as SegmentSlot);
    }
  }

  // Special case: trailing-only with no pairs
  if (pairInfo.length === 0 && trailingSegmentMode) {
    const trailingChild = children.find(c => 'isTrailingSegment' in c);
    if (trailingChild) return [trailingChild];
    return [{
      type: 'placeholder' as const,
      index: 0,
      pairShotGenerationId: trailingSegmentMode.imageId,
      expectedFrames: trailingSegmentMode.endFrame - trailingSegmentMode.imageFrame,
      expectedPrompt: undefined,
      startImage: undefined,
      endImage: undefined,
    }];
  }

  // Build slots: use child if available, placeholder otherwise
  const childByIndex = new Map(children.map(c => [c.index, c]));
  const allSlots: SegmentSlot[] = [];

  for (const pair of pairInfo) {
    const existing = childByIndex.get(pair.index);
    if (existing) {
      allSlots.push(existing);
    } else {
      const startImageId = pairDataByIndex?.get(pair.index)?.startImage?.id;
      const hookSlot = startImageId ? byPsgId.get(startImageId) : undefined;
      allSlots.push({
        type: 'placeholder' as const,
        index: pair.index,
        pairShotGenerationId: startImageId,
        expectedFrames: hookSlot?.type === 'placeholder' ? hookSlot.expectedFrames : undefined,
        expectedPrompt: hookSlot?.type === 'placeholder' ? hookSlot.expectedPrompt : undefined,
        startImage: hookSlot?.type === 'placeholder' ? hookSlot.startImage : undefined,
        endImage: hookSlot?.type === 'placeholder' ? hookSlot.endImage : undefined,
      });
    }
  }

  // Trailing segment (after the last pair)
  if (trailingSegmentMode) {
    const trailingChild = children.find(c => 'isTrailingSegment' in c);
    if (trailingChild) {
      allSlots.push(trailingChild);
    } else {
      allSlots.push({
        type: 'placeholder' as const,
        index: trailingIndex,
        pairShotGenerationId: trailingSegmentMode.imageId,
        expectedFrames: trailingSegmentMode.endFrame - trailingSegmentMode.imageFrame,
        expectedPrompt: undefined,
        startImage: undefined,
        endImage: undefined,
        isTrailingSegment: true,
      } as SegmentSlot);
    }
  }

  return allSlots;
}

/**
 * Extract source image info from child segment slots for mismatch detection.
 * Parses task params to find which generation IDs were used as inputs.
 */
function buildSegmentSourceInfo(rawSegmentSlots: SegmentSlot[]) {
  return rawSegmentSlots
    .filter(slot => slot.type === 'child')
    .map(slot => {
      if (slot.type !== 'child') return null;
      const child = slot.child;
      const params = child.params as Record<string, unknown> | null;
      const individualParams = (params?.individual_segment_params || {}) as Record<string, unknown>;
      const orchDetails = (params?.orchestrator_details || {}) as Record<string, unknown>;
      const childOrder = child.child_order ?? slot.index;
      const orchGenIds = (orchDetails.input_image_generation_ids || []) as string[];
      const startGenId = (individualParams.start_image_generation_id as string)
        || (params?.start_image_generation_id as string)
        || orchGenIds[childOrder]
        || null;
      const endGenId = (individualParams.end_image_generation_id as string)
        || (params?.end_image_generation_id as string)
        || orchGenIds[childOrder + 1]
        || null;
      return {
        segmentId: child.id,
        childOrder,
        params: params || {},
        startGenId,
        endGenId,
      };
    })
    .filter((info): info is NonNullable<typeof info> => info !== null);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSegmentOutputStrip({
  shotId,
  projectAspectRatio,
  layout: { containerWidth, fullMin, fullRange },
  segmentData: { pairInfo, rawSegmentSlots, pairDataByIndex, lastImageId, trailingSegmentMode },
  hasPendingTaskProp,
  readOnly,
  onTrailingVideoInfo,
  selectedParentId,
  onSegmentFrameCountChange,
  isMultiImage,
  lastImageFrame,
}: UseSegmentOutputStripProps) {
  // ===== DISPLAY SLOTS =====
  const displaySlots = useMemo(
    () => buildDisplaySlots(pairInfo, rawSegmentSlots, pairDataByIndex, lastImageId, trailingSegmentMode),
    [pairInfo, rawSegmentSlots, pairDataByIndex, lastImageId, trailingSegmentMode],
  );

  // ===== SUB-HOOKS =====
  const deletion = useSegmentDeletion();
  const scrubbingHook = useSegmentScrubbing({ projectAspectRatio, displaySlots });
  const lightbox = useSegmentLightbox({ displaySlots, pairDataByIndex, selectedParentId });
  const { clearScrubbing } = scrubbingHook;
  const { setLightboxIndex } = lightbox;
  const { markAllViewed } = useMarkVariantViewed();

  // ===== PENDING TASK CHECKER =====
  const hasPendingTask = hasPendingTaskProp ?? (() => false);

  // ===== SOURCE IMAGE CHANGE DETECTION =====
  const segmentSourceInfo = useMemo(() => buildSegmentSourceInfo(rawSegmentSlots), [rawSegmentSlots]);
  const { hasRecentMismatch } = useSourceImageChanges(segmentSourceInfo, !readOnly);

  // ===== SEGMENT CLICK =====
  const handleSegmentClick = useCallback((
    slot: SegmentSlot,
    slotIndex: number,
    onOpenPairSettings?: (pairIndex: number, pairFrameData?: { frames: number; startFrame: number; endFrame: number }) => void,
  ) => {
    clearScrubbing();
    if (slot?.type === 'child') {
      markAllViewed(slot.child.id);
    }

    if (onOpenPairSettings) {
      // Route all clicks through pair settings → segmentSlotMode lightbox.
      // This handles both regular pairs and trailing segments uniformly,
      // with proper form-only and video views plus full chevron navigation.
      const pairFrameData = pairInfo.find(p => p.index === slot.index);
      onOpenPairSettings(slot.index, pairFrameData ? {
        frames: pairFrameData.frames,
        startFrame: pairFrameData.startFrame,
        endFrame: pairFrameData.endFrame,
      } : undefined);
    } else if (slot.type === 'child') {
      // No pair settings handler — fall back to inline SegmentOutputStrip lightbox
      setLightboxIndex(slotIndex);
    }
  }, [markAllViewed, pairInfo, clearScrubbing, setLightboxIndex, shotId]);

  // ===== TRAILING VIDEO INFO REPORTING =====
  useEffect(() => {
    if (!onTrailingVideoInfo || !lastImageId) {
      if (onTrailingVideoInfo) onTrailingVideoInfo(null);
      return;
    }
    const trailingVideoSlot = rawSegmentSlots.find((slot) => {
      if (slot.type !== 'child') return false;
      return slot.pairShotGenerationId === lastImageId;
    });
    if (trailingVideoSlot && trailingVideoSlot.type === 'child' && trailingVideoSlot.child.location) {
      onTrailingVideoInfo(trailingVideoSlot.child.location);
    } else {
      onTrailingVideoInfo(null);
    }
  }, [rawSegmentSlots, lastImageId, onTrailingVideoInfo]);

  // ===== POSITIONED SLOTS (slot + pixel position in single computation) =====
  const positionedSlots = useMemo((): PositionedSlot[] => {
    if (fullRange <= 0 || containerWidth <= 0) return [];
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    const pairByIndex = new Map(pairInfo.map(p => [p.index, p]));

    return displaySlots.map(slot => {
      const isTrailing = 'isTrailingSegment' in slot && (slot as Record<string, unknown>).isTrailingSegment === true;

      let startFrame: number;
      let endFrame: number;
      if (isTrailing && trailingSegmentMode) {
        startFrame = trailingSegmentMode.imageFrame;
        endFrame = trailingSegmentMode.endFrame;
      } else {
        const pair = pairByIndex.get(slot.index);
        if (!pair) return { slot, leftPercent: 0, widthPercent: 0, isTrailing };
        startFrame = pair.startFrame;
        endFrame = pair.endFrame;
      }

      const startPixel = TIMELINE_PADDING_OFFSET + ((startFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;

      return {
        slot,
        leftPercent: (startPixel / containerWidth) * 100,
        widthPercent: (width / containerWidth) * 100,
        isTrailing,
      };
    });
  }, [displaySlots, pairInfo, fullMin, fullRange, containerWidth, trailingSegmentMode]);

  // ===== ADD TRAILING BUTTON POSITION =====
  const addTrailingButtonLeftPercent = useMemo((): number | null => {
    if (!isMultiImage || lastImageFrame === undefined || fullRange <= 0 || containerWidth <= 0) return null;
    const trailingIndex = pairInfo.length;
    if (displaySlots.some(slot => slot.index === trailingIndex)) return null;
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    const lastImagePixel = TIMELINE_PADDING_OFFSET + ((lastImageFrame - fullMin) / fullRange) * effectiveWidth;
    return (lastImagePixel / containerWidth) * 100;
  }, [isMultiImage, lastImageFrame, pairInfo.length, displaySlots, fullRange, containerWidth, fullMin]);

  return {
    // Refs
    previewVideoRef: scrubbingHook.previewVideoRef,
    stripContainerRef: scrubbingHook.stripContainerRef,

    // Mobile
    isMobile: scrubbingHook.isMobile,

    // Display data
    positionedSlots,
    addTrailingButtonLeftPercent,
    hasPendingTask,
    hasRecentMismatch,

    // Scrubbing
    activeScrubbingIndex: scrubbingHook.activeScrubbingIndex,
    activeSegmentSlot: scrubbingHook.activeSegmentSlot,
    activeSegmentVideoUrl: scrubbingHook.activeSegmentVideoUrl,
    scrubbing: scrubbingHook.scrubbing,
    previewPosition: scrubbingHook.previewPosition,
    previewDimensions: scrubbingHook.previewDimensions,
    clampedPreviewX: scrubbingHook.clampedPreviewX,
    handleScrubbingStart: scrubbingHook.handleScrubbingStart,

    // Lightbox
    lightboxIndex: lightbox.lightboxIndex,
    lightboxMedia: lightbox.lightboxMedia,
    lightboxCurrentSegmentImages: lightbox.lightboxCurrentSegmentImages,
    lightboxCurrentFrameCount: lightbox.lightboxCurrentFrameCount,
    currentLightboxMedia: lightbox.currentLightboxMedia,
    childSlotIndices: lightbox.childSlotIndices,
    handleSegmentClick,
    handleLightboxNext: lightbox.handleLightboxNext,
    handleLightboxPrev: lightbox.handleLightboxPrev,
    handleLightboxClose: lightbox.handleLightboxClose,

    // Deletion
    deletingSegmentId: deletion.deletingSegmentId,
    handleDeleteSegment: deletion.handleDeleteSegment,

    // Segment frame count change (pass-through)
    onSegmentFrameCountChange,
    shotId,
  };
}
