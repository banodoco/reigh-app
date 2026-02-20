import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PathLoraConfig } from '@/shared/types/lora';

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

  // Retained in shim for compatibility with legacy payload parsing paths.
  phase_config?: PhaseConfig;
}
