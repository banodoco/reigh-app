/**
 * useSegmentOutputStrip - Orchestrator hook for SegmentOutputStrip.
 *
 * Composes sub-hooks for deletion, scrubbing, and lightbox concerns.
 * Keeps: display slot computation, segment positions, source image changes,
 * trailing video reporting, segment click handler.
 */

import { useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useSourceImageChanges } from '@/shared/hooks/useSourceImageChanges';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandler';
import { TIMELINE_PADDING_OFFSET } from '../constants';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { PairData } from '../TimelineContainer';

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
}: UseSegmentOutputStripProps) {
  const queryClient = useQueryClient();

  // ===== SEGMENT LOOKUP =====
  const segmentByPairShotGenId = useMemo(() => {
    const map = new Map<string, typeof rawSegmentSlots[number]>();
    for (const slot of rawSegmentSlots) {
      if (!slot.pairShotGenerationId) continue;
      const existing = map.get(slot.pairShotGenerationId);
      if (!existing || (slot.type === 'child' && existing.type !== 'child')) {
        map.set(slot.pairShotGenerationId, slot);
      }
    }
    return map;
  }, [rawSegmentSlots]);

  // ===== DISPLAY SLOTS =====
  const displaySlots = useMemo(() => {
    const children: typeof rawSegmentSlots = [];

    for (const pair of pairInfo) {
      const pairData = pairDataByIndex?.get(pair.index);
      const startImageId = pairData?.startImage?.id;
      const segment = startImageId ? segmentByPairShotGenId.get(startImageId) : undefined;
      if (segment?.type === 'child') {
        children.push({ ...segment, index: pair.index });
      }
    }

    // Trailing video
    const trailingIndex = pairInfo.length;
    if (lastImageId) {
      const trailingSegment = segmentByPairShotGenId.get(lastImageId);
      const isTrailingVideo = trailingSegment?.type === 'child'
        && (!pairDataByIndex || ![...pairDataByIndex.values()].some(pd => pd.startImage?.id === lastImageId));
      if (isTrailingVideo && trailingSegment) {
        children.push({ ...trailingSegment, index: trailingIndex, isTrailingSegment: true } as typeof rawSegmentSlots[number]);
      }
    }

    if (children.length > 0) {
      if (trailingSegmentMode && !children.some(s => 'isTrailingSegment' in s)) {
        children.push({
          type: 'placeholder' as const,
          index: pairInfo.length === 0 ? 0 : trailingIndex,
          pairShotGenerationId: trailingSegmentMode.imageId,
          expectedFrames: trailingSegmentMode.endFrame - trailingSegmentMode.imageFrame,
          expectedPrompt: undefined,
          startImage: undefined,
          endImage: undefined,
          isTrailingSegment: true,
        } as typeof rawSegmentSlots[number]);
      }
      return children;
    }

    // No videos - first-time experience: show placeholders
    const placeholders: typeof rawSegmentSlots = [];

    if (trailingSegmentMode && pairInfo.length === 0) {
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

    for (const pair of pairInfo) {
      const pairData = pairDataByIndex?.get(pair.index);
      const startImageId = pairData?.startImage?.id;
      const hookSlot = startImageId ? segmentByPairShotGenId.get(startImageId) : undefined;
      placeholders.push({
        type: 'placeholder' as const,
        index: pair.index,
        pairShotGenerationId: startImageId,
        expectedFrames: hookSlot?.type === 'placeholder' ? hookSlot.expectedFrames : undefined,
        expectedPrompt: hookSlot?.type === 'placeholder' ? hookSlot.expectedPrompt : undefined,
        startImage: hookSlot?.type === 'placeholder' ? hookSlot.startImage : undefined,
        endImage: hookSlot?.type === 'placeholder' ? hookSlot.endImage : undefined,
      });
    }

    if (trailingSegmentMode && pairInfo.length > 0) {
      placeholders.push({
        type: 'placeholder' as const,
        index: trailingIndex,
        pairShotGenerationId: trailingSegmentMode.imageId,
        expectedFrames: trailingSegmentMode.endFrame - trailingSegmentMode.imageFrame,
        expectedPrompt: undefined,
        startImage: undefined,
        endImage: undefined,
        isTrailingSegment: true,
      } as typeof rawSegmentSlots[number]);
    }

    return placeholders;
  }, [pairDataByIndex, pairInfo, segmentByPairShotGenId, trailingSegmentMode, lastImageId]);

  // ===== SUB-HOOKS =====
  const deletion = useSegmentDeletion();
  const scrubbingHook = useSegmentScrubbing({ projectAspectRatio, displaySlots });
  const lightbox = useSegmentLightbox({ displaySlots, pairDataByIndex, selectedParentId });

  // ===== PENDING TASK CHECKER =====
  const hasPendingTask = hasPendingTaskProp ?? (() => false);

  // ===== SOURCE IMAGE CHANGE DETECTION =====
  const segmentSourceInfo = useMemo(() => {
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
  }, [rawSegmentSlots]);

  const { hasRecentMismatch } = useSourceImageChanges(segmentSourceInfo, !readOnly);

  // ===== MARK GENERATION VIEWED =====
  const markGenerationViewed = useCallback(async (generationId: string) => {
    try {
      const { data: variants, error: checkError } = await supabase
        .from('generation_variants')
        .select('id, viewed_at')
        .eq('generation_id', generationId)
        .eq('is_primary', true);
      if (checkError) {
        handleError(checkError, { context: 'SegmentOutputStrip', showToast: false });
        return;
      }
      if (!variants || variants.length === 0) return;
      const { error } = await supabase
        .from('generation_variants')
        .update({ viewed_at: new Date().toISOString() })
        .eq('generation_id', generationId)
        .eq('is_primary', true)
        .is('viewed_at', null);
      if (error) {
        handleError(error, { context: 'SegmentOutputStrip', showToast: false });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantBadges });
      }
    } catch (error) {
      handleError(error, { context: 'SegmentOutputStrip', showToast: false });
    }
  }, [queryClient]);

  // ===== SEGMENT CLICK =====
  const handleSegmentClick = useCallback((
    slot: typeof displaySlots[number],
    slotIndex: number,
    onOpenPairSettings?: (pairIndex: number, pairFrameData?: { frames: number; startFrame: number; endFrame: number }) => void,
  ) => {
    scrubbingHook.clearScrubbing();
    if (slot?.type === 'child') {
      markGenerationViewed(slot.child.id);
    }
    if (onOpenPairSettings && slot) {
      const pairFrameData = pairInfo.find(p => p.index === slot.index);
      onOpenPairSettings(slot.index, pairFrameData ? {
        frames: pairFrameData.frames,
        startFrame: pairFrameData.startFrame,
        endFrame: pairFrameData.endFrame,
      } : undefined);
    } else {
      lightbox.setLightboxIndex(slotIndex);
    }
  }, [markGenerationViewed, pairInfo, scrubbingHook.clearScrubbing, lightbox.setLightboxIndex]);

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

  // ===== SEGMENT POSITIONS =====
  const segmentPositions = useMemo(() => {
    if (fullRange <= 0 || containerWidth <= 0) return [];
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);

    if (trailingSegmentMode && pairInfo.length === 0) {
      const startPixel = TIMELINE_PADDING_OFFSET + ((trailingSegmentMode.imageFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((trailingSegmentMode.endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;
      return [{
        pairIndex: 0,
        leftPercent: (startPixel / containerWidth) * 100,
        widthPercent: (width / containerWidth) * 100,
      }];
    }

    if (!pairInfo.length) return [];

    const positions = pairInfo.map((pair) => {
      const startPixel = TIMELINE_PADDING_OFFSET + ((pair.startFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((pair.endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;
      return {
        pairIndex: pair.index,
        leftPercent: (startPixel / containerWidth) * 100,
        widthPercent: (width / containerWidth) * 100,
      };
    });

    if (trailingSegmentMode && pairInfo.length > 0) {
      const startPixel = TIMELINE_PADDING_OFFSET + ((trailingSegmentMode.imageFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((trailingSegmentMode.endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;
      positions.push({
        pairIndex: pairInfo.length,
        leftPercent: (startPixel / containerWidth) * 100,
        widthPercent: (width / containerWidth) * 100,
      });
    }

    return positions;
  }, [pairInfo, fullMin, fullRange, containerWidth, trailingSegmentMode]);

  return {
    // Refs
    previewVideoRef: scrubbingHook.previewVideoRef,
    stripContainerRef: scrubbingHook.stripContainerRef,

    // Mobile
    isMobile: scrubbingHook.isMobile,

    // Display data
    displaySlots,
    segmentPositions,
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
