import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PathLoraConfig } from '@/shared/types/lora';
import { getDeprecationPolicy } from '@/shared/lib/governance/deprecationPolicy';
import { signalPastRemovalTargetUsage } from '@/shared/lib/governance/deprecationEnforcement';
import type {
  StructureVideoConfig,
  TravelBetweenImagesTaskInput,
} from './types';

const legacyStructurePolicy = getDeprecationPolicy('travel_structure_legacy');
export const LEGACY_TRAVEL_STRUCTURE_OWNER = legacyStructurePolicy.owner;
export const LEGACY_TRAVEL_STRUCTURE_REMOVE_BY = legacyStructurePolicy.removeBy;

/**
 * Compatibility shim for legacy travel-between-images payload fields.
 *
 * Sunset contract:
 * - Owner: see LEGACY_TRAVEL_STRUCTURE_OWNER
 * - Remove by: see LEGACY_TRAVEL_STRUCTURE_REMOVE_BY
 * - Removal gate: no callers emitting or parsing deprecated structure video fields.
 */

export interface LegacyStructureVideoFields {
  /** @deprecated Use structure_guidance.strength instead */
  motion_strength?: number;
  /** @deprecated Use structure_guidance.target + preprocessing instead */
  structure_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** @deprecated Use structure_guidance.step_window[0] instead */
  uni3c_start_percent?: number;
  /** @deprecated Use structure_guidance.step_window[1] instead */
  uni3c_end_percent?: number;
}

/** Legacy read-shape for structure videos used only at adapter boundaries. */
export interface LegacyStructureVideoConfig extends StructureVideoConfig, LegacyStructureVideoFields {}

export interface LegacyTravelBetweenImagesTaskParams {
  /** Legacy LoRA format - prefer phase_config.phases[].loras */
  loras?: PathLoraConfig[];

  /** @deprecated Use structure_guidance + structure_videos array format instead */
  structure_video_path?: string | null;
  /** @deprecated Use structure_guidance + structure_videos array format instead */
  structure_video_treatment?: 'adjust' | 'clip';
  /** @deprecated Use structure_guidance + structure_videos array format instead */
  structure_video_motion_strength?: number;
  /** @deprecated Use structure_guidance + structure_videos array format instead */
  structure_video_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** @deprecated Use structure_guidance.step_window[0] instead */
  uni3c_start_percent?: number;
  /** @deprecated Use structure_guidance.step_window[1] instead */
  uni3c_end_percent?: number;
  /** @deprecated Use structure_guidance.target === 'uni3c' instead */
  use_uni3c?: boolean;

  // Retained until the shim sunset contract above is fulfilled.
  phase_config?: PhaseConfig;
}

/** Legacy read-shape used only at migration/adapter boundaries. */
export interface TravelBetweenImagesLegacyTaskInput extends
  Omit<TravelBetweenImagesTaskInput, 'structure_videos'> {
  structure_videos?: LegacyStructureVideoConfig[];
}

export const LEGACY_TRAVEL_TOP_LEVEL_FIELDS = [
  'structure_video_path',
  'structure_video_treatment',
  'structure_video_motion_strength',
  'structure_video_type',
  'uni3c_start_percent',
  'uni3c_end_percent',
  'use_uni3c',
] as const;

export const LEGACY_TRAVEL_STRUCTURE_VIDEO_FIELDS = [
  'motion_strength',
  'structure_type',
  'uni3c_start_percent',
  'uni3c_end_percent',
] as const;

export type LegacyTopLevelField = (typeof LEGACY_TRAVEL_TOP_LEVEL_FIELDS)[number];
export type LegacyStructureVideoField = (typeof LEGACY_TRAVEL_STRUCTURE_VIDEO_FIELDS)[number];

function hasLegacyField(
  value: unknown,
  field: string,
): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && field in (value as Record<string, unknown>)
    && (value as Record<string, unknown>)[field] !== undefined,
  );
}

export interface TravelStructureLegacyUsage {
  topLevelFields: LegacyTopLevelField[];
  structureVideoFields: LegacyStructureVideoField[];
}

export function collectTravelStructureLegacyUsage(
  value: unknown,
): TravelStructureLegacyUsage {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const topLevelFields = LEGACY_TRAVEL_TOP_LEVEL_FIELDS.filter(
    (field) => record[field] !== undefined,
  );

  const structureVideos = Array.isArray(record.structure_videos)
    ? record.structure_videos
    : [];
  const structureVideoFields = LEGACY_TRAVEL_STRUCTURE_VIDEO_FIELDS.filter((field) =>
    structureVideos.some((entry) => hasLegacyField(entry, field)),
  );

  return { topLevelFields, structureVideoFields };
}

export function enforceTravelStructureLegacyPolicy(
  usage: TravelStructureLegacyUsage,
  options?: {
    context?: string;
    enforcement?: 'warn' | 'throw' | 'auto';
  },
): boolean {
  const usedFields = [...usage.topLevelFields, ...usage.structureVideoFields];
  if (usedFields.length === 0) {
    return false;
  }

  const details = usedFields.join(', ');
  return signalPastRemovalTargetUsage({
    alias: 'travel_between_images.legacy_structure_fields',
    policy: legacyStructurePolicy,
    remediation: `Migrate to structure_guidance + canonical structure_videos. Legacy fields seen: ${details}.` +
      (options?.context ? ` Context: ${options.context}.` : ''),
    enforcement: options?.enforcement ?? 'auto',
  });
}
