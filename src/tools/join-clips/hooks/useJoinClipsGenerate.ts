import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@/shared/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { handleError } from '@/shared/lib/errorHandler';
import { joinClipsSettings } from '../settings';
import { DEFAULT_VACE_PHASE_CONFIG, BUILTIN_VACE_DEFAULT_ID, VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import type { VideoClip, TransitionPrompt } from '../types';
import type { useJoinClipsSettings } from './useJoinClipsSettings';
import type { UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import type { ValidationResult } from '../utils/validation';

interface UseJoinClipsGenerateParams {
  selectedProjectId: string | null;
  clips: VideoClip[];
  transitionPrompts: TransitionPrompt[];
  joinSettings: ReturnType<typeof useJoinClipsSettings>;
  loraManager: UseLoraManagerReturn;
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showSuccessState, setShowSuccessState] = useState(false);

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

  const generateJoinClipsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('No project selected');

      const validClips = clips.filter(c => c.url);

      const isLooping = loopFirstClip && validClips.length === 1;
      if (!isLooping && validClips.length < 2) {
        throw new Error('At least 2 clips with videos required');
      }

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

      let resolutionTuple: [number, number] | undefined;
      if (projectAspectRatio) {
        const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
        if (resolutionStr) {
          const [width, height] = resolutionStr.split('x').map(Number);
          if (width && height) {
            resolutionTuple = [width, height];
          }
        }
      }

      const taskParams: import('@/shared/lib/tasks/joinClips').JoinClipsTaskParams = {
        project_id: selectedProjectId,
        clips: clipsForTask,
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
        tool_type: 'join-clips',
      };

      const result = await createJoinClipsTask(taskParams);
      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Task created',
        description: 'Your join clips task has been queued',
      });

      setShowSuccessState(true);
      setTimeout(() => setShowSuccessState(false), 3000);

      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(selectedProjectId) });
    },
    onError: (error) => {
      handleError(error, { context: 'JoinClipsPage', toastTitle: 'Failed to create task' });
    },
  });

  const handleGenerate = useCallback(() => {
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

    generateJoinClipsMutation.mutate();
  }, [clips, loopFirstClip, generateJoinClipsMutation, toast]);

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
    let context = defaults.contextFrameCount;
    let gap = defaults.gapFrameCount;

    const shortestFrames = validationResult?.shortestClipFrames;
    if (shortestFrames && shortestFrames > 0) {
      const framesNeeded = gap + 2 * context;
      if (framesNeeded > shortestFrames) {
        const scale = shortestFrames / framesNeeded;
        context = Math.max(4, Math.floor(context * scale));
        gap = Math.max(1, Math.floor(gap * scale));
      }
    }

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
    generateJoinClipsMutation,
    handleGenerate,
    showSuccessState,
    generateButtonText,
    isGenerateDisabled,
    handleRestoreDefaults,
  };
}
