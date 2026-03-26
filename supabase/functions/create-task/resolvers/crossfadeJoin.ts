import type { ResolverResult, TaskFamilyResolver, TaskInsertObject } from "./types.ts";
import {
  buildOrchestrationContract,
} from "./shared/taskContracts.ts";
import { generateRunId } from "./shared/ids.ts";
import {
  TaskValidationError,
  validateNonEmptyString,
  validateRequiredFields,
} from "./shared/validation.ts";

interface CrossfadeJoinTaskInput {
  shot_id?: string;
  parent_generation_id?: string;
  clip_urls: string[];
  frame_overlap_settings_expanded: number[];
  audio_url?: string;
  tool_type?: string;
}

function buildQueuedTask(
  projectId: string,
  taskType: string,
  params: Record<string, unknown>,
): TaskInsertObject {
  return {
    project_id: projectId,
    task_type: taskType,
    params,
    status: "Queued",
    created_at: new Date().toISOString(),
    dependant_on: null,
  };
}

function validateCrossfadeJoinInput(input: CrossfadeJoinTaskInput): void {
  validateRequiredFields(input, ["clip_urls", "frame_overlap_settings_expanded"]);

  if (input.clip_urls.length < 2) {
    throw new TaskValidationError("At least two clips are required to create a crossfade join", "clip_urls");
  }
  if (input.frame_overlap_settings_expanded.length !== input.clip_urls.length - 1) {
    throw new TaskValidationError(
      "frame_overlap_settings_expanded must contain one entry per clip boundary",
      "frame_overlap_settings_expanded",
    );
  }

  input.clip_urls.forEach((clipUrl, index) => {
    validateNonEmptyString(clipUrl, `clip_urls[${index}]`, `Clip ${index + 1} URL`);
  });

  input.frame_overlap_settings_expanded.forEach((overlap, index) => {
    if (!Number.isFinite(overlap) || overlap <= 0) {
      throw new TaskValidationError(
        `Overlap at boundary ${index} must be a positive number`,
        "frame_overlap_settings_expanded",
      );
    }
  });
}

export const crossfadeJoinResolver: TaskFamilyResolver = (request, context): ResolverResult => {
  const input = request.input as unknown as CrossfadeJoinTaskInput;
  validateCrossfadeJoinInput(input);

  const runId = generateRunId();
  const fullOrchestratorPayload: Record<string, unknown> = {
    run_id: runId,
    shot_id: input.shot_id,
    parent_generation_id: input.parent_generation_id,
    clip_urls: input.clip_urls,
    frame_overlap_settings_expanded: input.frame_overlap_settings_expanded,
    ...(input.audio_url ? { audio_url: input.audio_url } : {}),
    ...(input.tool_type ? { tool_type: input.tool_type } : {}),
  };

  return {
    tasks: [
      buildQueuedTask(context.projectId, "travel_stitch", {
        shot_id: input.shot_id,
        parent_generation_id: input.parent_generation_id,
        clip_urls: input.clip_urls,
        frame_overlap_settings_expanded: input.frame_overlap_settings_expanded,
        full_orchestrator_payload: fullOrchestratorPayload,
        orchestration_contract: buildOrchestrationContract({
          taskFamily: "join_clips",
          runId,
          parentGenerationId: input.parent_generation_id,
          shotId: input.shot_id,
          generationRouting: "variant_parent",
        }),
        ...(input.audio_url ? { audio_url: input.audio_url } : {}),
        ...(input.tool_type ? { tool_type: input.tool_type } : {}),
      }),
    ],
  };
};
