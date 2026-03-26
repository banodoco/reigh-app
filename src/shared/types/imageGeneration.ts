import type { PathLoraConfig } from '@/domains/lora/types/lora';
import type { HiresFixApiParams } from '@/shared/lib/taskCreation';

export type ReferenceMode = 'style' | 'subject' | 'style-character' | 'scene' | 'custom';

export interface ReferenceApiParams {
  style_reference_image?: string;
  subject_reference_image?: string;
  style_reference_strength: number;
  subject_strength: number;
  subject_description: string;
  in_this_scene: boolean;
  in_this_scene_strength: number;
  reference_mode: ReferenceMode;
}

export interface ReferenceSettingsInput {
  style_reference_strength?: number;
  subject_strength?: number;
  subject_description?: string;
  in_this_scene?: boolean;
  in_this_scene_strength?: number;
}

export interface BatchImageGenerationTaskParams
  extends Partial<ReferenceApiParams>, Partial<HiresFixApiParams> {
  project_id: string;
  prompts: Array<{
    id: string;
    fullPrompt: string;
    shortPrompt?: string;
  }>;
  imagesPerPrompt: number;
  loras?: PathLoraConfig[];
  shot_id?: string;
  resolution?: string;
  resolution_scale?: number;
  resolution_mode?: 'project' | 'custom';
  custom_aspect_ratio?: string;
  model_name?: string;
  subject_reference_image?: string;
  steps?: number;
}
