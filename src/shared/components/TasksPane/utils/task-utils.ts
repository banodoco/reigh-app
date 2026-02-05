import { Task } from '@/types/tasks';
import { TASK_NAME_ABBREVIATIONS } from '../constants';

// TODO: type properly — task params are deeply nested JSON with varying shapes per task type
// Using index signature to allow deep property access without full structural typing
type DeepJsonParams = { [key: string]: DeepJsonParams | string | string[] | number | boolean | null | undefined };

/**
 * Derive input images from task params
 * Extracts image URLs from various param locations based on task type
 */
export const deriveInputImages = (task: Task | null): string[] => {
  if (!task?.params) return [];
  const params = task.params as DeepJsonParams;

  // For individual_travel_segment, use top-level or individual_segment_params (2 images only)
  if (task.taskType === 'individual_travel_segment') {
    const images = (params.individual_segment_params as DeepJsonParams)?.input_image_paths_resolved ||
                   params.input_image_paths_resolved ||
                   [];
    return (Array.isArray(images) ? images : []).filter(Boolean) as string[];
  }

  const inputImages: string[] = [];
  if (typeof params.input_image === 'string') inputImages.push(params.input_image);
  if (typeof params.image === 'string') inputImages.push(params.image);
  if (typeof params.init_image === 'string') inputImages.push(params.init_image);
  if (typeof params.control_image === 'string') inputImages.push(params.control_image);
  if (params.images && Array.isArray(params.images)) inputImages.push(...params.images as string[]);
  if (params.input_images && Array.isArray(params.input_images)) inputImages.push(...params.input_images as string[]);
  // For travel tasks, also check orchestrator paths
  const orchestratorPayload = params.full_orchestrator_payload as DeepJsonParams | undefined;
  if (orchestratorPayload?.input_image_paths_resolved && Array.isArray(orchestratorPayload.input_image_paths_resolved)) {
    inputImages.push(...orchestratorPayload.input_image_paths_resolved as string[]);
  }
  const orchestratorDetails = params.orchestrator_details as DeepJsonParams | undefined;
  if (orchestratorDetails?.input_image_paths_resolved && Array.isArray(orchestratorDetails.input_image_paths_resolved)) {
    inputImages.push(...orchestratorDetails.input_image_paths_resolved as string[]);
  }
  // Also check top-level input_image_paths_resolved
  if (params.input_image_paths_resolved && Array.isArray(params.input_image_paths_resolved)) {
    inputImages.push(...params.input_image_paths_resolved as string[]);
  }
  return inputImages.filter(Boolean);
};

/**
 * Get abbreviated task name for tight spaces
 */
export const getAbbreviatedTaskName = (fullName: string): string => {
  return TASK_NAME_ABBREVIATIONS[fullName] || fullName;
};

/**
 * Parse task params safely (handles both string and object formats)
 */
export const parseTaskParamsForDisplay = (params: unknown): { parsed: Record<string, unknown>; promptText: string } => {
  const parsed = typeof params === 'string'
    ? (() => { try { return JSON.parse(params); } catch { return {}; } })()
    : (params || {}) as Record<string, unknown>;

  const p = parsed as DeepJsonParams;
  const promptText = ((p?.orchestrator_details as DeepJsonParams)?.prompt as string) || (p?.prompt as string) || '';
  return { parsed, promptText };
};

/**
 * Extract shot_id from task params for video tasks
 */
export const extractShotId = (task: Task): string | null => {
  const params = task.params as DeepJsonParams;

  // Try different locations where shot_id might be stored based on task type
  return (
    ((params?.orchestrator_details as DeepJsonParams)?.shot_id as string) ||
    ((params?.full_orchestrator_payload as DeepJsonParams)?.shot_id as string) ||
    ((params?.individual_segment_params as DeepJsonParams)?.shot_id as string) ||
    (params?.shot_id as string) ||
    null
  );
};

/**
 * Extract source generation ID from task params
 * Used for variant fetching and "Based On" feature
 */
export const extractSourceGenerationId = (params: Record<string, unknown>): string | undefined => {
  const p = params as DeepJsonParams;
  return (
    (p?.based_on as string) ||
    (p?.source_generation_id as string) ||
    (p?.generation_id as string) ||
    (p?.input_generation_id as string) ||
    (p?.parent_generation_id as string) ||
    undefined
  );
};

/**
 * Extract parent generation ID from task params
 * For edit-video tasks, the REAL parent is in task params, not the generation's parent_generation_id
 */
export const extractTaskParentGenerationId = (params: Record<string, unknown>): string | undefined => {
  const p = params as DeepJsonParams;
  return (
    (p?.parent_generation_id as string) ||
    ((p?.orchestrator_details as DeepJsonParams)?.parent_generation_id as string) ||
    ((p?.full_orchestrator_payload as DeepJsonParams)?.parent_generation_id as string) ||
    undefined
  );
};

/**
 * Extract pair_shot_generation_id from task params for segment videos.
 * This identifies which timeline pair the segment belongs to.
 */
export const extractPairShotGenerationId = (task: Task): string | null => {
  const params = task.params as DeepJsonParams;

  const orchDetails = params?.orchestrator_details as DeepJsonParams | undefined;
  const pairIds = orchDetails?.pair_shot_generation_ids as string[] | undefined;
  const segmentIndex = (params?.segment_index as number) ?? 0;

  return (
    (params?.pair_shot_generation_id as string) ||
    ((params?.individual_segment_params as DeepJsonParams)?.pair_shot_generation_id as string) ||
    (pairIds?.[segmentIndex]) ||
    null
  );
};

/**
 * Check if a task is a segment video (individual_travel_segment)
 * These should open in shot context for proper timeline integration.
 */
export const isSegmentVideoTask = (task: Task): boolean => {
  return task.taskType === 'individual_travel_segment';
};



