import { useState, useCallback, useMemo } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { unsupportedLegacyTaskError } from '@/shared/lib/taskCreation/legacyBoundary';
import { joinClipsSettings } from '@/shared/lib/joinClips/defaults';
import { scaleJoinFrameCountsToShortestClip } from '@/shared/lib/joinClips/frameScaling';
import { DEFAULT_VACE_PHASE_CONFIG, BUILTIN_VACE_DEFAULT_ID } from '@/shared/lib/vaceDefaults';
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
  joinSettings,
  loraManager,
  validationResult,
}: UseJoinClipsGenerateParams) {
  const { loopFirstClip } = joinSettings.settings;
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState(false);

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

    // The legacy join contract has no lossless canonical replacement. Reject
    // before placeholder, settings, enhancement, or Runtime work.
    toast({
      title: 'Join clips is not yet supported',
      description: unsupportedLegacyTaskError('join_clips').message,
      variant: 'destructive',
    });
  }, [clips, loopFirstClip, selectedProjectId]);

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
    isGenerating: false,
    showSuccessState: false,
    videosViewJustEnabled,
    setVideosViewJustEnabled,
    generateButtonText,
    isGenerateDisabled,
    handleRestoreDefaults,
  };
}
