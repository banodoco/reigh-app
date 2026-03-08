import type { SegmentOverrides } from '@/shared/types/segmentSettings';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { asBoolean, asNumber, asRecord, asString } from '@/shared/lib/tasks/taskParamParsers';

/**
 * Per-pair LoRA override configuration.
 * Used by pair override UI indicators.
 */
export interface PairLoraConfig {
  id: string;
  path: string;
  strength: number;
  name?: string;
  lowNoisePath?: string;
  isMultiStage?: boolean;
}

/**
 * Per-pair motion settings override.
 * Used by pair override UI indicators.
 */
export interface PairMotionSettings {
  amount_of_motion?: number;
  motion_mode?: 'basic' | 'presets' | 'advanced';
}

/**
 * Metadata stored on shot_generations for timeline and prompt management.
 * This is the single source of truth for segment overrides, enhanced prompts,
 * and timeline-position metadata.
 */
export interface GenerationMetadata {
  // Timeline positioning
  frame_spacing?: number;
  end_frame?: number;
  is_keyframe?: boolean;
  locked?: boolean;
  context_frames?: number;
  user_positioned?: boolean;
  created_by_mode?: 'timeline' | 'batch';
  auto_initialized?: boolean;
  drag_source?: string;
  drag_session_id?: string;

  // Segment-specific overrides and enhanced prompt
  segmentOverrides?: SegmentOverrides;
  enhanced_prompt?: string;

  // Allow additional metadata fields without losing type safety on known keys
  [key: string]: unknown;
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return asRecord(value) !== undefined;
}

function asStringOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  return asString(value);
}

function asMotionMode(value: unknown): SegmentOverrides['motionMode'] | undefined {
  if (value === 'basic' || value === 'advanced') {
    return value;
  }

  // Legacy payloads can still contain `presets`; map to `advanced`.
  return value === 'presets' ? 'advanced' : undefined;
}

function asStructureTreatment(value: unknown): 'adjust' | 'clip' | undefined {
  return value === 'adjust' || value === 'clip'
    ? value
    : undefined;
}

function isPhaseLora(value: unknown): value is PhaseConfig['phases'][number]['loras'][number] {
  return isMetadataRecord(value)
    && typeof value.url === 'string'
    && typeof value.multiplier === 'string';
}

function isPhaseSetting(value: unknown): value is PhaseConfig['phases'][number] {
  return isMetadataRecord(value)
    && typeof value.phase === 'number'
    && typeof value.guidance_scale === 'number'
    && Array.isArray(value.loras)
    && value.loras.every(isPhaseLora);
}

function isPhaseConfig(value: unknown): value is PhaseConfig {
  return isMetadataRecord(value)
    && typeof value.num_phases === 'number'
    && Array.isArray(value.steps_per_phase)
    && value.steps_per_phase.every((step) => typeof step === 'number')
    && typeof value.flow_shift === 'number'
    && typeof value.sample_solver === 'string'
    && typeof value.model_switch_phase === 'number'
    && Array.isArray(value.phases)
    && value.phases.every(isPhaseSetting)
    && (value.mode === undefined || value.mode === 'i2v' || value.mode === 'vace');
}

function parseSegmentOverrides(value: unknown): SegmentOverrides | undefined {
  if (!isMetadataRecord(value)) {
    return undefined;
  }

  const overrides: SegmentOverrides = {};
  const prompt = asString(value.prompt);
  if (prompt !== undefined) {
    overrides.prompt = prompt;
  }

  const negativePrompt = asString(value.negativePrompt);
  if (negativePrompt !== undefined) {
    overrides.negativePrompt = negativePrompt;
  }

  const textBeforePrompts = asString(value.textBeforePrompts);
  if (textBeforePrompts !== undefined) {
    overrides.textBeforePrompts = textBeforePrompts;
  }

  const textAfterPrompts = asString(value.textAfterPrompts);
  if (textAfterPrompts !== undefined) {
    overrides.textAfterPrompts = textAfterPrompts;
  }

  const motionMode = asMotionMode(value.motionMode);
  if (motionMode !== undefined) {
    overrides.motionMode = motionMode;
  }

  const amountOfMotion = asNumber(value.amountOfMotion);
  if (amountOfMotion !== undefined) {
    overrides.amountOfMotion = amountOfMotion;
  }

  if (isPhaseConfig(value.phaseConfig)) {
    overrides.phaseConfig = value.phaseConfig;
  }

  const selectedPhasePresetId = asStringOrNull(value.selectedPhasePresetId);
  if (selectedPhasePresetId !== undefined) {
    overrides.selectedPhasePresetId = selectedPhasePresetId;
  }

  if (Array.isArray(value.loras)) {
    overrides.loras = value.loras.filter(
      (item): item is NonNullable<SegmentOverrides['loras']>[number] =>
        isMetadataRecord(item)
        && typeof item.id === 'string'
        && typeof item.name === 'string'
        && typeof item.path === 'string'
        && typeof item.strength === 'number',
    );
  }

  const numFrames = asNumber(value.numFrames);
  if (numFrames !== undefined) {
    overrides.numFrames = numFrames;
  }

  const randomSeed = asBoolean(value.randomSeed);
  if (randomSeed !== undefined) {
    overrides.randomSeed = randomSeed;
  }

  const seed = asNumber(value.seed);
  if (seed !== undefined) {
    overrides.seed = seed;
  }

  const structureMotionStrength = asNumber(value.structureMotionStrength);
  if (structureMotionStrength !== undefined) {
    overrides.structureMotionStrength = structureMotionStrength;
  }

  const structureTreatment = asStructureTreatment(value.structureTreatment);
  if (structureTreatment !== undefined) {
    overrides.structureTreatment = structureTreatment;
  }

  const structureUni3cEndPercent = asNumber(value.structureUni3cEndPercent);
  if (structureUni3cEndPercent !== undefined) {
    overrides.structureUni3cEndPercent = structureUni3cEndPercent;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function copyUnknownExtras(
  source: Record<string, unknown>,
  target: GenerationMetadata,
  knownKeys: Set<string>,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (!knownKeys.has(key)) {
      target[key] = value;
    }
  }
}

function toGenerationMetadata(value: unknown): GenerationMetadata | null {
  if (!isMetadataRecord(value)) {
    return null;
  }

  const metadata: GenerationMetadata = {};
  metadata.frame_spacing = asNumber(value.frame_spacing);
  metadata.end_frame = asNumber(value.end_frame);
  metadata.is_keyframe = asBoolean(value.is_keyframe);
  metadata.locked = asBoolean(value.locked);
  metadata.context_frames = asNumber(value.context_frames);
  metadata.user_positioned = asBoolean(value.user_positioned);

  const createdByMode = asString(value.created_by_mode);
  if (createdByMode === 'timeline' || createdByMode === 'batch') {
    metadata.created_by_mode = createdByMode;
  }

  metadata.auto_initialized = asBoolean(value.auto_initialized);
  metadata.drag_source = asString(value.drag_source);
  metadata.drag_session_id = asString(value.drag_session_id);

  const segmentOverrides = value.segmentOverrides;
  const parsedSegmentOverrides = parseSegmentOverrides(segmentOverrides);
  if (parsedSegmentOverrides) {
    metadata.segmentOverrides = parsedSegmentOverrides;
  }

  metadata.enhanced_prompt = asString(value.enhanced_prompt);

  const knownKeys = new Set([
    'frame_spacing',
    'end_frame',
    'is_keyframe',
    'locked',
    'context_frames',
    'user_positioned',
    'created_by_mode',
    'auto_initialized',
    'drag_source',
    'drag_session_id',
    'segmentOverrides',
    'enhanced_prompt',
  ]);
  copyUnknownExtras(value, metadata, knownKeys);

  return metadata;
}

const parseGenerationMetadata = (value: unknown): GenerationMetadata | null =>
  toGenerationMetadata(value);
