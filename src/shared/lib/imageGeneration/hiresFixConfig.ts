/**
 * Per-LoRA phase strength override for two-pass hires fix generation.
 * Allows different LoRA strengths for the initial pass vs the upscaling pass.
 */
export interface PhaseLoraStrength {
  /** References ActiveLora.id for syncing with base LoRA selection */
  loraId: string;
  /** LoRA file URL for task payload */
  loraPath: string;
  loraName: string;
  /** Strength for initial pass (0-2) */
  pass1Strength: number;
  /** Strength for upscaling/hires pass (0-2) */
  pass2Strength: number;
}

/** Resolution mode for image generation */
export type ResolutionMode = 'project' | 'custom';

/**
 * Configuration for two-pass hires fix image generation.
 * When enabled, generates at base resolution then upscales with refinement.
 * Uses snake_case to match API params directly - no conversion needed.
 */
export interface HiresFixConfig {
  /** Whether hires fix is enabled (UI only) */
  enabled: boolean;
  /** 'project' uses project dimensions, 'custom' allows selecting aspect ratio */
  resolution_mode: ResolutionMode;
  /** Custom aspect ratio when resolution_mode is 'custom' (e.g., "16:9") */
  custom_aspect_ratio?: string;
  /** Scale factor for initial resolution vs base resolution (1.0-2.5x) */
  resolution_scale: number;
  /** Number of inference steps for base pass (maps to `steps` in API) */
  base_steps: number;
  /** Upscale factor for hires pass (e.g., 2.0 = 2x resolution) */
  hires_scale: number;
  hires_steps: number;
  hires_denoise: number;
  lightning_lora_strength_phase_1: number;
  lightning_lora_strength_phase_2: number;
  phaseLoraStrengths: PhaseLoraStrength[];
}

export const DEFAULT_HIRES_FIX_CONFIG: HiresFixConfig = {
  enabled: true,
  resolution_mode: 'project',
  resolution_scale: 1.5,
  base_steps: 8,
  hires_scale: 1.1,
  hires_steps: 8,
  hires_denoise: 0.55,
  lightning_lora_strength_phase_1: 0.9,
  lightning_lora_strength_phase_2: 0.5,
  phaseLoraStrengths: [],
};

const MODEL_HIRES_FIX_DEFAULTS: Record<string, HiresFixConfig> = {
  'qwen-image': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 8,
    hires_scale: 1.1,
    hires_steps: 8,
    hires_denoise: 0.55,
    lightning_lora_strength_phase_1: 0.9,
    lightning_lora_strength_phase_2: 0.5,
    phaseLoraStrengths: [],
  },
  'qwen-image-2512': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 10,
    hires_scale: 1.0,
    hires_steps: 8,
    hires_denoise: 0.5,
    lightning_lora_strength_phase_1: 0.85,
    lightning_lora_strength_phase_2: 0.4,
    phaseLoraStrengths: [],
  },
  'z-image': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 12,
    hires_scale: 1.2,
    hires_steps: 10,
    hires_denoise: 0.6,
    lightning_lora_strength_phase_1: 0.8,
    lightning_lora_strength_phase_2: 0.3,
    phaseLoraStrengths: [],
  },
};

export function getHiresFixDefaultsForModel(modelName: string): HiresFixConfig {
  return MODEL_HIRES_FIX_DEFAULTS[modelName] ?? DEFAULT_HIRES_FIX_CONFIG;
}
