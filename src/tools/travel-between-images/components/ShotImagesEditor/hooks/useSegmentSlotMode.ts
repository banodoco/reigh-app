/**
 * Hook for managing segment slot lightbox state.
 * Orchestrates pair data, frame updates, and builds SegmentSlotModeData.
 *
 * Uses:
 * - usePairData: Pair computation
 * - useFrameCountUpdater: Frame count updates
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SegmentSlotModeData } from '@/shared/components/MediaLightbox/types';
import type { PairData } from '../../Timeline/TimelineContainer';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { GenerationRow } from '@/types/shots';
import type { SegmentSlot } from '@/shared/hooks/segments';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';
import { usePairData } from './usePairData';
import { useFrameCountUpdater } from './useFrameCountUpdater';

export interface UseSegmentSlotModeProps {
  selectedShotId: string;
  projectId?: string;
  effectiveGenerationMode: 'batch' | 'timeline';
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
}

export interface UseSegmentSlotModeReturn {
  segmentSlotLightboxIndex: number | null;
  setSegmentSlotLightboxIndex: (index: number | null) => void;
  activePairData: PairData | null;
  setActivePairData: (data: PairData | null) => void;
  pendingImageToOpen: string | null;
  setPendingImageToOpen: (id: string | null) => void;
  pairDataByIndex: Map<number, PairData>;
  segmentSlotModeData: SegmentSlotModeData | null;
  handlePairClick: (pairIndex: number, passedPairData?: PairData) => void;
  updatePairFrameCount: (pairShotGenerationId: string, newFrameCount: number) => Promise<{ finalFrameCount: number } | void>;
}

export function useSegmentSlotMode(props: UseSegmentSlotModeProps): UseSegmentSlotModeReturn {
  const {
    selectedShotId,
    projectId,
    effectiveGenerationMode,
    batchVideoFrames,
    shotGenerations,
    segmentSlots,
    selectedParentId,
    defaultPrompt,
    defaultNegativePrompt,
    resolvedProjectResolution,
    structureVideos,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    onSetStructureVideos,
    maxFrameLimit,
    loadPositions,
    navigateWithTransition,
    addOptimisticPending,
  } = props;

  const location = useLocation();
  const navigate = useNavigate();

  // ==========================================================================
  // STATE
  // ==========================================================================

  const [segmentSlotLightboxIndex, setSegmentSlotLightboxIndex] = useState<number | null>(null);
  const [activePairData, setActivePairData] = useState<PairData | null>(null);
  const [pendingImageToOpen, setPendingImageToOpen] = useState<string | null>(null);
  const frameCountDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================================================
  // COMPOSED HOOKS
  // ==========================================================================

  const { pairDataByIndex } = usePairData({
    shotGenerations,
    generationMode: effectiveGenerationMode,
    batchVideoFrames,
  });

  const { updatePairFrameCount } = useFrameCountUpdater({
    shotGenerations,
    generationMode: effectiveGenerationMode,
    maxFrameLimit,
    loadPositions,
  });

  // ==========================================================================
  // DEEP-LINKING: Open segment from URL state
  // ==========================================================================

  useEffect(() => {
    const state = location.state as { openSegmentSlot?: string; fromShotClick?: boolean } | null;

    console.log('[DeepLink] Effect running:', {
      hasOpenSegmentSlot: !!state?.openSegmentSlot,
      openSegmentSlot: state?.openSegmentSlot?.substring(0, 8),
      pairDataByIndexSize: pairDataByIndex.size,
      segmentSlotsCount: segmentSlots.length,
      segmentSlotTypes: segmentSlots.map(s => ({ index: s.index, type: s.type })),
    });

    if (!state?.openSegmentSlot || pairDataByIndex.size === 0) return;

    // Find pair where startImage.id matches
    for (const [pairIndex, pairData] of pairDataByIndex.entries()) {
      console.log('[DeepLink] Checking pair:', {
        pairIndex,
        startImageId: pairData.startImage.id?.substring(0, 8),
        matchesOpenSegmentSlot: pairData.startImage.id === state.openSegmentSlot,
      });

      if (pairData.startImage.id === state.openSegmentSlot) {
        // Check if segmentSlots has the video loaded for this pair
        // This prevents the SegmentEditorModal from flashing before MediaLightbox
        const matchingSlot = segmentSlots.find(s => s.index === pairIndex);
        const hasVideo = matchingSlot?.type === 'child' && matchingSlot.child?.location;

        console.log('[DeepLink] ✅ MATCH FOUND:', {
          pairIndex,
          hasMatchingSlot: !!matchingSlot,
          slotType: matchingSlot?.type,
          hasVideo,
        });

        if (!hasVideo) {
          // Video not loaded yet - wait for next render when segmentSlots updates
          console.log('[DeepLink] ⏳ Waiting for video to load in segmentSlots...');
          return;
        }

        console.log('[DeepLink] 🎬 Opening lightbox with video for pair:', pairIndex);
        setActivePairData(pairData);
        setSegmentSlotLightboxIndex(pairIndex);
        navigate(location.pathname + location.hash, {
          replace: true,
          state: { fromShotClick: state.fromShotClick }
        });
        break;
      }
    }
  }, [location.state, pairDataByIndex, segmentSlots, navigate, location.pathname, location.hash]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handlePairClick = useCallback((pairIndex: number, passedPairData?: PairData) => {
    console.log('[TrailingGen] useSegmentSlotMode.handlePairClick:', {
      pairIndex,
      hasPassedPairData: !!passedPairData,
      passedEndImage: passedPairData?.endImage,
      pairDataByIndexSize: pairDataByIndex.size,
    });
    const pairData = passedPairData || pairDataByIndex.get(pairIndex);
    if (pairData) {
      setActivePairData(pairData);
    }
    setSegmentSlotLightboxIndex(pairIndex);
  }, [pairDataByIndex]);

  // ==========================================================================
  // BUILD SEGMENT SLOT MODE DATA
  // ==========================================================================

  const segmentSlotModeData: SegmentSlotModeData | null = useMemo(() => {
    console.log('[DeepLink] segmentSlotModeData computing:', {
      segmentSlotLightboxIndex,
      hasActivePairData: !!activePairData,
      segmentSlotsCount: segmentSlots.length,
    });

    if (segmentSlotLightboxIndex === null || !activePairData) return null;

    const pairData = activePairData;
    const pairSlot = segmentSlots.find(slot => slot.index === segmentSlotLightboxIndex);
    const segmentVideo = pairSlot?.type === 'child' ? pairSlot.child : null;

    console.log('[DeepLink] segmentSlotModeData building:', {
      pairIndex: segmentSlotLightboxIndex,
      foundPairSlot: !!pairSlot,
      pairSlotType: pairSlot?.type,
      hasSegmentVideo: !!segmentVideo,
      segmentVideoId: segmentVideo?.id?.substring(0, 8),
    });

    const pairStartFrame = pairData.startFrame ?? 0;
    const pairEndFrame = pairData.endFrame ?? 0;

    // Find covering structure video
    const coveringVideo = (structureVideos || []).find(video => {
      const videoStart = video.start_frame ?? 0;
      const videoEnd = video.end_frame ?? Infinity;
      return pairEndFrame > videoStart && pairStartFrame < videoEnd;
    }) ?? (effectiveGenerationMode === 'batch' && structureVideos?.[0]);

    // Get prompts from metadata
    const shotGen = shotGenerations.find(shotGen => shotGen.id === pairData.startImage?.id);
    const overrides = readSegmentOverrides(shotGen?.metadata as Record<string, unknown> | null);

    return {
      currentIndex: segmentSlotLightboxIndex,
      totalPairs: pairDataByIndex.size,
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

      // Navigation
      onNavigateToPair: (index: number) => {
        const targetPairData = pairDataByIndex.get(index);
        if (!targetPairData) return;

        const currentHasVideo = !!segmentVideo;
        const targetSlot = segmentSlots.find(slot => slot.index === index);
        const targetHasVideo = targetSlot?.type === 'child';

        if (currentHasVideo !== targetHasVideo) {
          navigateWithTransition(() => {
            setActivePairData(targetPairData);
            setSegmentSlotLightboxIndex(index);
          });
        } else {
          setActivePairData(targetPairData);
          setSegmentSlotLightboxIndex(index);
        }
      },

      // IDs
      projectId: projectId || null,
      shotId: selectedShotId,
      parentGenerationId: selectedParentId || undefined,

      // Prompts
      pairPrompt: overrides.prompt || '',
      pairNegativePrompt: overrides.negativePrompt || '',
      defaultPrompt,
      defaultNegativePrompt,
      enhancedPrompt: shotGen?.metadata?.enhanced_prompt || '',
      projectResolution: resolvedProjectResolution,

      // Structure video
      structureVideoType: coveringVideo?.structure_type ?? null,
      structureVideoDefaults: coveringVideo ? {
        motionStrength: coveringVideo.motion_strength ?? 1.2,
        treatment: coveringVideo.treatment ?? 'adjust',
        uni3cEndPercent: coveringVideo.uni3c_end_percent ?? 0.1,
      } : undefined,
      structureVideoUrl: coveringVideo?.path,
      structureVideoFrameRange: (effectiveGenerationMode === 'timeline' || coveringVideo) ? {
        segmentStart: pairStartFrame,
        segmentEnd: pairEndFrame,
        videoTotalFrames: coveringVideo?.metadata?.total_frames ?? 60,
        videoFps: coveringVideo?.metadata?.frame_rate ?? 24,
        // Video's output range on timeline (for calculating segment-specific frames in "fit to range" mode)
        videoOutputStart: coveringVideo?.start_frame ?? 0,
        videoOutputEnd: coveringVideo?.end_frame ?? pairEndFrame,
      } : undefined,

      // Callbacks
      // Frame count changes are handled by useFrameCountUpdater which supports both:
      // - Normal pairs (shifts subsequent images)
      // - Trailing segments (updates metadata.end_frame)
      onFrameCountChange: (pairShotGenerationId: string, frameCount: number) => {
        if (effectiveGenerationMode === 'batch') return;

        if (frameCountDebounceRef.current) clearTimeout(frameCountDebounceRef.current);
        frameCountDebounceRef.current = setTimeout(() => {
          updatePairFrameCount(pairShotGenerationId, frameCount);
        }, 150);
      },
      onGenerateStarted: (pairShotGenerationId) => addOptimisticPending(pairShotGenerationId),
      maxFrameLimit,

      // Structure video management (Timeline mode)
      isTimelineMode: effectiveGenerationMode === 'timeline',
      existingStructureVideos: structureVideos ?? [],
      onAddSegmentStructureVideo: (video) => {
        if (effectiveGenerationMode !== 'timeline' || !onSetStructureVideos) {
          onAddStructureVideo?.(video);
          return;
        }
        // Resolve overlaps
        const newStart = video.start_frame ?? 0;
        const newEnd = video.end_frame ?? Infinity;
        const updatedVideos = (structureVideos || []).flatMap((existing) => {
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
        }).filter(video => (video.end_frame ?? Infinity) > (video.start_frame ?? 0));
        onSetStructureVideos([...updatedVideos, video]);
      },
      onUpdateSegmentStructureVideo: (updates) => {
        if (!onUpdateStructureVideo || !coveringVideo || !structureVideos) return;
        const index = structureVideos.findIndex(video => video.path === coveringVideo.path);
        if (index >= 0) onUpdateStructureVideo(index, updates);
      },
      onRemoveSegmentStructureVideo: () => {
        if (!onRemoveStructureVideo || !coveringVideo || !structureVideos) return;
        const index = structureVideos.findIndex(video => video.path === coveringVideo.path);
        if (index >= 0) onRemoveStructureVideo(index);
      },

      // Navigate back to constituent image
      onNavigateToImage: (shotGenerationId: string) => {
        navigateWithTransition(() => {
          setSegmentSlotLightboxIndex(null);
          setPendingImageToOpen(shotGenerationId);
        });
      },
    };
  }, [
    segmentSlotLightboxIndex, activePairData, segmentSlots, pairDataByIndex,
    structureVideos, effectiveGenerationMode, shotGenerations, projectId,
    selectedShotId, selectedParentId, defaultPrompt, defaultNegativePrompt,
    resolvedProjectResolution, addOptimisticPending, maxFrameLimit,
    navigateWithTransition, updatePairFrameCount, onAddStructureVideo,
    onUpdateStructureVideo, onRemoveStructureVideo, onSetStructureVideos,
  ]);

  return {
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    activePairData,
    setActivePairData,
    pendingImageToOpen,
    setPendingImageToOpen,
    pairDataByIndex,
    segmentSlotModeData,
    handlePairClick,
    updatePairFrameCount,
  };
}
