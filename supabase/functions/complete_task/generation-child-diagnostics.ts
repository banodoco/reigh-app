import { extractFromArray } from './generation-core.ts';

interface BuildSegmentMasterStateSnapshotInput {
  taskId: string;
  generationId: string;
  segmentIndex: number;
  parentGenerationId: string | null;
  orchestratorDetails: unknown;
  segmentParams: unknown;
  shotId?: string;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildSegmentMasterStateSnapshot(
  input: BuildSegmentMasterStateSnapshotInput,
): Record<string, unknown> {
  const orchestratorDetails = toRecord(input.orchestratorDetails);
  const segmentParams = toRecord(input.segmentParams);
  const segmentIndex = input.segmentIndex;

  const inputImages = Array.isArray(orchestratorDetails.input_image_paths_resolved)
    ? orchestratorDetails.input_image_paths_resolved
    : [];
  const pairShotGenIds = Array.isArray(orchestratorDetails.pair_shot_generation_ids)
    ? orchestratorDetails.pair_shot_generation_ids
    : [];
  const segmentFramesExpanded = Array.isArray(orchestratorDetails.segment_frames_expanded)
    ? orchestratorDetails.segment_frames_expanded
    : [];
  const structureVideos = Array.isArray(orchestratorDetails.structure_videos)
    ? orchestratorDetails.structure_videos
    : [];

  let segmentStartFrame = 0;
  for (let i = 0; i < segmentIndex && i < segmentFramesExpanded.length; i += 1) {
    segmentStartFrame += Number(segmentFramesExpanded[i]) || 0;
  }
  const segmentEndFrame = segmentStartFrame + (Number(segmentFramesExpanded[segmentIndex]) || 0);

  return {
    taskId: input.taskId,
    generationId: input.generationId,
    segmentIndex,
    parentGenerationId: input.parentGenerationId,
    shotId: input.shotId ?? null,
    prompt: segmentParams.prompt
      ?? extractFromArray(orchestratorDetails.base_prompts_expanded, segmentIndex)
      ?? orchestratorDetails.base_prompt
      ?? null,
    negativePrompt: segmentParams.negative_prompt
      ?? extractFromArray(orchestratorDetails.negative_prompts_expanded, segmentIndex)
      ?? null,
    enhancedPrompt: extractFromArray(orchestratorDetails.enhanced_prompts_expanded, segmentIndex) ?? null,
    startImageUrl: inputImages[segmentIndex] ?? null,
    endImageUrl: inputImages[segmentIndex + 1] ?? null,
    pairShotGenerationId: pairShotGenIds[segmentIndex] ?? null,
    structureVideoCount: structureVideos.length,
    hasLegacyStructurePath: Boolean(orchestratorDetails.structure_video_path),
    segmentFrameWindow: {
      start: segmentStartFrame,
      end: segmentEndFrame,
    },
  };
}
