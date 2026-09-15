/**
 * useJoinSegmentsHandler - guarded join-segments entry point.
 *
 * Ordered segment joins retain lineage, overlap, audio, and stitch semantics
 * that are not represented by a shipped canonical Astrid capability. Keep
 * validation and settings restoration available, but reject before any
 * relationship reads, placeholder state, or task construction.
 */

import { useCallback, useMemo } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { joinClipsSettings } from '@/shared/lib/joinClips/defaults';
import { scaleJoinFrameCountsToShortestClip } from '@/shared/lib/joinClips/frameScaling';
import { DEFAULT_VACE_PHASE_CONFIG, BUILTIN_VACE_DEFAULT_ID } from '@/shared/lib/vaceDefaults';
import { unsupportedLegacyTaskError } from '@/shared/lib/taskCreation/legacyBoundary';
import type { GenerationRow } from '@/domains/generation/types';
import type { SegmentSlot } from '@/shared/hooks/segments/useSegmentOutputsForShot';
import type { JoinLoraManagerForTask, JoinSettingsForTask } from './joinSegments.types';

interface UseJoinSegmentsHandlerProps {
  projectId?: string;
  selectedProjectId?: string;
  selectedShotId?: string;
  effectiveAspectRatio?: string;
  audioUrl?: string | null;
  joinSegmentSlots: SegmentSlot[];
  joinSelectedParent?: GenerationRow | null;
  joinLoraManager: JoinLoraManagerForTask;
  joinSettings: JoinSettingsForTask;
}

interface JoinValidationData {
  shortestClipFrames: number | undefined;
  videoCount: number;
}

interface UseJoinSegmentsHandlerReturn {
  isJoiningClips: boolean;
  joinClipsSuccess: boolean;
  joinValidationData: JoinValidationData;
  handleJoinSegments: () => Promise<void>;
  handleRestoreJoinDefaults: () => void;
}

export function useJoinSegmentsHandler({
  projectId,
  joinSegmentSlots,
  joinSettings,
}: UseJoinSegmentsHandlerProps): UseJoinSegmentsHandlerReturn {
  const joinValidationData = useMemo(() => {
    const readySlots = joinSegmentSlots.filter(
      (slot): slot is Extract<SegmentSlot, { type: 'child' }> =>
        slot.type === 'child' && Boolean(slot.child?.location),
    );

    if (readySlots.length < 2) {
      return { shortestClipFrames: undefined, videoCount: readySlots.length };
    }

    const frameCounts = readySlots.map(slot => {
      const params = slot.child?.params as Record<string, unknown> | undefined;
      const metadata = slot.child?.metadata as Record<string, unknown> | undefined;
      return (params?.frame_count as number)
        || (params?.num_frames as number)
        || (metadata?.frame_count as number)
        || (metadata?.frameCount as number)
        || 61;
    });

    return {
      shortestClipFrames: Math.min(...frameCounts),
      videoCount: readySlots.length,
    };
  }, [joinSegmentSlots]);

  const handleJoinSegments = useCallback(async () => {
    if (!projectId || joinValidationData.videoCount < 2) {
      toast.error('Need at least 2 completed video segments to join');
      return;
    }

    toast.error(unsupportedLegacyTaskError('join_clips').message);
  }, [projectId, joinValidationData.videoCount]);

  const handleRestoreJoinDefaults = useCallback(() => {
    const defaults = joinClipsSettings.defaults;
    const { contextFrameCount: context, gapFrameCount: gap } = scaleJoinFrameCountsToShortestClip({
      contextFrameCount: defaults.contextFrameCount,
      gapFrameCount: defaults.gapFrameCount,
      shortestClipFrames: joinValidationData.shortestClipFrames,
    });

    joinSettings.updateFields({
      prompt: defaults.prompt,
      negativePrompt: defaults.negativePrompt,
      contextFrameCount: context,
      gapFrameCount: gap,
      replaceMode: defaults.replaceMode,
      keepBridgingImages: defaults.keepBridgingImages,
      enhancePrompt: defaults.enhancePrompt,
      motionMode: defaults.motionMode,
      phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
      selectedPhasePresetId: BUILTIN_VACE_DEFAULT_ID,
      randomSeed: defaults.randomSeed,
      selectedLoras: [],
    });
  }, [joinSettings, joinValidationData.shortestClipFrames]);

  return {
    isJoiningClips: false,
    joinClipsSuccess: false,
    joinValidationData,
    handleJoinSegments,
    handleRestoreJoinDefaults,
  };
}
