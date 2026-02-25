import { Task } from '@/types/tasks';
import { TASK_NAME_ABBREVIATIONS } from '../constants';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';

type JsonObject = Record<string, unknown>;

function asRecord(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => {
    return typeof item === 'string' && item.length > 0;
  });
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const stringValue = asString(value);
    if (stringValue) {
      return stringValue;
    }
  }
  return null;
}

export const deriveTaskInputImages = (task: Task | null): string[] => {
  if (!task?.params) {
    return [];
  }

  const params = asRecord(task.params) ?? {};

  if (task.taskType === 'individual_travel_segment') {
    const segmentParams = asRecord(params.individual_segment_params);
    const segmentImages = asStringArray(segmentParams?.input_image_paths_resolved);
    if (segmentImages.length > 0) {
      return segmentImages;
    }
    return asStringArray(params.input_image_paths_resolved);
  }

  const inputImages: string[] = [];

  const stringFields = [
    params.input_image,
    params.image,
    params.init_image,
    params.control_image,
  ];

  for (const value of stringFields) {
    const image = asString(value);
    if (image) {
      inputImages.push(image);
    }
  }

  inputImages.push(...asStringArray(params.images));
  inputImages.push(...asStringArray(params.input_images));

  const orchestratorPayload = asRecord(params.full_orchestrator_payload);
  inputImages.push(...asStringArray(orchestratorPayload?.input_image_paths_resolved));

  const orchestratorDetails = asRecord(params.orchestrator_details);
  inputImages.push(...asStringArray(orchestratorDetails?.input_image_paths_resolved));

  inputImages.push(...asStringArray(params.input_image_paths_resolved));
  return inputImages;
};

export const getAbbreviatedTaskName = (fullName: string): string => {
  return TASK_NAME_ABBREVIATIONS[fullName] || fullName;
};

export const parseTaskParamsForDisplay = (params: unknown): { parsed: Record<string, unknown>; promptText: string } => {
  let parsed: Record<string, unknown> = {};

  try {
    const candidate = typeof params === 'string' ? JSON.parse(params) : params;
    parsed = asRecord(candidate) ?? {};
  } catch {
    parsed = {};
  }

  const orchestratorDetails = asRecord(parsed.orchestrator_details);
  const promptText = asString(orchestratorDetails?.prompt) ?? asString(parsed.prompt) ?? '';
  return { parsed, promptText };
};

export const extractShotId = (task: Task): string | null => {
  const params = asRecord(task.params) ?? {};
  const orchestratorDetails = asRecord(params.orchestrator_details);
  const orchestratorPayload = asRecord(params.full_orchestrator_payload);
  const segmentParams = asRecord(params.individual_segment_params);

  return firstString(
    orchestratorDetails?.shot_id,
    orchestratorPayload?.shot_id,
    segmentParams?.shot_id,
    params.shot_id,
  );
};

export const extractSourceGenerationId = (params: Record<string, unknown>): string | undefined => {
  return firstString(
    params.based_on,
    params.source_generation_id,
    params.generation_id,
    params.input_generation_id,
    params.parent_generation_id,
  ) ?? undefined;
};

export const extractTaskParentGenerationId = (params: Record<string, unknown>): string | undefined => {
  const orchestratorDetails = asRecord(params.orchestrator_details);
  const orchestratorPayload = asRecord(params.full_orchestrator_payload);

  return firstString(
    params.parent_generation_id,
    orchestratorDetails?.parent_generation_id,
    orchestratorPayload?.parent_generation_id,
  ) ?? undefined;
};

export const extractPairShotGenerationId = (task: Task): string | null => {
  const params = asRecord(task.params) ?? {};
  const segmentParams = asRecord(params.individual_segment_params);
  const orchestratorDetails = asRecord(params.orchestrator_details);
  const pairIds = asStringArray(orchestratorDetails?.pair_shot_generation_ids);
  const segmentIndex = typeof params.segment_index === 'number'
    ? params.segment_index
    : Number(params.segment_index ?? 0);
  const safeSegmentIndex = Number.isInteger(segmentIndex) && segmentIndex >= 0 ? segmentIndex : 0;

  return firstString(
    params.pair_shot_generation_id,
    segmentParams?.pair_shot_generation_id,
    pairIds[safeSegmentIndex],
  );
};

export const isSegmentVideoTask = (task: Task): boolean => {
  return task.taskType === 'individual_travel_segment';
};

export const checkSegmentConnection = async (
  pairShotGenerationId: string | null,
  shotId: string
): Promise<boolean> => {
  if (!pairShotGenerationId) {
    return false;
  }

  const { data } = await supabase().from('shot_generations')
    .select('id, shot_id, timeline_frame')
    .eq('id', pairShotGenerationId)
    .maybeSingle();

  return !!data && data.shot_id === shotId && (data.timeline_frame ?? -1) >= 0;
};
