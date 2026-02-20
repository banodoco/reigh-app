/**
 * Generation parameters for image/video generation tasks
 * Stored in generations.params for task configuration.
 */
export interface GenerationParams {
  prompt?: string;
  base_prompt?: string;
  negative_prompt?: string;
  seed?: number;
  guidance_scale?: number;
  num_inference_steps?: number;
  width?: number;
  height?: number;
  resolution?: string;
  // Allow extension for tool-specific parameters.
  [key: string]: unknown;
}
