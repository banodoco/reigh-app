/**
 * Shared utilities for extracting data from task params
 *
 * This module provides a single source of truth for parsing task parameters,
 * ensuring consistent behavior across TasksPane, MediaLightbox, and other components.
 */

/**
 * Parse task params, handling both string and object formats
 */
export function parseTaskParams(params: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!params) return {};
  if (typeof params === 'string') {
    try {
      return JSON.parse(params);
    } catch {
      return {};
    }
  }
  return params as Record<string, unknown>;
}

/**
 * Derive input images from task params
 *
 * For segment tasks (has segment_index): Only returns segment-specific images
 * For orchestrated tasks: Returns all images from orchestrator
 * For other tasks: Checks various image field locations
 *
 * @param parsedParams - Already-parsed task params object
 * @returns Array of image URLs
 */
export function deriveInputImages(parsedParams: Record<string, unknown>): string[] {
  const params = parsedParams;
  const orchestratorDetails = params?.orchestrator_details as Record<string, unknown> | undefined;
  const orchestratorPayload = params?.full_orchestrator_payload as Record<string, unknown> | undefined;
  const segmentParams = params?.individual_segment_params as Record<string, unknown> | undefined;

  // Check if this is a segment task (individual segment of a larger generation)
  const isSegmentTask = params?.segment_index !== undefined;

  // For segment tasks, ONLY use segment-specific images (not the full orchestrator list)
  if (isSegmentTask) {
    // Priority: individual_segment_params > top-level input_image_paths_resolved
    if (Array.isArray(segmentParams?.input_image_paths_resolved) && segmentParams.input_image_paths_resolved.length > 0) {
      return segmentParams.input_image_paths_resolved.filter((x): x is string => typeof x === 'string');
    }
    // Fallback to start/end image URLs
    if (segmentParams?.start_image_url || segmentParams?.end_image_url) {
      const urls: string[] = [];
      if (typeof segmentParams?.start_image_url === 'string') urls.push(segmentParams.start_image_url);
      if (typeof segmentParams?.end_image_url === 'string') urls.push(segmentParams.end_image_url);
      return urls;
    }
    // Fallback to top-level (which should be segment-specific for segment tasks)
    if (Array.isArray(params?.input_image_paths_resolved)) {
      return params.input_image_paths_resolved.filter((x): x is string => typeof x === 'string');
    }
    return [];
  }

  // For non-segment tasks, collect from all locations
  const urls: string[] = [];

  // Image edit task paths
  if (typeof params?.image_url === 'string') urls.push(params.image_url);
  if (typeof params?.image === 'string') urls.push(params.image);
  if (typeof params?.input_image === 'string') urls.push(params.input_image);
  if (typeof params?.init_image === 'string') urls.push(params.init_image);
  if (typeof params?.control_image === 'string') urls.push(params.control_image);
  if (Array.isArray(params?.images)) urls.push(...params.images.filter((x): x is string => typeof x === 'string'));
  if (Array.isArray(params?.input_images)) urls.push(...params.input_images.filter((x): x is string => typeof x === 'string'));
  if (typeof params?.mask_url === 'string') urls.push(params.mask_url);

  // Travel/video task paths - orchestrator details contain all images for full timeline
  if (Array.isArray(orchestratorDetails?.input_image_paths_resolved)) {
    urls.push(...orchestratorDetails.input_image_paths_resolved.filter((x): x is string => typeof x === 'string'));
  } else if (Array.isArray(orchestratorPayload?.input_image_paths_resolved)) {
    urls.push(...orchestratorPayload.input_image_paths_resolved.filter((x): x is string => typeof x === 'string'));
  } else if (Array.isArray(params?.input_image_paths_resolved)) {
    urls.push(...params.input_image_paths_resolved.filter((x): x is string => typeof x === 'string'));
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

/**
 * Extract prompt from task params
 *
 * For segment tasks: Checks individual_segment_params first
 * For orchestrated tasks: Checks orchestrator details
 * For other tasks: Falls back to top-level prompt
 *
 * Prefers enhanced_prompts_expanded over base_prompts_expanded when available,
 * as enhanced prompts contain the AI-improved version of the user's prompt.
 *
 * @param parsedParams - Already-parsed task params object
 * @returns The prompt string or null
 */
export function derivePrompt(parsedParams: Record<string, unknown>): string | null {
  const params = parsedParams;
  const orchestratorDetails = params?.orchestrator_details as Record<string, unknown> | undefined;
  const orchestratorPayload = params?.full_orchestrator_payload as Record<string, unknown> | undefined;
  const segmentParams = params?.individual_segment_params as Record<string, unknown> | undefined;

  const isSegmentTask = params?.segment_index !== undefined;

  // For segment tasks, try to get enhanced prompt first
  if (isSegmentTask) {
    const segmentIndex = params?.segment_index as number;
    // Check for enhanced prompt - can be singular field or in expanded array
    const enhancedExpandedOD = orchestratorDetails?.enhanced_prompts_expanded as string[] | undefined;
    const enhancedExpandedOP = orchestratorPayload?.enhanced_prompts_expanded as string[] | undefined;
    const enhancedPrompt = segmentParams?.enhanced_prompt ||
                          params?.enhanced_prompt ||
                          enhancedExpandedOD?.[segmentIndex] ||
                          enhancedExpandedOP?.[segmentIndex];
    if (enhancedPrompt) return enhancedPrompt as string;

    // Fall back to base prompt
    return (segmentParams?.base_prompt ||
      params?.base_prompt ||
      params?.prompt ||
      orchestratorDetails?.base_prompt ||
      null) as string | null;
  }

  // For full timeline/orchestrated tasks
  // Prefer enhanced prompts (AI-improved) over base prompts when available
  const enhancedExpandedOD = orchestratorDetails?.enhanced_prompts_expanded as string[] | undefined;
  const enhancedExpandedOP = orchestratorPayload?.enhanced_prompts_expanded as string[] | undefined;
  const baseExpandedOD = orchestratorDetails?.base_prompts_expanded as string[] | undefined;
  const baseExpandedOP = orchestratorPayload?.base_prompts_expanded as string[] | undefined;
  return enhancedExpandedOD?.[0] ||
    enhancedExpandedOP?.[0] ||
    baseExpandedOD?.[0] ||
    baseExpandedOP?.[0] ||
    (orchestratorDetails?.base_prompt as string) ||
    (orchestratorPayload?.base_prompt as string) ||
    (params?.base_prompt as string) ||
    (params?.prompt as string) ||
    null;
}

/**
 * Check if a task type is an image edit task
 */
export function isImageEditTaskType(taskType: string | undefined): boolean {
  const IMAGE_EDIT_TASK_TYPES = [
    'z_image_turbo_i2i',
    'image_inpaint',
    'qwen_image_edit',
    'magic_edit',
    'kontext_image_edit',
    'flux_image_edit',
    'annotated_image_edit',
  ];
  return IMAGE_EDIT_TASK_TYPES.includes(taskType || '');
}

/**
 * Check if a task type is a video enhancement task
 */
export function isVideoEnhanceTaskType(taskType: string | undefined): boolean {
  return taskType === 'video_enhance';
}

/**
 * Check if a task type is an image enhancement/upscale task
 */
export function isImageEnhanceTaskType(taskType: string | undefined): boolean {
  return taskType === 'image-upscale';
}

/**
 * LoRA info extracted from task params
 */
interface LoraInfo {
  url: string;
  strength: number;
  displayName: string;
}

/**
 * Extract LoRAs from task params (checks multiple locations)
 */
export function extractLoras(parsedParams: Record<string, unknown>): LoraInfo[] {
  const params = parsedParams;
  const orchestratorDetails = params?.orchestrator_details as Record<string, unknown> | undefined;
  const orchestratorPayload = params?.full_orchestrator_payload as Record<string, unknown> | undefined;

  // Check for array format (image edit tasks use this)
  const lorasArray = params?.loras || orchestratorDetails?.loras || orchestratorPayload?.loras;
  if (Array.isArray(lorasArray) && lorasArray.length > 0) {
    return lorasArray.map((lora: Record<string, unknown>) => ({
      url: (lora.url as string) || '',
      strength: (lora.strength as number) ?? (lora.multiplier as number) ?? 1,
      displayName: extractLoraDisplayName((lora.url as string) || ''),
    }));
  }

  // Check for object format (video tasks use additional_loras)
  const additionalLoras = params?.additional_loras || orchestratorDetails?.additional_loras || orchestratorPayload?.additional_loras;
  if (additionalLoras && typeof additionalLoras === 'object' && Object.keys(additionalLoras as Record<string, unknown>).length > 0) {
    return Object.entries(additionalLoras as Record<string, unknown>).map(([url, strength]) => ({
      url,
      strength: strength as number,
      displayName: extractLoraDisplayName(url),
    }));
  }

  return [];
}

function extractLoraDisplayName(url: string): string {
  const fileName = url.split('/').pop() || 'Unknown';
  return fileName.replace(/\.(safetensors|ckpt|pt)$/i, '').replace(/_/g, ' ');
}
