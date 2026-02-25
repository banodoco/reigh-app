/** Shared VACE defaults used by Join Clips, Edit Video, and Join Segments flows. */

import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { BuiltinPreset } from '@/shared/components/MotionPresetSelector/types';
import type { PathLoraConfig } from '@/shared/types/lora';

/** Default VACE phase config with shared transition LoRAs. */
export const DEFAULT_VACE_PHASE_CONFIG: PhaseConfig = {
  num_phases: 3,
  steps_per_phase: [2, 2, 5],
  flow_shift: 5.0,
  sample_solver: "euler",
  model_switch_phase: 2,
  mode: 'vace',
  phases: [
    {
      phase: 1,
      guidance_scale: 3.0,
      loras: [
        { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors", multiplier: "0.75" },
        { url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors", multiplier: "1.25" }
      ]
    },
    {
      phase: 2,
      guidance_scale: 1.0,
      loras: [
        { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors", multiplier: "1.0" },
        { url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors", multiplier: "1.25" }
      ]
    },
    {
      phase: 3,
      guidance_scale: 1.0,
      loras: [
        { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors", multiplier: "1.0" },
        { url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors", multiplier: "1.25" }
      ]
    }
  ]
};

/** Built-in preset ID for VACE tools (not a database ID). */
export const BUILTIN_VACE_DEFAULT_ID = '__builtin_vace_default__';

/** Built-in default preset for VACE mode tools. */
export const BUILTIN_VACE_PRESET: BuiltinPreset = {
  id: BUILTIN_VACE_DEFAULT_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation settings',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
    generationTypeMode: 'vace',
  }
};

/** Featured preset IDs for VACE mode tools (from database). */
export const VACE_FEATURED_PRESET_IDS: string[] = [
  'd72377eb-6d57-4af1-80a3-9b629da28a47',
];

/** Shared engine defaults; tool-specific fields remain in each tool's settings module. */
export const VACE_GENERATION_DEFAULTS = {
  model: 'wan_2_2_vace_lightning_baseline_2_2_2' as const,
  numInferenceSteps: 6,
  guidanceScale: 3.0,
  seed: -1,
  randomSeed: true,
  replaceMode: true,
  keepBridgingImages: false,
  negativePrompt: '',
  priority: 0,
  prompt: '',
  enhancePrompt: false,
  motionMode: 'basic' as 'basic' | 'advanced',
  phaseConfig: undefined as PhaseConfig | undefined,
  selectedPhasePresetId: BUILTIN_VACE_DEFAULT_ID as string | null,
};

/** Builds phase config with user LoRAs merged into each phase. */
export function buildPhaseConfigWithLoras(
  userLoras: PathLoraConfig[] = [],
  baseConfig: PhaseConfig = DEFAULT_VACE_PHASE_CONFIG
): PhaseConfig {
  if (userLoras.length === 0) {
    return baseConfig;
  }
  
  const additionalLoras = userLoras
    .filter(lora => lora.path)
    .map(lora => ({
      url: lora.path,
      multiplier: lora.strength.toFixed(2)
    }));

  return {
    ...baseConfig,
    phases: baseConfig.phases.map(phase => ({
      ...phase,
      loras: [...phase.loras, ...additionalLoras]
    }))
  };
}
