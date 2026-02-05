/**
 * Shared defaults for VACE-based tools (Join Clips, Edit Video, Join Segments).
 *
 * DEFAULTS ARCHITECTURE -- how the layers connect:
 *
 *   VACE_GENERATION_DEFAULTS (this file)     -- shared engine params (model, steps, seed...)
 *       | spread into
 *   tools/[name]/settings.ts                 -- add per-tool fields (frame counts, clips...)
 *       | imported by
 *   hooks (useJoinClipsSettings, etc.)       -- pass settings.defaults to useAutoSaveSettings
 *       | trusted by
 *   components                              -- NO inline fallbacks (= 8, ?? false, etc.)
 *       | auto-converted by
 *   task creation (camelToSnakeKeys)         -- snake_case defaults derived, not hand-mapped
 *
 * Adding a new shared VACE param:
 *   1. Add to VACE_GENERATION_DEFAULTS below
 *   2. It auto-flows to every tool's settings.ts (via spread)
 *   3. It auto-flows to hooks (they import settings.defaults)
 *   4. It auto-flows to task creation TASK_DEFAULTS (via camelToSnakeKeys)
 *   5. Use TASK_DEFAULTS.your_field in the task creation orchestratorDetails
 *   6. Do NOT add fallbacks in components -- the hook guarantees a value
 *
 * Adding a tool-specific param (e.g., only join-clips needs it):
 *   1. Add to that tool's settings.ts (not here)
 *   2. Same rules: no fallbacks in components, import in task creation if needed
 */

import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { BuiltinPreset } from '@/shared/components/MotionPresetSelector';

// =============================================================================
// DEFAULT PHASE CONFIG FOR VACE MODE
// =============================================================================

/**
 * Default phase config for VACE-based tools (Join Clips, Edit Video).
 * Includes motion_scale LoRA for smoother transitions.
 */
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

// =============================================================================
// BUILT-IN DEFAULT PRESET
// =============================================================================

/** Built-in preset ID for VACE tools (not a database ID) */
export const BUILTIN_VACE_DEFAULT_ID = '__builtin_vace_default__';

/** Built-in default preset for VACE mode tools */
export const BUILTIN_VACE_PRESET: BuiltinPreset = {
  id: BUILTIN_VACE_DEFAULT_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation settings',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
    generationTypeMode: 'vace',
  }
};

// =============================================================================
// FEATURED PRESET IDS (shared across VACE tools)
// =============================================================================

/** Featured preset IDs for VACE mode tools (from database) */
export const VACE_FEATURED_PRESET_IDS: string[] = [
  'd72377eb-6d57-4af1-80a3-9b629da28a47',
];

// =============================================================================
// SHARED VACE GENERATION DEFAULTS
// =============================================================================

/**
 * Shared engine defaults for VACE-based tools (Join Clips, Edit Video, Join Segments).
 * Single source of truth for model, inference steps, guidance scale, etc.
 *
 * Per-tool fields (contextFrameCount, gapFrameCount, clips, etc.) are NOT included here —
 * those live in each tool's settings.ts.
 */
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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build phase config with user-selected LoRAs merged in.
 * User LoRAs are added to every phase at their specified strength.
 */
export function buildPhaseConfigWithLoras(
  userLoras: Array<{ path: string; strength: number }> = [],
  baseConfig: PhaseConfig = DEFAULT_VACE_PHASE_CONFIG
): PhaseConfig {
  if (userLoras.length === 0) {
    return baseConfig;
  }
  
  // Convert user LoRAs to phase config format
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
