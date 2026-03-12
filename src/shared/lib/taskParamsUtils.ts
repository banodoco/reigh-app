/**
 * Shared utilities for extracting data from task params
 *
 * This module provides a single source of truth for parsing task parameters,
 * ensuring consistent behavior across TasksPane, MediaLightbox, and other components.
 */
import { buildTaskPayloadSnapshot } from './tasks/taskPayloadSnapshot';
import { createTravelPayloadReader, type TravelPayloadSource } from './tasks/travelPayloadReader';
import {
  asRecord,
  asString,
  asStringArray,
  firstString as pickFirstString,
} from './jsonNarrowing';

/**
 * Parse task params, handling both string and object formats
 */
export function parseTaskParams(params: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!params) return {};
  if (typeof params === 'string') {
    try {
      const parsed = JSON.parse(params);
      return asRecord(parsed) ?? {};
    } catch {
      return {};
    }
  }
  return asRecord(params) ?? {};
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
  if (isTravelTaskParams(params)) {
    const travelImages = deriveTravelInputImages(params);
    if (travelImages.length > 0) {
      return travelImages;
    }
  }

  const orchestratorDetails = asRecord(params.orchestrator_details);
  const orchestratorPayload = asRecord(params.full_orchestrator_payload);
  const segmentParams = asRecord(params.individual_segment_params);

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
  if (isTravelTaskParams(params)) {
    return deriveTravelPrompt(params);
  }

  const orchestratorDetails = asRecord(params.orchestrator_details);
  const orchestratorPayload = asRecord(params.full_orchestrator_payload);
  const segmentParams = asRecord(params.individual_segment_params);
  const segmentIndex = toIntegerOrNull(params.segment_index);

  const isSegmentTask = params.segment_index !== undefined;

  // For segment tasks, try to get enhanced prompt first
  if (isSegmentTask) {
    // Check for enhanced prompt - can be singular field or in expanded array
    const enhancedFromOrchestratorDetails = asStringArray(orchestratorDetails?.enhanced_prompts_expanded);
    const enhancedFromOrchestratorPayload = asStringArray(orchestratorPayload?.enhanced_prompts_expanded);
    const enhancedPrompt = pickFirstString(
      segmentParams?.enhanced_prompt,
      params.enhanced_prompt,
      segmentIndex === null ? undefined : enhancedFromOrchestratorDetails?.[segmentIndex],
      segmentIndex === null ? undefined : enhancedFromOrchestratorPayload?.[segmentIndex],
    );
    if (enhancedPrompt) return enhancedPrompt;

    // Fall back to base prompt
    return (
      pickFirstString(
        segmentParams?.base_prompt,
        params.base_prompt,
        params.prompt,
        orchestratorDetails?.base_prompt,
      ) ?? null
    );
  }

  // For full timeline/orchestrated tasks
  // The global base_prompt is what the user typed in the prompt field.
  // Per-pair overrides (base_prompts_expanded) are segment-specific and shouldn't
  // be shown as the task-level prompt — they're misleading when the user explicitly
  // cleared the global prompt.
  const enhancedFromOrchestratorDetails = asStringArray(orchestratorDetails?.enhanced_prompts_expanded);
  const enhancedFromOrchestratorPayload = asStringArray(orchestratorPayload?.enhanced_prompts_expanded);
  return (
    pickFirstString(
      orchestratorDetails?.base_prompt,
      orchestratorPayload?.base_prompt,
      params.base_prompt,
      params.prompt,
      // Fall back to enhanced prompts (AI-improved) but NOT base_prompts_expanded
      // which are per-pair overrides, not task-level prompts.
      enhancedFromOrchestratorDetails?.[0],
      enhancedFromOrchestratorPayload?.[0],
    ) ?? null
  );
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
  return taskType === 'image-upscale' || taskType === 'image_upscale';
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
  const orchestratorDetails = asRecord(params.orchestrator_details);
  const orchestratorPayload = asRecord(params.full_orchestrator_payload);

  // Check for array format (image edit tasks use this)
  const lorasArray = params.loras || orchestratorDetails?.loras || orchestratorPayload?.loras;
  if (Array.isArray(lorasArray) && lorasArray.length > 0) {
    return lorasArray
      .map((lora): LoraInfo | null => {
        const loraRecord = asRecord(lora);
        if (!loraRecord) return null;
        const url = asString(loraRecord.url) ?? '';
        const parsedStrength = toFiniteNumber(loraRecord.strength) ?? toFiniteNumber(loraRecord.multiplier) ?? 1;
        return {
          url,
          strength: parsedStrength,
          displayName: extractLoraDisplayName(url),
        };
      })
      .filter((lora): lora is LoraInfo => lora !== null);
  }

  // Check for object format (video tasks use additional_loras)
  const additionalLoras = params.additional_loras || orchestratorDetails?.additional_loras || orchestratorPayload?.additional_loras;
  if (additionalLoras && typeof additionalLoras === 'object' && Object.keys(additionalLoras as Record<string, unknown>).length > 0) {
    return Object.entries(additionalLoras as Record<string, unknown>).map(([url, strength]) => ({
      url,
      strength: toFiniteNumber(strength) ?? 1,
      displayName: extractLoraDisplayName(url),
    }));
  }

  return [];
}

function extractLoraDisplayName(url: string): string {
  const fileName = url.split('/').pop() || 'Unknown';
  return fileName.replace(/\.(safetensors|ckpt|pt)$/i, '').replace(/_/g, ' ');
}

const TRAVEL_SEGMENT_IMAGE_SOURCE_ORDER: TravelPayloadSource[] = [
  'individualSegmentParams',
  'taskViewContract',
  'familyContract',
  'rawParams',
];

const TRAVEL_TIMELINE_IMAGE_SOURCE_ORDER: TravelPayloadSource[] = [
  'taskViewContract',
  'familyContract',
  'orchestratorDetails',
  'fullOrchestratorPayload',
  'rawParams',
];

const TRAVEL_PROMPT_SOURCE_ORDER: TravelPayloadSource[] = [
  'taskViewContract',
  'familyContract',
  'individualSegmentParams',
  'orchestratorDetails',
  'fullOrchestratorPayload',
  'rawParams',
];

function dedupeTruthyStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

function isTravelTaskParams(params: Record<string, unknown>): boolean {
  const familyContract = asRecord(params.task_family_contract);
  return (
    params.task_family === 'travel_between_images'
    || familyContract?.task_family === 'travel_between_images'
    || params.orchestrator_details !== undefined
    || params.full_orchestrator_payload !== undefined
    || params.individual_segment_params !== undefined
    || Array.isArray(params.image_urls)
    || Array.isArray(params.input_image_paths_resolved)
  );
}

function deriveTravelInputImages(params: Record<string, unknown>): string[] {
  const snapshot = buildTaskPayloadSnapshot(params);
  const reader = createTravelPayloadReader(snapshot);
  const isSegmentTask = params.segment_index !== undefined;

  if (isSegmentTask) {
    const segmentInputImages = reader.pickStringArray('input_image_paths_resolved', TRAVEL_SEGMENT_IMAGE_SOURCE_ORDER);
    if (segmentInputImages && segmentInputImages.length > 0) {
      return dedupeTruthyStrings(segmentInputImages);
    }

    const startImage = reader.pickString('start_image_url', TRAVEL_SEGMENT_IMAGE_SOURCE_ORDER);
    const endImage = reader.pickString('end_image_url', TRAVEL_SEGMENT_IMAGE_SOURCE_ORDER);
    return dedupeTruthyStrings([startImage, endImage]);
  }

  const timelineSources = [
    reader.pickStringArray('input_images', TRAVEL_TIMELINE_IMAGE_SOURCE_ORDER),
    reader.pickStringArray('input_image_paths_resolved', TRAVEL_TIMELINE_IMAGE_SOURCE_ORDER),
    reader.pickStringArray('image_urls', TRAVEL_TIMELINE_IMAGE_SOURCE_ORDER),
  ];
  for (const candidate of timelineSources) {
    if (candidate && candidate.length > 0) {
      return dedupeTruthyStrings(candidate);
    }
  }

  return [];
}

function deriveTravelPrompt(params: Record<string, unknown>): string | null {
  const snapshot = buildTaskPayloadSnapshot(params);
  const reader = createTravelPayloadReader(snapshot);
  const segmentIndex = toIntegerOrNull(params.segment_index);
  const isSegmentTask = params.segment_index !== undefined;

  if (isSegmentTask) {
    const enhancedPromptsExpanded = reader.pickStringArray('enhanced_prompts_expanded', [
      'orchestratorDetails',
      'fullOrchestratorPayload',
      'rawParams',
    ]);
    const enhancedPrompt = pickFirstString(
      reader.pickString('enhanced_prompt', TRAVEL_PROMPT_SOURCE_ORDER),
      segmentIndex === null ? undefined : enhancedPromptsExpanded?.[segmentIndex],
    );
    if (enhancedPrompt) {
      return enhancedPrompt;
    }

    return (
      pickFirstString(
        reader.pickString('prompt', TRAVEL_PROMPT_SOURCE_ORDER),
        reader.pickString('base_prompt', TRAVEL_PROMPT_SOURCE_ORDER),
      ) ?? null
    );
  }

  return (
    pickFirstString(
      reader.pickString('prompt', TRAVEL_PROMPT_SOURCE_ORDER),
      reader.pickString('base_prompt', TRAVEL_PROMPT_SOURCE_ORDER),
      reader.pickString('enhanced_prompt', TRAVEL_PROMPT_SOURCE_ORDER),
    ) ?? null
  );
}

function toIntegerOrNull(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  if (numeric === null || !Number.isInteger(numeric)) return null;
  return numeric;
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
