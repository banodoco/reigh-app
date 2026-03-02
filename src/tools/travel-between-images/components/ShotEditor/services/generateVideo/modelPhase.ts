import { ValidationError } from '@/shared/lib/errorHandling/errors';
import { type PhaseConfig, buildBasicModePhaseConfig as buildPhaseConfigCore } from '@/shared/types/phaseConfig';
import type { GenerateVideoParams, ModelPhaseSelection } from './types';
import type { MotionConfig } from '@/shared/lib/tasks/travelBetweenImages';

/**
 * Build phase config for basic mode based on motion amount and user LoRAs.
 * Wraps the shared builder while selecting the canonical basic model.
 */
export function buildBasicModeGenerationRequest(
  motionPercent: number,
  userLoras: Array<{ path: string; strength: number; lowNoisePath?: string; isMultiStage?: boolean }>,
): { model: string; phaseConfig: PhaseConfig } {
  const model = 'wan_2_2_i2v_lightning_baseline_2_2_2';
  const phaseConfig = buildPhaseConfigCore(false, motionPercent / 100, userLoras);
  return { model, phaseConfig };
}

export function resolveModelPhaseSelection(
  amountOfMotion: number,
  advancedMode: boolean,
  phaseConfig: PhaseConfig | undefined,
  motionMode: MotionConfig['motion_mode'],
  selectedLoras: GenerateVideoParams['selectedLoras'],
): ModelPhaseSelection {
  const userLorasForPhaseConfig = (selectedLoras || []).map((lora) => ({
    path: lora.path,
    strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0,
    lowNoisePath: (lora as { lowNoisePath?: string }).lowNoisePath,
    isMultiStage: (lora as { isMultiStage?: boolean }).isMultiStage,
  }));

  const useAdvancedMode = Boolean(advancedMode && phaseConfig && motionMode !== 'basic');
  if (useAdvancedMode && phaseConfig) {
    return {
      actualModelName: phaseConfig.num_phases === 2
        ? 'wan_2_2_i2v_lightning_baseline_3_3'
        : 'wan_2_2_i2v_lightning_baseline_2_2_2',
      effectivePhaseConfig: phaseConfig,
      useAdvancedMode,
    };
  }

  const basicConfig = buildBasicModeGenerationRequest(amountOfMotion, userLorasForPhaseConfig);
  return {
    actualModelName: basicConfig.model,
    effectivePhaseConfig: basicConfig.phaseConfig,
    useAdvancedMode: false,
  };
}

export function validatePhaseConfigConsistency(config: PhaseConfig): void {
  const phasesLength = config.phases?.length || 0;
  const stepsLength = config.steps_per_phase?.length || 0;
  if (config.num_phases !== phasesLength || config.num_phases !== stepsLength) {
    throw new ValidationError(
      `Invalid phase configuration: num_phases (${config.num_phases}) does not match arrays (phases: ${phasesLength}, steps: ${stepsLength}).`,
    );
  }
}
