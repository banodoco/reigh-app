import { useState, useCallback, useMemo } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { useQueryClient } from '@tanstack/react-query';
import { createCanonicalJoinClipsTask } from '@/shared/lib/tasks/families/joinClips';
import { resolveAspectRatioResolutionTuple } from '@/shared/lib/video/resolveAspectRatioResolutionTuple';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { joinClipsSettings } from '@/shared/lib/joinClips/defaults';
import { scaleJoinFrameCountsToShortestClip } from '@/shared/lib/joinClips/frameScaling';
import {
  flashSuccessForDuration,
  invalidateTaskAndProjectQueries,
} from '@/shared/lib/tasks/taskMutationFeedback';
import { DEFAULT_VACE_PHASE_CONFIG, BUILTIN_VACE_DEFAULT_ID, VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import type { VideoClip, TransitionPrompt } from '../clipTypes';
import type { useJoinClipsSettings } from './useJoinClipsSettings';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import type { ValidationResult } from '../utils/validation';

interface UseJoinClipsGenerateParams {
  selectedProjectId: string | null;
  clips: VideoClip[];
  transitionPrompts: TransitionPrompt[];
  joinSettings: ReturnType<typeof useJoinClipsSettings>;
  loraManager: LoraManagerState;
  projectAspectRatio: string | undefined;
  validationResult: ValidationResult | null;
}

export function useJoinClipsGenerate({
  selectedProjectId,
  clips,
  transitionPrompts,
  joinSettings,
  loraManager,
  projectAspectRatio,
  validationResult,
}: UseJoinClipsGenerateParams) {
  const queryClient = useQueryClient();
  const run = useTaskPlaceholder();

  const [isGenerating, setIsGenerating] = useState(false);
  const [showSuccessState, setShowSuccessState] = useState(false);
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState(false);

  const {
    prompt: globalPrompt,
    negativePrompt,
    contextFrameCount,
    gapFrameCount,
    replaceMode,
    keepBridgingImages,
    useIndividualPrompts,
    enhancePrompt,
    useInputVideoResolution,
    useInputVideoFps,
    noisedInputVideo,
    loopFirstClip,
    motionMode,
    phaseConfig,
  } = joinSettings.settings;

  const handleGenerate = useCallback(async () => {
    const validClips = clips.filter(c => c.url);
    const isLooping = loopFirstClip && validClips.length === 1;

    if (!isLooping && validClips.length < 2) {
      toast({
        title: 'Need at least 2 clips',
        description: 'Please upload at least 2 videos to join',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedProjectId) return;

    setIsGenerating(true);
    try {
      await run({
        taskType: 'join_clips',
        label: isLooping ? 'Loop video' : `Join ${validClips.length} clips`,
        context: 'JoinClipsPage',
        toastTitle: 'Failed to create task',
        create: () => {
          const clipsForTask = isLooping
            ? [{ url: validClips[0].url }, { url: validClips[0].url }]
            : validClips.map(clip => ({ url: clip.url }));

          const perJoinSettings = validClips.slice(1).map((clip) => {
            let finalPrompt = '';

            if (useIndividualPrompts) {
              const individualPrompt = transitionPrompts.find(p => p.id === clip.id)?.prompt || '';
              if (individualPrompt && globalPrompt) {
                finalPrompt = `${individualPrompt}. ${globalPrompt}`;
              } else if (individualPrompt) {
                finalPrompt = individualPrompt;
              } else {
                finalPrompt = globalPrompt;
              }
            } else {
              finalPrompt = globalPrompt;
            }

            return { prompt: finalPrompt };
          });

          const lorasForTask = loraManager.selectedLoras.map(lora => ({
            path: lora.path,
            strength: lora.strength,
          }));
          const resolutionTuple = resolveAspectRatioResolutionTuple(projectAspectRatio);

          const taskParams = {
            project_id: selectedProjectId,
            mode: 'multi_clip' as const,
            clip_source: {
              kind: 'clips' as const,
              clips: clipsForTask,
            },
            per_join_settings: perJoinSettings,
            context_frame_count: contextFrameCount,
            gap_frame_count: gapFrameCount,
            replace_mode: replaceMode,
            keep_bridging_images: keepBridgingImages ?? false,
            enhance_prompt: enhancePrompt,
            model: (joinSettings.settings.model?.startsWith('wan_2_2_')
              ? joinSettings.settings.model
              : VACE_GENERATION_DEFAULTS.model),
            num_inference_steps: joinSettings.settings.numInferenceSteps,
            guidance_scale: joinSettings.settings.guidanceScale,
            seed: joinSettings.settings.seed,
            negative_prompt: negativePrompt,
            priority: joinSettings.settings.priority,
            use_input_video_resolution: useInputVideoResolution,
            use_input_video_fps: useInputVideoFps,
            ...(motionMode === 'advanced' && phaseConfig
              ? { phase_config: phaseConfig }
              : lorasForTask.length > 0 && { loras: lorasForTask }
            ),
            ...(resolutionTuple && { resolution: resolutionTuple }),
            ...(noisedInputVideo > 0 && { vid2vid_init_strength: noisedInputVideo }),
            ...(isLooping && { loop_first_clip: true }),
            ...(isLooping && validClips[0].generationId && { based_on: validClips[0].generationId }),
            motion_mode: motionMode,
            selected_phase_preset_id: joinSettings.settings.selectedPhasePresetId,
            tool_type: TOOL_IDS.JOIN_CLIPS,
          };

          return createCanonicalJoinClipsTask(taskParams);
        },
        onSuccess: () => {
          flashSuccessForDuration(setShowSuccessState, 1500);
          setVideosViewJustEnabled(true);
          invalidateTaskAndProjectQueries(queryClient, selectedProjectId);
        },
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    clips,
    loopFirstClip,
    selectedProjectId,
    run,
    useIndividualPrompts,
    transitionPrompts,
    globalPrompt,
    loraManager.selectedLoras,
    projectAspectRatio,
    contextFrameCount,
    gapFrameCount,
    replaceMode,
    keepBridgingImages,
    enhancePrompt,
    joinSettings.settings,
    negativePrompt,
    useInputVideoResolution,
    useInputVideoFps,
    motionMode,
    phaseConfig,
    noisedInputVideo,
    queryClient,
  ]);

  const generateButtonText = useMemo(() => {
    const validClipsCount = clips.filter(c => c.url).length;
    const isLooping = loopFirstClip && validClipsCount === 1;
    if (isLooping) return 'Generate Loop';
    const transitionCount = Math.max(0, validClipsCount - 1);
    return `Generate ${transitionCount} transition${transitionCount !== 1 ? 's' : ''}`;
  }, [clips, loopFirstClip]);

  const isGenerateDisabled = useMemo(() => {
    const validClipsCount = clips.filter(c => c.url).length;
    const isLooping = loopFirstClip && validClipsCount === 1;
    const hasEnoughClips = isLooping ? validClipsCount >= 1 : validClipsCount >= 2;
    return !hasEnoughClips || clips.some(c => c.url && c.metadataLoading);
  }, [clips, loopFirstClip]);

  const handleRestoreDefaults = useCallback(() => {
    const defaults = joinClipsSettings.defaults;
    const { contextFrameCount: context, gapFrameCount: gap } = scaleJoinFrameCountsToShortestClip({
      contextFrameCount: defaults.contextFrameCount,
      gapFrameCount: defaults.gapFrameCount,
      shortestClipFrames: validationResult?.shortestClipFrames,
    });

    joinSettings.updateFields({
      contextFrameCount: context,
      gapFrameCount: gap,
      replaceMode: defaults.replaceMode,
      keepBridgingImages: defaults.keepBridgingImages,
      prompt: defaults.prompt,
      negativePrompt: defaults.negativePrompt,
      useIndividualPrompts: defaults.useIndividualPrompts,
      enhancePrompt: defaults.enhancePrompt,
      useInputVideoResolution: defaults.useInputVideoResolution,
      useInputVideoFps: defaults.useInputVideoFps,
      noisedInputVideo: defaults.noisedInputVideo,
      motionMode: defaults.motionMode,
      phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
      selectedPhasePresetId: BUILTIN_VACE_DEFAULT_ID,
    });
    loraManager.setSelectedLoras([]);
  }, [validationResult, joinSettings, loraManager]);

  return {
    handleGenerate,
    isGenerating,
    showSuccessState,
    videosViewJustEnabled,
    setVideosViewJustEnabled,
    generateButtonText,
    isGenerateDisabled,
    handleRestoreDefaults,
  };
}
