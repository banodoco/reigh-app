import { useAddImageToShot, useRemoveImageFromShot } from '@/shared/hooks/shots';
import { useApplySettingsHandler } from '../hooks/actions/useApplySettingsHandler';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PresetMetadata } from '@/shared/types/presetMetadata';
import type { SteerableMotionSettings } from '@/shared/types/steerableMotion';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import type { ApplySettingsHandlerContexts } from '../hooks/actions/useApplySettingsHandler';

type ApplySettingsHandlerInput = Parameters<typeof useApplySettingsHandler>[0];

interface PromptSettingsSlice {
  prompt: string;
  setPrompt: (prompt: string) => void;
  enhancePrompt: boolean;
  setEnhancePrompt: (enhance: boolean) => void;
  textBeforePrompts: string;
  setTextBeforePrompts: (text: string) => void;
  textAfterPrompts: string;
  setTextAfterPrompts: (text: string) => void;
}

interface MotionSettingsSlice {
  motionMode: 'basic' | 'advanced';
  setMotionMode: (mode: 'basic' | 'advanced') => void;
  turboMode: boolean;
  setTurboMode: (turbo: boolean) => void;
  amountOfMotion: number;
  setAmountOfMotion: (motion: number) => void;
}

interface FrameSettingsSlice {
  batchVideoFrames: number;
  setFrames: (frames: number) => void;
  batchVideoSteps: number;
  setSteps: (steps: number) => void;
}

interface PhaseConfigSettingsSlice {
  generationTypeMode: 'i2v' | 'vace';
  setGenerationTypeMode: (mode: 'i2v' | 'vace') => void;
  phaseConfig: PhaseConfig;
  setPhaseConfig: (config: PhaseConfig) => void;
  selectPreset: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  removePreset: () => void;
  advancedMode: boolean;
}

interface GenerationModeSettingsSlice {
  generationMode: 'batch' | 'timeline' | 'by-pair';
  setGenerationMode: (mode: 'batch' | 'timeline' | 'by-pair') => void;
}

interface SteerableMotionSettingsSlice {
  steerableMotionSettings: SteerableMotionSettings;
  setSteerableMotionSettings: (settings: Partial<SteerableMotionSettings>) => void;
}

interface StructureVideoSettingsSlice {
  handleStructureVideoInputChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string,
  ) => void;
}

interface GenerationControllerActionsSlice {
  updatePairPromptsByIndex: ApplySettingsHandlerInput['restore']['updatePairPromptsByIndex'];
  loadPositions: ApplySettingsHandlerInput['mutations']['loadPositions'];
}

interface UseShotEditorApplySettingsModelParams {
  core: {
    projectId: string;
    selectedShot: Shot | undefined;
    simpleFilteredImages: GenerationRow[];
    availableLoras: ApplySettingsHandlerInput['restore']['availableLoras'];
    loraManager: ApplySettingsHandlerInput['restore']['loraManager'];
  };
  settings: {
    promptSettings: PromptSettingsSlice;
    motionSettings: MotionSettingsSlice;
    frameSettings: FrameSettingsSlice;
    phaseConfigSettings: PhaseConfigSettingsSlice;
    generationModeSettings: GenerationModeSettingsSlice;
    steerableMotionSettings: SteerableMotionSettingsSlice;
  };
  structureVideo: StructureVideoSettingsSlice;
  generationController: GenerationControllerActionsSlice;
}

export function useShotEditorApplySettingsModel({
  core,
  settings,
  structureVideo,
  generationController,
}: UseShotEditorApplySettingsModelParams): ReturnType<typeof useApplySettingsHandler> {
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const contexts: ApplySettingsHandlerContexts = {
    model: {
      steerableMotionSettings: settings.steerableMotionSettings.steerableMotionSettings,
      onSteerableMotionSettingsChange: settings.steerableMotionSettings.setSteerableMotionSettings,
    },
    prompts: {
      onBatchVideoPromptChange: settings.promptSettings.setPrompt,
      onSteerableMotionSettingsChange: settings.steerableMotionSettings.setSteerableMotionSettings,
      updatePairPromptsByIndex: generationController.updatePairPromptsByIndex,
    },
    generation: {
      onBatchVideoFramesChange: settings.frameSettings.setFrames,
      onBatchVideoStepsChange: settings.frameSettings.setSteps,
    },
    modes: {
      onGenerationModeChange: settings.generationModeSettings.setGenerationMode,
      onAdvancedModeChange: (advanced: boolean) => settings.motionSettings.setMotionMode(advanced ? 'advanced' : 'basic'),
      onMotionModeChange: settings.motionSettings.setMotionMode,
      onGenerationTypeModeChange: settings.phaseConfigSettings.setGenerationTypeMode,
    },
    advanced: {
      onPhaseConfigChange: settings.phaseConfigSettings.setPhaseConfig,
      onPhasePresetSelect: settings.phaseConfigSettings.selectPreset,
      onPhasePresetRemove: settings.phaseConfigSettings.removePreset,
      onTurboModeChange: settings.motionSettings.setTurboMode,
      onEnhancePromptChange: settings.promptSettings.setEnhancePrompt,
    },
    textAddons: {
      onTextBeforePromptsChange: settings.promptSettings.setTextBeforePrompts,
      onTextAfterPromptsChange: settings.promptSettings.setTextAfterPrompts,
    },
    motion: {
      onAmountOfMotionChange: settings.motionSettings.setAmountOfMotion,
    },
    loras: {
      availableLoras: core.availableLoras,
      loraManager: core.loraManager,
    },
    structureVideo: {
      onStructureVideoInputChange: structureVideo.handleStructureVideoInputChange,
    },
  };

  return useApplySettingsHandler({
    core: {
      projectId: core.projectId,
      selectedShot: core.selectedShot,
      simpleFilteredImages: core.simpleFilteredImages,
    },
    contexts,
    mutations: {
      addImageToShotMutation,
      removeImageFromShotMutation,
      loadPositions: generationController.loadPositions,
    },
  });
}
