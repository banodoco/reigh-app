import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import type { LegacyStructureVideoConfig } from '@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo';
import type { SegmentSettings, LoraConfig } from '@/shared/types/segmentSettings';

export type { SegmentSettings };

export interface BuiltinPreset {
  id: string;
  metadata: {
    name: string;
    description: string;
    phaseConfig: PhaseConfig;
    generationTypeMode: 'i2v' | 'vace';
  };
}

// Use the same IDs as the batch view (MotionControl.tsx) so shot defaults
// are recognized as known presets when inherited by the segment form.
const BUILTIN_I2V_PRESET_ID = '__builtin_default_i2v__';
const BUILTIN_VACE_PRESET_ID = '__builtin_default_vace__';

export const BUILTIN_I2V_PRESET: BuiltinPreset = {
  id: BUILTIN_I2V_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation',
    phaseConfig: DEFAULT_PHASE_CONFIG,
    generationTypeMode: 'i2v',
  }
};

export const BUILTIN_VACE_PRESET: BuiltinPreset = {
  id: BUILTIN_VACE_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
    generationTypeMode: 'vace',
  }
};

// Featured preset IDs from database (shown after built-in default)
export const SEGMENT_I2V_FEATURED_PRESET_IDS: string[] = [
  'e1aad8bf-add9-4d7b-883b-d67d424028c4',
  '18b879a5-1251-41dc-b263-613358ced541',
];

export const SEGMENT_VACE_FEATURED_PRESET_IDS: string[] = [
  'd72377eb-6d57-4af1-80a3-9b629da28a47',
];

interface DefaultableFieldResult {
  isUsingDefault: boolean;
  displayValue: string;
}

export function getDefaultableField(
  localValue: string | undefined,
  defaultValue: string | undefined,
  hasDbOverride?: boolean
): DefaultableFieldResult {
  const isUsingDefault = localValue === undefined && (
    hasDbOverride !== undefined
      ? !hasDbOverride && defaultValue !== undefined
      : defaultValue !== undefined
  );

  return {
    isUsingDefault,
    displayValue: isUsingDefault ? (defaultValue ?? '') : (localValue ?? ''),
  };
}

export function detectGenerationMode(modelName?: string): 'i2v' | 'vace' {
  if (!modelName) return 'i2v';
  return modelName.toLowerCase().includes('vace') ? 'vace' : 'i2v';
}


export interface ShotBatchSettings {
  amountOfMotion?: number;
  motionMode?: 'basic' | 'advanced';
  selectedLoras?: LoraConfig[];
  phaseConfig?: PhaseConfig;
  prompt?: string;
  negativePrompt?: string;
  [key: string]: unknown;
}

// Strip mode field from phase config (backend determines mode from model)
export function stripModeFromPhaseConfig(config: PhaseConfig): PhaseConfig {
  const { mode, ...rest } = config as PhaseConfig & { mode?: string };
  return rest as PhaseConfig;
}

interface MotionTaskFieldsInput {
  amountOfMotion: number;
  motionMode: string;
  phaseConfig: PhaseConfig;
  selectedPhasePresetId?: string | null;
  omitBasicPhaseConfig?: boolean;
}

export function buildMotionTaskFields({
  amountOfMotion,
  motionMode,
  phaseConfig,
  selectedPhasePresetId,
  omitBasicPhaseConfig = false,
}: MotionTaskFieldsInput): Record<string, unknown> {
  const shouldIncludePhaseConfig = !omitBasicPhaseConfig || motionMode !== 'basic' || !!selectedPhasePresetId;

  return {
    amount_of_motion: amountOfMotion / 100,
    motion_mode: motionMode,
    phase_config: shouldIncludePhaseConfig ? stripModeFromPhaseConfig(phaseConfig) : undefined,
    selected_phase_preset_id: selectedPhasePresetId || undefined,
  };
}

export function buildTaskParams(
  settings: SegmentSettings,
  context: {
    projectId: string;
    shotId?: string;
    generationId?: string;
    childGenerationId?: string;
    segmentIndex: number;
    startImageUrl: string;
    endImageUrl?: string; // Optional for trailing segments (single-image-to-video)
    startImageGenerationId?: string;
    endImageGenerationId?: string;
    pairShotGenerationId?: string;
    startImageVariantId?: string;
    endImageVariantId?: string;
    projectResolution?: string;
    // Optional enhanced prompt (AI-enhanced version, kept separate from base_prompt)
    enhancedPrompt?: string;
    // Structure video config for this segment (from shot timeline data)
    structureVideo?: LegacyStructureVideoConfig | null;
  }
): Record<string, unknown> {
  const motionFields = buildMotionTaskFields({
    amountOfMotion: settings.amountOfMotion,
    motionMode: settings.motionMode,
    phaseConfig: settings.phaseConfig ?? DEFAULT_PHASE_CONFIG,
    selectedPhasePresetId: settings.selectedPhasePresetId,
    omitBasicPhaseConfig: true,
  });

  // Build structure_videos array if we have a structure video for this segment
  const structureVideos = context.structureVideo ? [context.structureVideo] : undefined;

  // Detect trailing segment: no end image means single-image-to-video (last segment)
  const isTrailingSegment = !context.endImageUrl;

  return {
    project_id: context.projectId,
    shot_id: context.shotId,
    parent_generation_id: context.generationId,
    child_generation_id: context.childGenerationId,
    segment_index: context.segmentIndex,
    start_image_url: context.startImageUrl,
    end_image_url: context.endImageUrl,
    // For trailing segments (no end image), mark as last segment so worker uses I2V mode
    is_last_segment: isTrailingSegment,
    start_image_generation_id: context.startImageGenerationId,
    end_image_generation_id: context.endImageGenerationId,
    pair_shot_generation_id: context.pairShotGenerationId,
    start_image_variant_id: context.startImageVariantId,
    end_image_variant_id: context.endImageVariantId,
    // Settings
    base_prompt: settings.prompt,
    negative_prompt: settings.negativePrompt,
    // Enhanced prompt (AI-enhanced version) - worker should prefer this over base_prompt when present
    ...(context.enhancedPrompt && { enhanced_prompt: context.enhancedPrompt }),
    num_frames: settings.numFrames,
    random_seed: settings.randomSeed,
    seed: settings.seed,
    ...motionFields,
    loras: settings.loras.map(l => ({ path: l.path, strength: l.strength })),
    make_primary_variant: settings.makePrimaryVariant,
    // Resolution
    ...(context.projectResolution && { parsed_resolution_wh: context.projectResolution }),
    // Structure video (from shot timeline data)
    ...(structureVideos && { structure_videos: structureVideos }),
  };
}
