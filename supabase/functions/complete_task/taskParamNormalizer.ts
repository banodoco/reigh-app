import { extractFromArray } from './generation-core.ts';

interface SegmentTaskData {
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NormalizedSegmentTask {
  taskData: SegmentTaskData;
  params: Record<string, unknown>;
  orchestratorDetails: Record<string, unknown>;
  segmentIndex: number;
  pairShotGenerationId: string | null;
}

interface NormalizeSegmentTaskParamsInput {
  taskData: SegmentTaskData;
  childOrder: number | null;
  isSingleItem: boolean;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function extractSegmentSpecificParams(
  params: Record<string, unknown>,
  orchestratorDetails: Record<string, unknown>,
  segmentIndex: number,
): Record<string, unknown> {
  const nextParams: Record<string, unknown> = { ...params };

  const specificPrompt = extractFromArray(orchestratorDetails.base_prompts_expanded, segmentIndex);
  if (specificPrompt !== undefined) {
    nextParams.prompt = specificPrompt;
  }

  const specificNegativePrompt = extractFromArray(orchestratorDetails.negative_prompts_expanded, segmentIndex);
  if (specificNegativePrompt !== undefined) {
    nextParams.negative_prompt = specificNegativePrompt;
  }

  const specificFrames = extractFromArray(orchestratorDetails.segment_frames_expanded, segmentIndex);
  if (specificFrames !== undefined) {
    nextParams.num_frames = specificFrames;
  }

  const specificOverlap = extractFromArray(orchestratorDetails.frame_overlap_expanded, segmentIndex);
  if (specificOverlap !== undefined) {
    nextParams.frame_overlap = specificOverlap;
  }

  const pairShotGenId = extractFromArray(orchestratorDetails.pair_shot_generation_ids, segmentIndex);
  if (pairShotGenId !== undefined) {
    nextParams.pair_shot_generation_id = pairShotGenId;
  }

  const startImageGenId = extractFromArray(orchestratorDetails.input_image_generation_ids, segmentIndex);
  if (startImageGenId !== undefined) {
    nextParams.start_image_generation_id = startImageGenId;
  }

  const endImageGenId = extractFromArray(orchestratorDetails.input_image_generation_ids, segmentIndex + 1);
  if (endImageGenId !== undefined) {
    nextParams.end_image_generation_id = endImageGenId;
  }

  return nextParams;
}

export function normalizeSegmentTaskParams({
  taskData,
  childOrder,
  isSingleItem,
}: NormalizeSegmentTaskParamsInput): NormalizedSegmentTask {
  const baseParams = toRecord(taskData.params);
  const orchestratorDetails = toRecord(baseParams.orchestrator_details ?? baseParams.full_orchestrator_payload);
  const hasOrchestratorDetails = Object.keys(orchestratorDetails).length > 0;
  const hasChildOrder = childOrder !== null && !Number.isNaN(childOrder);

  let normalizedParams: Record<string, unknown> = { ...baseParams };

  if (hasOrchestratorDetails && hasChildOrder) {
    normalizedParams = extractSegmentSpecificParams(normalizedParams, orchestratorDetails, childOrder as number);
  }

  if (isSingleItem) {
    normalizedParams._isSingleSegmentCase = true;
  }

  const segmentIndex = typeof normalizedParams.segment_index === 'number'
    ? normalizedParams.segment_index
    : (hasChildOrder ? childOrder as number : 0);

  const orchestratorPairIds = Array.isArray(orchestratorDetails.pair_shot_generation_ids)
    ? orchestratorDetails.pair_shot_generation_ids
    : null;

  const individualSegmentParams = toRecord(normalizedParams.individual_segment_params);
  const pairShotGenerationId =
    toStringOrNull(normalizedParams.pair_shot_generation_id) ??
    toStringOrNull(individualSegmentParams.pair_shot_generation_id) ??
    toStringOrNull(orchestratorPairIds?.[segmentIndex]);

  return {
    taskData: {
      ...taskData,
      params: normalizedParams,
    },
    params: normalizedParams,
    orchestratorDetails,
    segmentIndex,
    pairShotGenerationId,
  };
}
