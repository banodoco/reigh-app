import type { PhaseConfig } from '@/shared/types/phaseConfig';

export interface LegacyPairMetadataFields {
  pair_prompt?: string;
  pair_negative_prompt?: string;
  pair_phase_config?: PhaseConfig;
  pair_motion_settings?: {
    motion_mode?: 'basic' | 'advanced';
    amount_of_motion?: number;
  };
  pair_loras?: Array<{ path: string; strength: number }>;
  pair_num_frames?: number;
  pair_random_seed?: boolean;
  pair_seed?: number;
  pair_selected_phase_preset_id?: string | null;
  user_overrides?: {
    phase_config?: PhaseConfig;
    motion_mode?: 'basic' | 'advanced';
    amount_of_motion?: number;
    additional_loras?: Record<string, number>;
    [key: string]: unknown;
  };
}
