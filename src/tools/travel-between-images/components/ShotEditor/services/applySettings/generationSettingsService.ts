import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type {
  ApplyAdvancedContext,
  ApplyGenerationContext,
  ApplyModeContext,
  ApplyModelContext,
  ApplyPromptContext,
  ApplyResult,
  ExtractedAdvancedSettings,
  ExtractedGenerationSettings,
  ExtractedModeSettings,
  ExtractedPromptSettings,
} from './types';

export const applyModelSettings = (
  settings: ExtractedGenerationSettings,
  context: ApplyModelContext,
): ApplyResult => {
  if (!settings.model || settings.model === context.steerableMotionSettings.model_name) {
    return { success: true, settingName: 'model', details: 'skipped - no change' };
  }

  context.onSteerableMotionSettingsChange({ model_name: settings.model });

  return { success: true, settingName: 'model', details: settings.model };
};

export const applyPromptSettings = async (
  settings: ExtractedPromptSettings,
  context: ApplyPromptContext,
): Promise<ApplyResult> => {
  // Apply main prompt
  if (typeof settings.prompt === 'string' && settings.prompt.trim()) {
    context.onBatchVideoPromptChange(settings.prompt);
  }

  // Apply individual prompts to pair configs (regardless of current mode)
  if (settings.prompts && settings.prompts.length > 1 && context.updatePairPromptsByIndex) {
    const errors: string[] = [];

    for (let i = 0; i < settings.prompts.length; i++) {
      const pairPrompt = settings.prompts[i]?.trim();
      const pairNegativePrompt = settings.negativePrompts?.[i]?.trim() || '';

      if (pairPrompt) {
        try {
          await context.updatePairPromptsByIndex(i, pairPrompt, pairNegativePrompt);
        } catch (e) {
          normalizeAndPresentError(e, {
            context: 'ApplySettings.applyPromptSettings',
            showToast: false,
            logData: { pairIndex: i },
          });
          errors.push(`Pair ${i}: ${e}`);
        }
      }
    }

    if (errors.length > 0) {
      return { success: false, settingName: 'prompts', error: errors.join('; ') };
    }
  }

  // Apply negative prompt
  if (settings.negativePrompt !== undefined) {
    context.onSteerableMotionSettingsChange({ negative_prompt: settings.negativePrompt || '' });
  }

  return { success: true, settingName: 'prompts' };
};

export const applyGenerationSettings = (
  settings: ExtractedGenerationSettings,
  context: ApplyGenerationContext,
): ApplyResult => {
  // Apply frames
  if (typeof settings.frames === 'number' && !Number.isNaN(settings.frames)) {
    context.onBatchVideoFramesChange(settings.frames);
  }

  // Context frames removed - now fixed at 10 frames

  // Apply steps
  if (typeof settings.steps === 'number' && !Number.isNaN(settings.steps)) {
    context.onBatchVideoStepsChange(settings.steps);
  }

  return { success: true, settingName: 'generation' };
};

export const applyModeSettings = (
  settings: ExtractedModeSettings,
  context: ApplyModeContext,
): ApplyResult => {
  // Apply generation mode
  if (settings.generationMode && (settings.generationMode === 'batch' || settings.generationMode === 'timeline' || settings.generationMode === 'by-pair')) {
    context.onGenerationModeChange(settings.generationMode);
  }

  // Apply advanced mode
  if (settings.advancedMode !== undefined) {
    context.onAdvancedModeChange(settings.advancedMode);
  }

  // Apply motion mode
  if (
    settings.motionMode !== undefined
    && settings.motionMode !== 'presets'
    && context.onMotionModeChange
  ) {
    context.onMotionModeChange(settings.motionMode);
  }

  // Apply generation type mode (I2V vs VACE)
  if (settings.generationTypeMode !== undefined && context.onGenerationTypeModeChange) {
    context.onGenerationTypeModeChange(settings.generationTypeMode);
  }

  return { success: true, settingName: 'modes' };
};

const deepClonePhaseConfig = (config: ExtractedAdvancedSettings['phaseConfig']) => {
  if (!config) return undefined;
  return {
    ...config,
    steps_per_phase: [...config.steps_per_phase],
    phases: config.phases.map(phase => ({
      ...phase,
      loras: phase.loras.map(lora => ({ ...lora })),
    })),
  };
};

export const applyAdvancedModeSettings = (
  settings: ExtractedAdvancedSettings,
  context: ApplyAdvancedContext,
): ApplyResult => {
  // Apply phase config
  if (settings.phaseConfig) {
    // Deep clone prevents shared references when applying task settings.
    const clonedConfig = deepClonePhaseConfig(settings.phaseConfig)!;
    context.onPhaseConfigChange(clonedConfig);
  }

  // Apply phase preset ID
  if (settings.selectedPhasePresetId !== undefined) {
    if (settings.selectedPhasePresetId && context.onPhasePresetSelect && settings.phaseConfig) {
      const clonedConfig = deepClonePhaseConfig(settings.phaseConfig)!;
      context.onPhasePresetSelect(settings.selectedPhasePresetId, clonedConfig);
    } else if (!settings.selectedPhasePresetId && context.onPhasePresetRemove) {
      context.onPhasePresetRemove();
    }
  }

  // Apply turbo mode
  if (settings.turboMode !== undefined && context.onTurboModeChange) {
    context.onTurboModeChange(settings.turboMode);
  }

  // Apply enhance prompt
  if (settings.enhancePrompt !== undefined && context.onEnhancePromptChange) {
    context.onEnhancePromptChange(settings.enhancePrompt);
  }

  return { success: true, settingName: 'advancedMode' };
};
