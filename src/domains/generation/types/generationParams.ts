/**
 * Persisted generation params as stored in DB / API payloads.
 * Keep snake_case at storage boundaries; use mappers for domain shape.
 */
export interface OrchestratorDetailsPayload {
  prompt?: string;
  base_prompt?: string;
  negative_prompt?: string;
  model_name?: string;
  parsed_resolution_wh?: string;
  seed_base?: number;
  additional_loras?: Record<string, number>;
  phase_config?: unknown;
  motion_mode?: 'basic' | 'presets' | 'advanced';
  selected_phase_preset_id?: string | null;
  structure_guidance?: unknown;
  [key: string]: unknown;
}

export interface GenerationExtraPayload {
  source?: string;
  original_filename?: string;
  file_type?: string;
  file_size?: number;
  [key: string]: unknown;
}

export interface PersistedGenerationParams {
  prompt?: string;
  base_prompt?: string;
  negative_prompt?: string;
  seed?: number;
  guidance_scale?: number;
  num_inference_steps?: number;
  width?: number;
  height?: number;
  resolution?: string;
  aspect_ratio?: string;
  custom_aspect_ratio?: string;
  shot_id?: string;
  source_image_path?: string;
  style_image_path?: string;
  original_params?: unknown;
  orchestrator_details?: OrchestratorDetailsPayload;
  extra?: GenerationExtraPayload;
}

/**
 * Normalized domain contract for generation params used inside TS code.
 */
export interface GenerationParams {
  prompt?: string;
  basePrompt?: string;
  negativePrompt?: string;
  seed?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
  width?: number;
  height?: number;
  resolution?: string;
  aspectRatio?: string;
  customAspectRatio?: string;
  shotId?: string;
  sourceImagePath?: string;
  styleImagePath?: string;
  originalParams?: unknown;
  orchestratorDetails?: OrchestratorDetailsPayload;
  extra?: GenerationExtraPayload;
}
