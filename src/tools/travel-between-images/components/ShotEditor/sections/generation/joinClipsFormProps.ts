import type React from 'react';
import type { LoraModel } from '@/domains/lora/types/lora';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import type { JoinSegmentsSettings } from '@/tools/travel-between-images/hooks/settings/useJoinSegmentsSettings';
import {
  JoinClipsSettingsForm,
  DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
  BUILTIN_JOIN_CLIPS_DEFAULT_ID,
} from '@/shared/components/JoinClipsSettingsForm/JoinClipsSettingsForm';

interface JoinFormSettingsState {
  settings: JoinSegmentsSettings;
  updateField: <K extends keyof JoinSegmentsSettings>(field: K, value: JoinSegmentsSettings[K]) => void;
  updateFields: (fields: Partial<JoinSegmentsSettings>) => void;
}

interface JoinFormJoinState {
  joinSettings: JoinFormSettingsState;
  joinLoraManager: LoraManagerState;
  joinValidationData: {
    shortestClipFrames?: number;
  };
}

interface BuildJoinClipsFormPropsInput {
  joinState: JoinFormJoinState;
  availableLoras: LoraModel[];
  projectId: string;
  loraPersistenceKey: string;
}

interface BuildJoinClipsFormPropsResult {
  clipSettings: React.ComponentProps<typeof JoinClipsSettingsForm>['clipSettings'];
  motionConfig: React.ComponentProps<typeof JoinClipsSettingsForm>['motionConfig'];
}

export function buildJoinClipsFormProps({
  joinState,
  availableLoras,
  projectId,
  loraPersistenceKey,
}: BuildJoinClipsFormPropsInput): BuildJoinClipsFormPropsResult {
  const joinSettings = joinState.joinSettings.settings;

  return {
    clipSettings: {
      gapFrames: joinSettings.gapFrameCount,
      setGapFrames: (val) => joinState.joinSettings.updateField('gapFrameCount', val),
      contextFrames: joinSettings.contextFrameCount,
      setContextFrames: (val) => joinState.joinSettings.updateField('contextFrameCount', val),
      replaceMode: joinSettings.replaceMode,
      setReplaceMode: (val) => joinState.joinSettings.updateField('replaceMode', val),
      keepBridgingImages: joinSettings.keepBridgingImages,
      setKeepBridgingImages: (val) => joinState.joinSettings.updateField('keepBridgingImages', val),
      prompt: joinSettings.prompt,
      setPrompt: (val) => joinState.joinSettings.updateField('prompt', val),
      negativePrompt: joinSettings.negativePrompt,
      setNegativePrompt: (val) => joinState.joinSettings.updateField('negativePrompt', val),
      enhancePrompt: joinSettings.enhancePrompt,
      setEnhancePrompt: (val) => joinState.joinSettings.updateField('enhancePrompt', val),
      shortestClipFrames: joinState.joinValidationData.shortestClipFrames,
    },
    motionConfig: {
      availableLoras,
      projectId,
      loraPersistenceKey,
      loraManager: joinState.joinLoraManager,
      motionMode: joinSettings.motionMode,
      onMotionModeChange: (mode) => joinState.joinSettings.updateField('motionMode', mode),
      phaseConfig: joinSettings.phaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
      onPhaseConfigChange: (config) => joinState.joinSettings.updateField('phaseConfig', config),
      randomSeed: joinSettings.randomSeed,
      onRandomSeedChange: (val) => joinState.joinSettings.updateField('randomSeed', val),
      selectedPhasePresetId: joinSettings.selectedPhasePresetId ?? BUILTIN_JOIN_CLIPS_DEFAULT_ID,
      onPhasePresetSelect: (presetId, config) => {
        joinState.joinSettings.updateFields({
          selectedPhasePresetId: presetId,
          phaseConfig: config,
        });
      },
      onPhasePresetRemove: () => {
        joinState.joinSettings.updateField('selectedPhasePresetId', null);
      },
    },
  };
}
