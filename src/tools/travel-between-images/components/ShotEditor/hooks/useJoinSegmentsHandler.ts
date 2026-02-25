/**
 * useJoinSegmentsHandler - Handles join segments task creation
 *
 * Manages the join segments action, validation, and task creation.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { createCanonicalJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { GenerationRow } from '@/domains/generation/types';
import { joinClipsSettings } from '@/shared/lib/joinClipsDefaults';
import { DEFAULT_VACE_PHASE_CONFIG, BUILTIN_VACE_DEFAULT_ID } from '@/shared/lib/vaceDefaults';
import { useTaskPlaceholder } from '@/shared/hooks/useTaskPlaceholder';
import type { SegmentSlot } from '@/shared/hooks/segments/useSegmentOutputsForShot';
import type { PhaseConfig } from '@/shared/types/phaseConfig';

interface JoinLoraManager {
  selectedLoras: Array<{
    id: string;
    path: string;
    strength: number;
    name?: string;
  }>;
}

interface JoinSettings {
  prompt: string;
  negativePrompt: string;
  contextFrameCount: number;
  gapFrameCount: number;
  replaceMode: boolean;
  keepBridgingImages: boolean;
  enhancePrompt: boolean;
  model: string;
  numInferenceSteps: number;
  guidanceScale: number;
  seed: number;
  motionMode: 'basic' | 'advanced';
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null;
  randomSeed: boolean;
  updateField: (field: string, value: unknown) => void;
  updateFields: (fields: Record<string, unknown>) => void;
}

interface UseJoinSegmentsHandlerProps {
  projectId?: string;
  selectedProjectId?: string;
  selectedShotId?: string;
  effectiveAspectRatio?: string;
  audioUrl?: string | null;
  joinSegmentSlots: SegmentSlot[];
  joinSelectedParent?: GenerationRow | null;
  joinLoraManager: JoinLoraManager;
  joinSettings: JoinSettings;
}

interface JoinValidationData {
  shortestClipFrames: number | undefined;
  videoCount: number;
}

interface UseJoinSegmentsHandlerReturn {
  // State
  isJoiningClips: boolean;
  joinClipsSuccess: boolean;
  joinValidationData: JoinValidationData;

  // Handlers
  handleJoinSegments: () => Promise<void>;
  handleRestoreJoinDefaults: () => void;
}

export function useJoinSegmentsHandler({
  projectId,
  selectedShotId,
  effectiveAspectRatio,
  audioUrl,
  joinSegmentSlots,
  joinSelectedParent,
  joinLoraManager,
  joinSettings,
}: UseJoinSegmentsHandlerProps): UseJoinSegmentsHandlerReturn {
  const queryClient = useQueryClient();
  const runPlaceholder = useTaskPlaceholder();

  // Local state
  const [isJoiningClips, setIsJoiningClips] = useState(false);
  const [joinClipsSuccess, setJoinClipsSuccess] = useState(false);

  // Calculate validation data from segment slots
  const joinValidationData = useMemo(() => {
    // Count segments that are in valid slots AND have a location (completed videos)
    const readySlots = joinSegmentSlots.filter(
      (slot): slot is Extract<SegmentSlot, { type: 'child' }> =>
        slot.type === 'child' && Boolean(slot.child?.location)
    );

    if (readySlots.length < 2) {
      return { shortestClipFrames: undefined, videoCount: readySlots.length };
    }

    // Get frame counts from video params or metadata
    const frameCounts = readySlots.map(slot => {
      const child = slot.child;
      const params = child?.params as Record<string, unknown> | undefined;
      const metadata = child?.metadata as Record<string, unknown> | undefined;
      return (params?.frame_count as number) || (params?.num_frames as number) || (metadata?.frame_count as number) || (metadata?.frameCount as number) || 61;
    });

    return {
      shortestClipFrames: Math.min(...frameCounts),
      videoCount: readySlots.length,
    };
  }, [joinSegmentSlots]);

  // Main join segments handler
  const handleJoinSegments = useCallback(async () => {
    if (!projectId || joinValidationData.videoCount < 2) {
      toast.error('Need at least 2 completed video segments to join');
      return;
    }

    const {
      prompt: joinPrompt,
      negativePrompt: joinNegativePrompt,
      contextFrameCount: joinContextFrames,
      gapFrameCount: joinGapFrames,
      replaceMode: joinReplaceMode,
      keepBridgingImages: joinKeepBridgingImages,
      enhancePrompt: joinEnhancePrompt,
      motionMode: joinMotionMode,
      phaseConfig: joinPhaseConfig,
      selectedPhasePresetId: joinSelectedPhasePresetId,
    } = joinSettings;

    const taskLabel = joinPrompt
      ? (joinPrompt.length > 50 ? joinPrompt.substring(0, 50) + '...' : joinPrompt)
      : `Join ${joinValidationData.videoCount} segments`;

    setIsJoiningClips(true);

    try {
      await runPlaceholder({
        taskType: 'join_clips_orchestrator',
        label: taskLabel,
        context: 'JoinSegments',
        toastTitle: 'Failed to create join task',
        create: async () => {
          // Get ordered segments from segmentSlots (already sorted by pair position)
          const orderedSegments = joinSegmentSlots
            .filter((slot): slot is { type: 'child'; child: GenerationRow; index: number } =>
              slot.type === 'child' && Boolean(slot.child?.location)
            )
            .map(slot => slot.child);

          // Fetch fresh URLs from database
          const videoIds = orderedSegments.map(v => v.id).filter(Boolean);
          const { data: freshVideos, error: fetchError } = await supabase().from('generations')
            .select('id, location')
            .in('id', videoIds);

          if (fetchError) {
            normalizeAndPresentError(fetchError, { context: 'JoinSegments', showToast: false });
            throw new Error('Failed to fetch video URLs');
          }

          const freshUrlMap = new Map(freshVideos?.map(v => [v.id, v.location]) || []);

          const clips = orderedSegments.map((video, index) => ({
            url: freshUrlMap.get(video.id) || video.location || '',
            name: `Segment ${index + 1}`,
          })).filter(c => c.url);

          // Convert selected LoRAs
          const lorasForTask = joinLoraManager.selectedLoras.map(lora => ({
            path: lora.path,
            strength: lora.strength,
          }));

          // Parse resolution from aspect ratio
          let resolutionTuple: [number, number] | undefined;
          if (effectiveAspectRatio && ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio]) {
            const res = ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio];
            const [w, h] = res.split('x').map(Number);
            if (w && h) {
              resolutionTuple = [w, h];
            }
          }

          return createCanonicalJoinClipsTask({
            project_id: projectId,
            shot_id: selectedShotId,
            mode: 'multi_clip',
            clip_source: {
              kind: 'clips',
              clips,
            },
            prompt: joinPrompt,
            negative_prompt: joinNegativePrompt,
            context_frame_count: joinContextFrames,
            gap_frame_count: joinGapFrames,
            replace_mode: joinReplaceMode,
            keep_bridging_images: joinKeepBridgingImages,
            enhance_prompt: joinEnhancePrompt,
            model: joinSettings.model,
            num_inference_steps: joinSettings.numInferenceSteps,
            guidance_scale: joinSettings.guidanceScale,
            seed: joinSettings.seed,
            parent_generation_id: joinSelectedParent?.id,
            tool_type: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
            use_input_video_resolution: false,
            use_input_video_fps: false,
            motion_mode: joinMotionMode,
            selected_phase_preset_id: joinSelectedPhasePresetId ?? null,
            ...(lorasForTask.length > 0 && { loras: lorasForTask }),
            ...(resolutionTuple && { resolution: resolutionTuple }),
            ...(audioUrl && { audio_url: audioUrl }),
            ...(joinPhaseConfig && { phase_config: joinPhaseConfig }),
          });
        },
        onSuccess: () => {
          setJoinClipsSuccess(true);
          setTimeout(() => setJoinClipsSuccess(false), 1500);
          queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
        },
      });
    } finally {
      setIsJoiningClips(false);
    }
  }, [
    projectId,
    selectedShotId,
    joinValidationData.videoCount,
    joinSegmentSlots,
    joinSettings,
    joinLoraManager.selectedLoras,
    effectiveAspectRatio,
    audioUrl,
    joinSelectedParent,
    queryClient,
    runPlaceholder,
  ]);

  // Handler to restore join clips defaults
  const handleRestoreJoinDefaults = useCallback(() => {
    const defaults = joinClipsSettings.defaults;
    let context = defaults.contextFrameCount;
    let gap = defaults.gapFrameCount;

    // Scale down proportionally if constraint is violated
    const shortestFrames = joinValidationData.shortestClipFrames;
    if (shortestFrames && shortestFrames > 0) {
      const framesNeeded = gap + 2 * context;
      if (framesNeeded > shortestFrames) {
        const scale = shortestFrames / framesNeeded;
        context = Math.max(4, Math.floor(context * scale));
        gap = Math.max(1, Math.floor(gap * scale));
      }
    }

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
    isJoiningClips,
    joinClipsSuccess,
    joinValidationData,
    handleJoinSegments,
    handleRestoreJoinDefaults,
  };
}
