/**
 * SegmentOutputStrip - Compact strip showing segment outputs above timeline
 * 
 * Displays generated video segments aligned with their corresponding image pairs.
 * Each segment is positioned to match the timeline pair below it.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { InlineSegmentVideo } from './InlineSegmentVideo';
import type { SegmentSlot } from '@/shared/hooks/segments';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useSourceImageChanges } from '@/shared/hooks/useSourceImageChanges';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';
import { GenerationRow } from '@/types/shots';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';
import { supabase } from '@/integrations/supabase/client';
import { getDisplayUrl } from '@/shared/lib/utils';
import { handleError } from '@/shared/lib/errorHandler';
import { cn } from '@/shared/lib/utils';

import type { PairData } from './TimelineContainer';

interface PairInfo {
  index: number;
  startFrame: number;
  endFrame: number;
  frames: number;
}

interface SegmentOutputStripProps {
  shotId: string;
  projectId?: string | null;  // Optional for readOnly mode
  projectAspectRatio?: string;
  pairInfo: PairInfo[];
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  /** Segment slots from consolidated hook (passed from ShotImagesEditor) */
  segmentSlots: SegmentSlot[];
  /** Loading state for segment slots */
  isLoading?: boolean;
  /** Map from shot_generation_id to position index (0, 1, 2...) - for instant updates during drag */
  localShotGenPositions?: Map<string, number>;
  /** Check if a pair has a pending task (includes optimistic state from ShotImagesEditor) */
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  /** Callback to open pair settings modal for a specific pair index, with frame data from pairInfo */
  onOpenPairSettings?: (pairIndex: number, pairFrameData?: { frames: number; startFrame: number; endFrame: number }) => void;
  /** Optional controlled selected parent ID (shared with FinalVideoSection) */
  selectedParentId?: string | null;
  /** Current pair data by index (shared with SegmentSettingsModal for fresh regeneration data) */
  pairDataByIndex?: Map<number, PairData>;
  /** Callback when segment frame count changes (for instant timeline updates) */
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  /** ID of the last image - always pass for multi-image so hook can find existing trailing videos */
  lastImageId?: string;
  /** Trailing segment config - ONLY pass when user has explicitly configured a trailing segment */
  trailingSegmentMode?: {
    imageId: string;
    imageFrame: number;
    endFrame: number;
  };
  /** Read-only mode - disables interactions */
  readOnly?: boolean;
  /** Callback to add a trailing segment (for multi-image mode when no trailing yet) */
  onAddTrailingSegment?: () => void;
  /** Callback to remove the trailing segment */
  onRemoveTrailingSegment?: () => void;
  /** Whether we're in multi-image mode (shows + button when no trailing segment) */
  isMultiImage?: boolean;
  /** Frame position of the last image (for positioning the + button) */
  lastImageFrame?: number;
  /** Callback to report trailing video info (for extract final frame feature) */
  onTrailingVideoInfo?: (videoUrl: string | null) => void;
}

export const SegmentOutputStrip: React.FC<SegmentOutputStripProps> = ({
  shotId,
  projectAspectRatio,
  pairInfo,
  fullMin,
  fullRange,
  containerWidth,
  zoomLevel,
  segmentSlots: rawSegmentSlots,
  isLoading = false,
  hasPendingTask: hasPendingTaskProp,
  onOpenPairSettings,
  selectedParentId,
  pairDataByIndex,
  onSegmentFrameCountChange,
  lastImageId,
  trailingSegmentMode,
  readOnly = false,
  onAddTrailingSegment,
  onRemoveTrailingSegment,
  isMultiImage = false,
  lastImageFrame,
  onTrailingVideoInfo,
}) => {
  // ===== ALL HOOKS MUST BE CALLED UNCONDITIONALLY AT THE TOP =====
  const isMobile = useIsMobile();

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Deletion state
  const [deletingSegmentId, setDeletingSegmentId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // ===== SCRUBBING PREVIEW STATE =====
  // Track which segment is being scrubbed (by slot index) and mouse position for portal
  const [activeScrubbingIndex, setActiveScrubbingIndex] = useState<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const stripContainerRef = useRef<HTMLDivElement>(null);

  // Video scrubbing hook - controls the preview video
  const scrubbing = useVideoScrubbing({
    enabled: !isMobile && activeScrubbingIndex !== null,
    playOnStopScrubbing: true,
    playDelay: 400,
    resetOnLeave: true,
    onHoverEnd: () => setActiveScrubbingIndex(null),
  });

  // When active scrubbing index changes, manually trigger onMouseEnter
  // This is needed because the state update happens after the original onMouseEnter fires
  useEffect(() => {
    if (activeScrubbingIndex !== null) {
      // Simulate mouse enter to initialize the scrubbing state
      scrubbing.containerProps.onMouseEnter();
    }
  }, [activeScrubbingIndex]); // Don't include scrubbing.containerProps to avoid loops

  // Clear scrubbing preview on scroll - prevents preview from "following" when scrolling quickly
  useEffect(() => {
    if (activeScrubbingIndex === null) return;

    const handleScroll = () => {
      setActiveScrubbingIndex(null);
      scrubbing.reset();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeScrubbingIndex, scrubbing]);

  // Build segment lookup: pairShotGenerationId → segment slot.
  // Pair-first rendering: iterate over pairs and look up segments by ID,
  // instead of iterating segments and looking up positions by index.
  // This eliminates index-translation bugs between different position maps.
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

  // Display slots: ONLY actual video content (children).
  // No placeholders when segments exist — prevents empty slots during transitions.
  // Placeholders only appear for first-time experience (no segments generated yet).
  const displaySlots = useMemo(() => {
    const children: typeof rawSegmentSlots = [];

    // Collect child segments matched to current pairs.
    // Iterate pairInfo (matches segmentPositions count), enrich with pairDataByIndex.
    for (const pair of pairInfo) {
      const pairData = pairDataByIndex?.get(pair.index);
      const startImageId = pairData?.startImage?.id;
      const segment = startImageId ? segmentByPairShotGenId.get(startImageId) : undefined;
      if (segment?.type === 'child') {
        children.push({ ...segment, index: pair.index });
      }
    }

    // Trailing video (only actual video, not placeholder)
    const trailingIndex = pairInfo.length;
    if (lastImageId) {
      const trailingSegment = segmentByPairShotGenId.get(lastImageId);
      const isTrailingVideo = trailingSegment?.type === 'child'
        && (!pairDataByIndex || ![...pairDataByIndex.values()].some(pd => pd.startImage?.id === lastImageId));
      if (isTrailingVideo && trailingSegment) {
        children.push({ ...trailingSegment, index: trailingIndex, isTrailingSegment: true } as typeof rawSegmentSlots[number]);
      }
    }

    // If we have actual videos, return just those — no placeholders, no empty slots
    if (children.length > 0) {
      // Add trailing placeholder only if user explicitly configured trailing but no video yet
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

    // No videos at all — first-time experience: show placeholders
    const placeholders: typeof rawSegmentSlots = [];

    if (trailingSegmentMode && pairInfo.length === 0) {
      // Single-image trailing mode
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

    // Always iterate pairInfo (matches segmentPositions count).
    // Enrich with pairDataByIndex when available.
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

  // Get the active segment's video URL (must be after segmentSlots is defined)
  const activeSegmentSlot = activeScrubbingIndex !== null ? displaySlots[activeScrubbingIndex] : null;
  const activeSegmentVideoUrl = activeSegmentSlot?.type === 'child' ? activeSegmentSlot.child.location : null;

  // Connect preview video to scrubbing hook when active segment changes
  useEffect(() => {
    if (previewVideoRef.current && activeScrubbingIndex !== null) {
      scrubbing.setVideoElement(previewVideoRef.current);
    }
  }, [activeScrubbingIndex, activeSegmentVideoUrl, scrubbing.setVideoElement]);

  // Pending task checker — prefer the prop (includes optimistic state), fall back to always-false
  const hasPendingTask = hasPendingTaskProp ?? (() => false);

  // Build segment info for source image change detection
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

        // Get generation IDs - check multiple locations (individual params, top-level, orchestrator arrays)
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

  // Check for recent source image changes (shows warning for 5 minutes after change)
  const { hasRecentMismatch } = useSourceImageChanges(segmentSourceInfo, !readOnly);
  
  // Log when segmentSlots changes (to track what's being displayed)
  React.useEffect(() => {
    const childSlots = displaySlots.filter(s => s.type === 'child');
  }, [displaySlots]);
  
  // Mark generation as viewed (updates the primary variant's viewed_at)
  const markGenerationViewed = useCallback(async (generationId: string) => {
    try {
      // First check if a variant exists
      const { data: variants, error: checkError } = await supabase
        .from('generation_variants')
        .select('id, viewed_at')
        .eq('generation_id', generationId)
        .eq('is_primary', true);

      if (checkError) {
        handleError(checkError, { context: 'SegmentOutputStrip', showToast: false });
        return;
      }

      if (!variants || variants.length === 0) {
        return;
      }

      // Update the primary variant's viewed_at
      const { error } = await supabase
        .from('generation_variants')
        .update({ viewed_at: new Date().toISOString() })
        .eq('generation_id', generationId)
        .eq('is_primary', true)
        .is('viewed_at', null); // Only update if not already viewed

      if (error) {
        handleError(error, { context: 'SegmentOutputStrip', showToast: false });
      } else {
        // Invalidate variant badges to refresh NEW state
        queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantBadges });
      }
    } catch (error) {
      handleError(error, { context: 'SegmentOutputStrip', showToast: false });
    }
  }, [queryClient]);

  // Handle opening segment in lightbox
  // When onOpenPairSettings is provided, use the unified segment slot lightbox
  // Otherwise fall back to the local MediaLightbox
  // NOTE: We pass the slot directly to avoid array index mismatches between displaySlots and segmentSlots
  const handleSegmentClick = useCallback((slot: typeof displaySlots[number], slotIndex: number) => {

    // Clear scrubbing state before opening lightbox to prevent preview from getting stuck
    setActiveScrubbingIndex(null);
    scrubbing.reset();

    if (slot?.type === 'child') {
      // Mark as viewed when opening lightbox
      markGenerationViewed(slot.child.id);
    }

    // Use unified segment slot lightbox when available (enables navigation to slots without videos)
    if (onOpenPairSettings && slot) {
      // Pass frame data directly from pairInfo - this is the displayed source of truth
      const pairFrameData = pairInfo.find(p => p.index === slot.index);
      onOpenPairSettings(slot.index, pairFrameData ? {
        frames: pairFrameData.frames,
        startFrame: pairFrameData.startFrame,
        endFrame: pairFrameData.endFrame,
      } : undefined);
    } else {
      // Fallback to local lightbox
      setLightboxIndex(slotIndex);
    }
  }, [markGenerationViewed, onOpenPairSettings, scrubbing]);
  
  // Lightbox navigation - get indices of child slots that have locations
  const childSlotIndices = useMemo(() =>
    displaySlots
      .map((slot, idx) => slot.type === 'child' && slot.child.location ? idx : null)
      .filter((idx): idx is number => idx !== null),
    [displaySlots]
  );
  
  const handleLightboxNext = useCallback(() => {
    if (lightboxIndex === null || childSlotIndices.length === 0) return;
    const currentPos = childSlotIndices.indexOf(lightboxIndex);
    const nextPos = (currentPos + 1) % childSlotIndices.length;
    setLightboxIndex(childSlotIndices[nextPos]);
  }, [lightboxIndex, childSlotIndices]);
  
  const handleLightboxPrev = useCallback(() => {
    if (lightboxIndex === null || childSlotIndices.length === 0) return;
    const currentPos = childSlotIndices.indexOf(lightboxIndex);
    const prevPos = (currentPos - 1 + childSlotIndices.length) % childSlotIndices.length;
    setLightboxIndex(childSlotIndices[prevPos]);
  }, [lightboxIndex, childSlotIndices]);
  
  const handleLightboxClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);
  
  const getPairShotGenIdFromParams = useCallback((params: Record<string, unknown> | null | undefined) => {
    if (!params) return null;
    const individualParams = (params.individual_segment_params || {}) as Record<string, unknown>;
    return (individualParams.pair_shot_generation_id as string) || (params.pair_shot_generation_id as string) || null;
  }, []);

  // Handle segment deletion - delete ALL children for the same pair
  const handleDeleteSegment = useCallback(async (generationId: string) => {
    setDeletingSegmentId(generationId);
    try {

      // Fetch the generation to find its parent and pair_shot_generation_id
      const { data: beforeData, error: fetchError } = await supabase
        .from('generations')
        .select('id, type, parent_generation_id, location, params, primary_variant_id, pair_shot_generation_id')
        .eq('id', generationId)
        .single();

      if (!beforeData) {
        return;
      }

      // Use FK column first, fall back to params for legacy data
      const pairShotGenId = beforeData.pair_shot_generation_id || getPairShotGenIdFromParams(beforeData.params as Record<string, unknown> | null);
      const parentId = beforeData.parent_generation_id;

      // Delete ALL child generations for this pair (prevents another segment from taking its slot)
      let idsToDelete = [generationId];
      if (pairShotGenId && parentId) {
        const { data: siblings } = await supabase
          .from('generations')
          .select('id, pair_shot_generation_id, params')
          .eq('parent_generation_id', parentId);

        idsToDelete = (siblings || [])
          .filter(child => {
            // Use FK column first, fall back to params for legacy data
            const childPairId = child.pair_shot_generation_id || getPairShotGenIdFromParams(child.params as Record<string, unknown> | null);
            return childPairId === pairShotGenId;
          })
          .map(child => child.id);
      }

      const { error: deleteError } = await supabase
        .from('generations')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        throw new Error(`Failed to delete: ${deleteError.message}`);
      }
      
      // OPTIMISTIC UPDATE: Remove the deleted item from cache immediately
      
      // Find and update the segment-child-generations cache
      // Partial key match for all segment children
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === queryKeys.segments.childrenAll[0] },
        (oldData: unknown) => {
          if (!oldData || !Array.isArray(oldData)) return oldData;
          const filtered = (oldData as Array<{ id: string }>).filter((item) => !idsToDelete.includes(item.id));
          return filtered;
        }
      );
      
      // Then invalidate and refetch to get fresh data from server
      // Partial key match for all segment children
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.segments.childrenAll[0],
        refetchType: 'all'
      });
      // Partial key match for all segment parents
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.segments.parentsAll[0],
        refetchType: 'all'
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
      
    } catch (error) {
      handleError(error, { context: 'SegmentDelete', toastTitle: 'Failed to delete segment' });
    } finally {
      setDeletingSegmentId(null);
    }
  }, [getPairShotGenIdFromParams, queryClient]);

  // Report trailing video URL to parent (for extract final frame feature)
  useEffect(() => {
    if (!onTrailingVideoInfo || !lastImageId) {
      if (onTrailingVideoInfo) onTrailingVideoInfo(null);
      return;
    }

    // Find a segment slot that matches the last image's ID (trailing video)
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

  // Get current lightbox media - use displaySlots since lightboxIndex comes from displaySlots.map
  const currentLightboxSlot = useMemo(() =>
    lightboxIndex !== null ? displaySlots[lightboxIndex] : null,
    [lightboxIndex, displaySlots]
  );
  const currentLightboxMedia = useMemo(() => 
    currentLightboxSlot?.type === 'child' ? currentLightboxSlot.child : null,
    [currentLightboxSlot]
  );
  
  // ============================================================================
  // MEMOIZED LIGHTBOX PROPS
  // These prevent creating new object references on every render which would
  // cause MediaLightbox to re-render unnecessarily.
  // ============================================================================

  // Memoized media prop for segment lightbox
  const lightboxMedia = useMemo(() => {
    if (!currentLightboxMedia) return null;
    return {
      ...currentLightboxMedia,
      // Only override parent_generation_id if selectedParentId is set
      ...(selectedParentId ? { parent_generation_id: selectedParentId } : {}),
    } as GenerationRow;
  }, [currentLightboxMedia, selectedParentId]);

  // Memoized currentSegmentImages prop
  const lightboxCurrentSegmentImages = useMemo(() => {
    const pairData = currentLightboxSlot ? pairDataByIndex?.get(currentLightboxSlot.index) : undefined;
    const slotChildId = currentLightboxSlot?.type === 'child' ? currentLightboxSlot.child.id : undefined;
    return {
      startShotGenerationId: pairData?.startImage?.id || currentLightboxSlot?.pairShotGenerationId,
      activeChildGenerationId: slotChildId,
      startUrl: pairData?.startImage?.url,
      endUrl: pairData?.endImage?.url,
      startGenerationId: pairData?.startImage?.generationId,
      endGenerationId: pairData?.endImage?.generationId,
      startVariantId: pairData?.startImage?.primaryVariantId,
      endVariantId: pairData?.endImage?.primaryVariantId,
    };
  }, [currentLightboxSlot, pairDataByIndex]);

  // Memoized currentFrameCount prop
  const lightboxCurrentFrameCount = useMemo(() => {
    const pairData = currentLightboxSlot ? pairDataByIndex?.get(currentLightboxSlot.index) : undefined;
    return pairData?.frames;
  }, [currentLightboxSlot, pairDataByIndex]);

  // Calculate segment positions based on pair info
  // Uses same coordinate system as timeline for alignment
  const segmentPositions = useMemo(() => {
    if (fullRange <= 0 || containerWidth <= 0) return [];

    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);

    // Handle single-image mode - create a single position spanning from image to endpoint
    if (trailingSegmentMode && pairInfo.length === 0) {
      const startPixel = TIMELINE_PADDING_OFFSET + ((trailingSegmentMode.imageFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((trailingSegmentMode.endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;

      const leftPercent = (startPixel / containerWidth) * 100;
      const widthPercent = (width / containerWidth) * 100;

      return [{
        pairIndex: 0,
        leftPercent,
        widthPercent,
      }];
    }

    if (!pairInfo.length) return [];

    const positions = pairInfo.map((pair) => {
      // Calculate pixel positions using same formula as timeline
      const startPixel = TIMELINE_PADDING_OFFSET + ((pair.startFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((pair.endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;

      // Convert to percentages for CSS
      const leftPercent = (startPixel / containerWidth) * 100;
      const widthPercent = (width / containerWidth) * 100;

      return {
        pairIndex: pair.index,
        leftPercent,
        widthPercent,
      };
    });

    // Add trailing segment position for multi-image mode
    if (trailingSegmentMode && pairInfo.length > 0) {
      const startPixel = TIMELINE_PADDING_OFFSET + ((trailingSegmentMode.imageFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((trailingSegmentMode.endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;

      const leftPercent = (startPixel / containerWidth) * 100;
      const widthPercent = (width / containerWidth) * 100;

      positions.push({
        pairIndex: pairInfo.length, // Trailing index is after all pairs
        leftPercent,
        widthPercent,
      });
    }

    return positions;
  }, [pairInfo, fullMin, fullRange, containerWidth, trailingSegmentMode]);

  // ===== NOW WE CAN HAVE EARLY RETURNS =====

  // Calculate preview dimensions based on aspect ratio
  // NOTE: This must be before the early return to follow React's rules of hooks
  const previewDimensions = useMemo(() => {
    const maxHeight = 200;
    if (!projectAspectRatio) return { width: Math.round(maxHeight * 16 / 9), height: maxHeight };
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) {
      const aspectRatio = w / h;
      return { width: Math.round(maxHeight * aspectRatio), height: maxHeight };
    }
    return { width: Math.round(maxHeight * 16 / 9), height: maxHeight };
  }, [projectAspectRatio]);

  // Handle scrubbing start - capture the segment's position for preview placement
  const handleScrubbingStart = useCallback((index: number, segmentRect: DOMRect) => {
    setActiveScrubbingIndex(index);
    // Position preview centered above the hovered segment
    setPreviewPosition({
      x: segmentRect.left + segmentRect.width / 2,
      y: segmentRect.top,
    });
  }, []);

  // Calculate clamped preview position to keep it within viewport
  const clampedPreviewX = useMemo(() => {
    const padding = 16;
    const halfWidth = previewDimensions.width / 2;
    const minX = padding + halfWidth;
    const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1920) - padding - halfWidth;
    return Math.max(minX, Math.min(maxX, previewPosition.x));
  }, [previewPosition.x, previewDimensions.width]);

  // Don't render if no pairs AND not in single-image mode
  if (pairInfo.length === 0 && !trailingSegmentMode) {
    return null;
  }

  return (
    <div className="w-full relative" ref={stripContainerRef}>
      {/* Scrubbing Preview Area - rendered via portal to escape container */}
      {activeScrubbingIndex !== null && activeSegmentVideoUrl && createPortal(
        <div
          className="fixed pointer-events-none"
          style={{
            left: `${clampedPreviewX}px`,
            top: `${previewPosition.y - previewDimensions.height - 16}px`,
            transform: 'translateX(-50%)',
            zIndex: 999999,
          }}
        >
          <div
            className="relative bg-black rounded-lg overflow-hidden shadow-xl border-2 border-primary/50"
            style={{
              width: previewDimensions.width,
              height: previewDimensions.height,
            }}
          >
            <video
              ref={previewVideoRef}
              src={getDisplayUrl(activeSegmentVideoUrl)}
              className="w-full h-full object-contain"
              muted
              playsInline
              preload="auto"
              loop
              {...scrubbing.videoProps}
            />

            {/* Scrubber progress bar */}
            {scrubbing.scrubberPosition !== null && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div
                  className={cn(
                    "h-full bg-primary transition-opacity duration-200",
                    scrubbing.scrubberVisible ? "opacity-100" : "opacity-50"
                  )}
                  style={{ width: `${scrubbing.scrubberPosition}%` }}
                />
              </div>
            )}

            {/* Segment label */}
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              Segment {(activeSegmentSlot?.index ?? 0) + 1}
              {scrubbing.duration > 0 && (
                <span className="ml-2 text-white/70">
                  {scrubbing.currentTime.toFixed(1)}s / {scrubbing.duration.toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Segment output strip - compact height for segment thumbnails */}
      <div
        className="relative h-32 mt-3 mb-1"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          overflow: 'visible',
        }}
      >
        {/* Segment thumbnails - positioned to align with timeline pairs */}
        <div className="absolute left-0 right-0 top-5 bottom-1 overflow-visible">
          {displaySlots.length > 0 && segmentPositions.length > 0 ? (() => {
            const hasAnySegments = displaySlots.some(s => s.type === 'child');
            return (
            <div className="relative w-full h-full">
              {displaySlots.map((slot, index) => {
                const position = segmentPositions.find(p => p.pairIndex === slot.index);

                if (!position) {
                  return null;
                }

                const isTrailingSlot = 'isTrailingSegment' in slot && slot.isTrailingSegment === true;
                if (slot.type === 'placeholder' && hasAnySegments && !isTrailingSlot) {
                  return null;
                }

                const isActiveScrubbing = activeScrubbingIndex === index;

                // Check if source images have recent changes (for warning indicator)
                const segmentId = slot.type === 'child' ? slot.child.id : null;
                const hasSourceChanged = segmentId ? hasRecentMismatch(segmentId) : false;

                return (
                  <React.Fragment key={slot.type === 'child' ? slot.child.id : `placeholder-${index}`}>
                    <InlineSegmentVideo
                      slot={slot}
                      pairIndex={slot.index}
                      onClick={() => {
                        handleSegmentClick(slot, index);
                      }}
                      projectAspectRatio={projectAspectRatio}
                      isMobile={isMobile}
                      leftPercent={position.leftPercent}
                      widthPercent={position.widthPercent}
                      onOpenPairSettings={onOpenPairSettings ? (pairIdx: number) => {
                        // Pass frame data from pairInfo - the displayed source of truth
                        const pairFrameData = pairInfo.find(p => p.index === pairIdx);
                        onOpenPairSettings(pairIdx, pairFrameData ? {
                          frames: pairFrameData.frames,
                          startFrame: pairFrameData.startFrame,
                          endFrame: pairFrameData.endFrame,
                        } : undefined);
                      } : undefined}
                      onDelete={handleDeleteSegment}
                      isDeleting={slot.type === 'child' && slot.child.id === deletingSegmentId}
                      isPending={hasPendingTask(slot.pairShotGenerationId)}
                      hasSourceChanged={hasSourceChanged}
                      // Scrubbing props - when active, this segment controls the preview
                      isScrubbingActive={isActiveScrubbing}
                      onScrubbingStart={(rect: DOMRect) => handleScrubbingStart(index, rect)}
                      scrubbingContainerRef={isActiveScrubbing ? scrubbing.containerRef : undefined}
                      scrubbingContainerProps={isActiveScrubbing ? scrubbing.containerProps : undefined}
                      scrubbingProgress={isActiveScrubbing ? scrubbing.progress : undefined}
                      readOnly={readOnly}
                    />
                    {/* X button to remove trailing segment - hide when video exists or pending */}
                    {isTrailingSlot && onRemoveTrailingSegment && !readOnly &&
                      slot.type !== 'child' && !hasPendingTask(slot.pairShotGenerationId) && (
                      <button
                        className="absolute z-20 w-5 h-5 rounded-full bg-muted/90 hover:bg-destructive border border-border/50 hover:border-destructive flex items-center justify-center text-muted-foreground hover:text-destructive-foreground transition-all duration-150"
                        style={{
                          left: `calc(${position.leftPercent + position.widthPercent}% - 8px)`,
                          top: '-4px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveTrailingSegment();
                        }}
                        title="Remove trailing segment"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Add trailing segment button - shows when in multi-image mode WITHOUT any trailing segment */}
              {(() => {
                return null;
              })()}
              {isMultiImage && onAddTrailingSegment && !readOnly && lastImageFrame !== undefined && fullRange > 0 && containerWidth > 0 && (() => {
                // SIMPLE LOGIC:
                // Show "+" button when NO trailing slot exists (no config AND no existing video)
                const trailingIndex = pairInfo.length;
                const trailingSlot = displaySlots.find(slot => slot.index === trailingIndex);

                // Don't show + button if any trailing slot exists
                if (trailingSlot) return null;
                // Calculate position using the same coordinate system as segments
                // Position the button starting from the last image frame
                const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
                const lastImagePixel = TIMELINE_PADDING_OFFSET + ((lastImageFrame - fullMin) / fullRange) * effectiveWidth;
                const buttonLeftPercent = (lastImagePixel / containerWidth) * 100;

                return (
                  <button
                    className="absolute top-0 bottom-0 w-7 rounded-md bg-muted/30 border-2 border-dashed border-border/40 hover:bg-muted/50 hover:border-primary/40 flex items-center justify-center cursor-pointer transition-all duration-150 group"
                    style={{ left: `calc(${buttonLeftPercent}% + 2px)` }}
                    onClick={onAddTrailingSegment}
                    title="Add trailing video segment"
                  >
                    <span className="text-xl font-light leading-none text-muted-foreground group-hover:text-foreground transition-colors">+</span>
                  </button>
                );
              })()}
            </div>
            );
          })() : (
            <div className="flex-1 h-full flex items-center justify-center text-xs text-muted-foreground">
              {isLoading ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading segments...</span>
                </div>
              ) : (
                <span>No segments generated yet</span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Lightbox for segment videos */}
      {lightboxMedia && (
        <MediaLightbox
          media={lightboxMedia}
          onClose={handleLightboxClose}
          onNext={handleLightboxNext}
          onPrevious={handleLightboxPrev}
          showNavigation={true}
          showImageEditTools={false}
          showDownload={true}
          hasNext={childSlotIndices.length > 1}
          hasPrevious={childSlotIndices.length > 1}
          starred={currentLightboxMedia?.starred ?? false}
          shotId={shotId}
          showTaskDetails={true}
          showVideoTrimEditor={true}
          fetchVariantsForSelf={true}
          currentSegmentImages={lightboxCurrentSegmentImages}
          onSegmentFrameCountChange={onSegmentFrameCountChange}
          currentFrameCount={lightboxCurrentFrameCount}
        />
      )}
      
    </div>
  );
};
