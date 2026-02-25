import { useCallback, useMemo } from 'react';
import { useTimelineCore } from '@/shared/hooks/useTimelineCore';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { Shot } from '@/domains/generation/types';
import { useGenerateBatch, useSteerableMotionHandlers } from '../hooks';
import type { BatchGenerationRequest, StitchAfterGenerateConfig } from '../hooks/useGenerateBatch';

interface GenerationControllerCore {
  projectId: string | null;
  selectedProjectId: string | null;
  selectedShotId: string;
  selectedShot: Shot | null;
  queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient>;
  onShotImagesUpdate?: () => void;
  effectiveAspectRatio: string | undefined;
  generationMode: 'batch' | 'timeline' | 'by-pair' | 'join';
}

interface GenerationControllerPromptSettings {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  enhancePrompt: boolean;
  textBeforePrompts: string;
  textAfterPrompts: string;
  negativePrompt: string;
}

interface GenerationControllerMotionSettings {
  amountOfMotion: number;
  motionMode: 'basic' | 'advanced' | 'presets';
  advancedMode: boolean;
  phaseConfig: ReturnType<typeof import('../hooks').useJoinSegmentsSetup>['joinPhaseConfig'];
  selectedPhasePresetId: string | null;
  steerableMotionSettings: { model_name: string; num_inference_steps: number; seed?: number };
  randomSeed: boolean;
  turboMode: boolean;
  generationTypeMode: 'i2v' | 'vace';
  smoothContinuations: boolean;
  batchVideoFrames: number;
  selectedLoras: Array<{ id: string; path: string; strength: number }>;
  structureVideos: ReturnType<typeof import('../hooks').useStructureVideo>['structureVideos'];
  selectedOutputId: string | null;
}

interface GenerationControllerJoinSettings {
  stitchAfterGenerate: boolean;
  joinContextFrames: number;
  joinGapFrames: number;
  joinReplaceMode: boolean;
  joinKeepBridgingImages: boolean;
  joinPrompt: string;
  joinNegativePrompt: string;
  joinEnhancePrompt: boolean;
  joinModel: string;
  joinNumInferenceSteps: number;
  joinGuidanceScale: number;
  joinSeed: number;
  joinRandomSeed: boolean;
  joinMotionMode: 'basic' | 'advanced';
  joinPhaseConfig: ReturnType<typeof import('../hooks').useJoinSegmentsSetup>['joinPhaseConfig'];
  joinSelectedPhasePresetId: string | null;
  joinSelectedLoras: Array<{ id: string; path: string; strength: number }>;
  joinPriority: number;
  joinUseInputVideoResolution: boolean;
  joinUseInputVideoFps: boolean;
  joinNoisedInputVideo: number;
  joinLoopFirstClip: boolean;
}

interface GenerationControllerRuntime {
  accelerated: boolean;
  isShotUISettingsLoading: boolean;
  settingsLoadingFromContext: boolean;
  updateShotUISettings: (scope: 'project' | 'shot', values: Record<string, unknown>) => void;
  setSteerableMotionSettings: (settings: { seed?: number }) => void;
  setSteps: (steps: number) => void;
  setShowStepsNotification: (show: boolean) => void;
}

interface UseGenerationControllerParams {
  core: GenerationControllerCore;
  prompt: GenerationControllerPromptSettings;
  motion: GenerationControllerMotionSettings;
  join: GenerationControllerJoinSettings;
  runtime: GenerationControllerRuntime;
}

function buildStitchAfterGenerateConfig(
  join: GenerationControllerJoinSettings,
): StitchAfterGenerateConfig | undefined {
  if (!join.stitchAfterGenerate) {
    return undefined;
  }

  return {
    contextFrameCount: join.joinContextFrames,
    gapFrames: join.joinGapFrames,
    replaceMode: join.joinReplaceMode,
    keepBridgingImages: join.joinKeepBridgingImages,
    prompt: join.joinPrompt,
    negativePrompt: join.joinNegativePrompt,
    enhancePrompt: join.joinEnhancePrompt,
    model: join.joinModel,
    numInferenceSteps: join.joinNumInferenceSteps,
    guidanceScale: join.joinGuidanceScale,
    seed: join.joinSeed,
    randomSeed: join.joinRandomSeed,
    motionMode: join.joinMotionMode,
    phaseConfig: join.joinPhaseConfig,
    selectedPhasePresetId: join.joinSelectedPhasePresetId,
    selectedLoras: join.joinSelectedLoras.map(({ path, strength }) => ({ path, strength })),
    priority: join.joinPriority,
    useInputVideoResolution: join.joinUseInputVideoResolution,
    useInputVideoFps: join.joinUseInputVideoFps,
    noisedInputVideo: join.joinNoisedInputVideo,
    loopFirstClip: join.joinLoopFirstClip,
  };
}

function buildBatchGenerationRequest(
  prompt: GenerationControllerPromptSettings,
  motion: GenerationControllerMotionSettings,
  join: GenerationControllerJoinSettings,
): BatchGenerationRequest {
  return {
    prompt: {
      basePrompt: prompt.prompt,
      enhancePrompt: prompt.enhancePrompt,
      textBeforePrompts: prompt.textBeforePrompts,
      textAfterPrompts: prompt.textAfterPrompts,
      negativePrompt: prompt.negativePrompt,
    },
    motion: {
      amountOfMotion: motion.amountOfMotion,
      motionMode: motion.motionMode || 'basic',
      advancedMode: motion.advancedMode,
      phaseConfig: motion.phaseConfig,
      selectedPhasePresetId: motion.selectedPhasePresetId,
    },
    model: {
      steerableMotionSettings: motion.steerableMotionSettings,
      randomSeed: motion.randomSeed,
      turboMode: motion.turboMode,
      generationTypeMode: motion.generationTypeMode,
      smoothContinuations: motion.smoothContinuations,
    },
    batchVideoFrames: motion.batchVideoFrames,
    selectedLoras: motion.selectedLoras,
    structureVideos: motion.structureVideos,
    selectedOutputId: motion.selectedOutputId,
    stitchAfterGenerate: buildStitchAfterGenerateConfig(join),
  };
}

export function useGenerationController({
  core,
  prompt,
  motion,
  join,
  runtime,
}: UseGenerationControllerParams) {
  const { clearAllEnhancedPrompts, updatePairPromptsByIndex, refetch: loadPositions } = useTimelineCore(core.selectedShotId);
  const { onPromptChange } = prompt;

  const handleBatchVideoPromptChangeWithClear = useCallback(async (newPrompt: string) => {
    onPromptChange(newPrompt);
    try {
      await clearAllEnhancedPrompts();
    } catch (error) {
      normalizeAndPresentError(error, { context: 'PromptClearLog', showToast: false });
    }
  }, [clearAllEnhancedPrompts, onPromptChange]);

  const {
    handleRandomSeedChange,
    handleAcceleratedChange,
    handleStepsChange,
  } = useSteerableMotionHandlers({
    accelerated: runtime.accelerated,
    randomSeed: motion.randomSeed,
    turboMode: motion.turboMode,
    steerableMotionSettings: motion.steerableMotionSettings,
    isShotUISettingsLoading: runtime.isShotUISettingsLoading,
    settingsLoadingFromContext: runtime.settingsLoadingFromContext,
    updateShotUISettings: runtime.updateShotUISettings,
    setSteerableMotionSettings: runtime.setSteerableMotionSettings,
    setSteps: runtime.setSteps,
    setShowStepsNotification: runtime.setShowStepsNotification,
    selectedShotId: core.selectedShot?.id,
  });

  const batchGenerationRequest = useMemo(
    () => buildBatchGenerationRequest(prompt, motion, join),
    [join, motion, prompt],
  );

  const {
    handleGenerateBatch,
    isSteerableMotionEnqueuing,
    steerableMotionJustQueued,
    isGenerationDisabled,
  } = useGenerateBatch({
    core: {
      projectId: core.projectId,
      selectedProjectId: core.selectedProjectId,
      selectedShotId: core.selectedShotId,
      selectedShot: core.selectedShot,
      queryClient: core.queryClient,
      onShotImagesUpdate: core.onShotImagesUpdate,
      effectiveAspectRatio: core.effectiveAspectRatio,
      generationMode: core.generationMode,
    },
    request: batchGenerationRequest,
    clearAllEnhancedPrompts,
  });

  return {
    clearAllEnhancedPrompts,
    updatePairPromptsByIndex,
    loadPositions,
    handleBatchVideoPromptChangeWithClear,
    handleRandomSeedChange,
    handleAcceleratedChange,
    handleStepsChange,
    handleGenerateBatch,
    isSteerableMotionEnqueuing,
    steerableMotionJustQueued,
    isGenerationDisabled,
  };
}
