interface MetadataLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
}

interface OrchestratorDetails {
  prompt?: string;
  negative_prompt?: string;
  model?: string;
  seed?: number;
  resolution?: string;
  additional_loras?: Record<string, number>;
}

interface OriginalParams {
  orchestrator_details?: OrchestratorDetails;
  model?: string;
  steps?: number;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  lightning_lora_strength_phase_1?: number;
  lightning_lora_strength_phase_2?: number;
  qwen_endpoint?: string;
  image?: string;
  style_reference_image?: string;
  style_reference_strength?: number;
  subject_strength?: number;
  scene_reference_strength?: number;
  resolution?: string;
}

export interface DisplayableMetadata extends Record<string, unknown> {
  generation_id?: string | null;
  prompt?: string;
  imagesPerPrompt?: number;
  seed?: number;
  width?: number;
  height?: number;
  content_type?: string;
  activeLoras?: MetadataLora[];
  depthStrength?: number;
  softEdgeStrength?: number;
  userProvidedImageUrl?: string | null;
  num_inference_steps?: number;
  guidance_scale?: number;
  scheduler?: string;
  tool_type?: string;
  original_image_filename?: string;
  original_frame_timestamp?: number;
  source_frames?: number;
  original_duration?: number;
  originalParams?: OriginalParams;
  model?: string;
  negative_prompt?: string;
  resolution?: string;
  steps?: number;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  lightning_lora_strength_phase_1?: number;
  lightning_lora_strength_phase_2?: number;
  qwen_endpoint?: string;
  image?: string;
  style_reference_image?: string;
  style_reference_strength?: number;
  subject_strength?: number;
  scene_reference_strength?: number;
}
