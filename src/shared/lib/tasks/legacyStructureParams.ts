export const LEGACY_STRUCTURE_PARAM_KEYS = [
  'structure_type',
  'structure_video_path',
  'structure_video_treatment',
  'structure_video_motion_strength',
  'structure_video_type',
  'structure_canny_intensity',
  'structure_depth_contrast',
  'structure_guidance_video_url',
  'structure_guidance_frame_offset',
  'use_uni3c',
  'uni3c_guide_video',
  'uni3c_strength',
  'uni3c_start_percent',
  'uni3c_end_percent',
  'uni3c_guidance_frame_offset',
] as const;

/**
 * Remove legacy scalar structure fields superseded by the canonical
 * `structure_guidance` + `structure_videos` contract.
 */
export function stripLegacyStructureParams(target: Record<string, unknown>): void {
  for (const key of LEGACY_STRUCTURE_PARAM_KEYS) {
    delete target[key];
  }
}

const DUPLICATE_STRUCTURE_DETAIL_KEYS = [
  'structure_videos',
] as const;

/**
 * Remove canonical structure fields that should live only on the top-level task
 * payload, not on nested `orchestrator_details` mirrors.
 */
export function stripDuplicateStructureDetailParams(target: Record<string, unknown>): void {
  for (const key of DUPLICATE_STRUCTURE_DETAIL_KEYS) {
    delete target[key];
  }
}
