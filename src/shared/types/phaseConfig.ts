/**
 * Phase Configuration Types
 *
 * Types for advanced video generation configuration.
 * Used across multiple tools: travel-between-images, join-clips, edit-video.
 *
 * Moved from tools/travel-between-images/settings.ts to shared/ because
 * these types are used by multiple tools and should not create circular dependencies.
 */

// =============================================================================
// PHASE CONFIG TYPES
// =============================================================================

/**
 * LoRA configuration for a single phase
 */
export interface PhaseLoraConfig {
  url: string;
  multiplier: string; // Can be a single value "1.0" or comma-separated ramp "0.1,0.3,0.5"
}

/**
 * Settings for a single generation phase
 */
export interface PhaseSettings {
  phase: number;
  guidance_scale: number;
  loras: PhaseLoraConfig[];
}

/**
 * Complete phase configuration for multi-phase video generation
 * Determines model selection and generation parameters per phase
 */
export interface PhaseConfig {
  num_phases: number; // 2 or 3 phases - determines which model is used
  steps_per_phase: number[];
  flow_shift: number;
  sample_solver: string;
  model_switch_phase: number;
  phases: PhaseSettings[];
  mode?: 'i2v' | 'vace'; // Generation mode: I2V (image-to-video) or VACE (structure video guided)
}

// =============================================================================
// DEFAULT PHASE CONFIGS
// =============================================================================

/**
 * Default phase config for I2V mode (2 phases, Comfy-Org LoRAs)
 */
export const DEFAULT_PHASE_CONFIG: PhaseConfig = {
  num_phases: 2,
  steps_per_phase: [3, 3],
  flow_shift: 5.0,
  sample_solver: "euler",
  model_switch_phase: 1,
  phases: [
    {
      phase: 1,
      guidance_scale: 1.0,
      loras: [
        {
          url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
          multiplier: "1.2"
        }
      ]
    },
    {
      phase: 2,
      guidance_scale: 1.0,
      loras: [
        {
          url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
          multiplier: "1.0"
        }
      ]
    }
  ]
};

/**
 * Default phase config for VACE mode (3 phases, lightx2v T2V LoRAs)
 */
export const DEFAULT_VACE_PHASE_CONFIG: PhaseConfig = {
  num_phases: 3,
  steps_per_phase: [2, 2, 2],
  flow_shift: 5.0,
  sample_solver: "euler",
  model_switch_phase: 2,
  mode: 'vace',
  phases: [
    {
      phase: 1,
      guidance_scale: 3.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
          multiplier: "0.75"
        }
      ]
    },
    {
      phase: 2,
      guidance_scale: 1.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
          multiplier: "1.0"
        }
      ]
    },
    {
      phase: 3,
      guidance_scale: 1.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors",
          multiplier: "1.0"
        }
      ]
    }
  ]
};

// =============================================================================
// PHASE CONFIG UTILITIES
// =============================================================================

/**
 * User LoRA input format for buildBasicModePhaseConfig
 */
interface UserLoraInput {
  path: string;
  strength: number;
  /** For multi-stage LoRAs - low noise variant path */
  lowNoisePath?: string;
  /** Whether this is a multi-stage LoRA (high/low noise variants) */
  isMultiStage?: boolean;
}

/**
 * Build a default phase config with user LoRAs for basic mode.
 * This is the single source of truth for basic mode phase config generation.
 * Used by both batch generation (generateVideoService.ts) and individual segment
 * regeneration (individualTravelSegment.ts).
 *
 * @param useVaceModel - Whether to use VACE model (determines base config)
 * @param amountOfMotion - 0-1 motion value (NOT 0-100)
 * @param userLoras - User-selected LoRAs to add to each phase
 * @returns PhaseConfig with base LoRAs + motion LoRA + user LoRAs
 */
export function buildBasicModePhaseConfig(
  useVaceModel: boolean,
  amountOfMotion: number,
  userLoras: UserLoraInput[]
): PhaseConfig {
  const baseConfig = useVaceModel ? DEFAULT_VACE_PHASE_CONFIG : DEFAULT_PHASE_CONFIG;
  const totalPhases = baseConfig.phases.length;

  return {
    ...baseConfig,
    steps_per_phase: [...baseConfig.steps_per_phase],
    phases: baseConfig.phases.map((phase, phaseIndex) => {
      const isLastPhase = phaseIndex === totalPhases - 1;
      const additionalLoras: PhaseLoraConfig[] = [];

      // Add user-selected LoRAs with multi-stage support
      userLoras.forEach(lora => {
        if (lora.isMultiStage) {
          // Multi-stage LoRA: route to correct phase based on noise level
          if (isLastPhase) {
            // Final phase: use low_noise LoRA if available
            if (lora.lowNoisePath) {
              additionalLoras.push({
                url: lora.lowNoisePath,
                multiplier: lora.strength.toFixed(2)
              });
            }
          } else {
            // Early phases: use high_noise LoRA (main path)
            if (lora.path) {
              additionalLoras.push({
                url: lora.path,
                multiplier: lora.strength.toFixed(2)
              });
            }
          }
        } else {
          // Single-stage LoRA: apply to all phases
          if (lora.path) {
            additionalLoras.push({
              url: lora.path,
              multiplier: lora.strength.toFixed(2)
            });
          }
        }
      });

      return {
        ...phase,
        loras: [
          ...phase.loras.map(l => ({ ...l })), // Deep clone base LoRAs
          ...additionalLoras
        ]
      };
    })
  };
}
