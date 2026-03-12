export interface PhaseLoraStrength {
  loraId: string;
  loraPath: string;
  loraName: string;
  pass1Strength: number;
  pass2Strength: number;
}

export type ResolutionMode = 'project' | 'custom';

export interface HiresFixConfig {
  enabled: boolean;
  resolution_mode: ResolutionMode;
  custom_aspect_ratio?: string;
  resolution_scale: number;
  base_steps: number;
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
