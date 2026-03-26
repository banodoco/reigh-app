import type { ResolverResult, TaskFamilyResolver, TaskInsertObject } from "./types.ts";
import { buildHiresFixParams, type HiresFixApiParams } from "./shared/hiresFix.ts";
import {
  TaskValidationError,
  validateNonEmptyString,
  validateRequiredFields,
} from "./shared/validation.ts";

interface ComfyLoraConfig {
  url: string;
  strength: number;
}

interface MaskedEditTaskInput {
  task_type?: "image_inpaint" | "annotated_image_edit";
  image_url: string;
  mask_url: string;
  prompt: string;
  num_generations: number;
  generation_id?: string;
  shot_id?: string;
  tool_type?: string;
  loras?: ComfyLoraConfig[];
  create_as_generation?: boolean;
  source_variant_id?: string;
  hires_fix?: HiresFixApiParams;
  qwen_edit_model?: string;
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

function validateMaskedEditInput(input: MaskedEditTaskInput): void {
  validateRequiredFields(input, ["image_url", "mask_url", "prompt", "num_generations"]);
  validateNonEmptyString(input.image_url, "image_url", "Image URL");
  validateNonEmptyString(input.mask_url, "mask_url", "Mask URL");
  validateNonEmptyString(input.prompt, "prompt", "Prompt");

  if (input.num_generations < 1 || input.num_generations > 16) {
    throw new TaskValidationError("num_generations must be between 1 and 16", "num_generations");
  }
}

function buildMaskedEditParams(input: MaskedEditTaskInput): Record<string, unknown> {
  const params: Record<string, unknown> = {
    image_url: input.image_url,
    mask_url: input.mask_url,
    prompt: input.prompt,
    num_generations: 1,
    generation_id: input.generation_id,
    based_on: input.generation_id,
    parent_generation_id: input.generation_id,
  };

  if (input.shot_id) params.shot_id = input.shot_id;
  if (input.tool_type) params.tool_type = input.tool_type;
  if (input.loras && input.loras.length > 0) params.loras = input.loras;
  if (input.create_as_generation) params.create_as_generation = true;
  if (input.source_variant_id) params.source_variant_id = input.source_variant_id;
  if (input.qwen_edit_model) params.qwen_edit_model = input.qwen_edit_model;

  Object.assign(params, buildHiresFixParams(input.hires_fix));
  return params;
}

export const maskedEditResolver: TaskFamilyResolver = (request, context): ResolverResult => {
  const input = request.input as unknown as MaskedEditTaskInput;
  validateMaskedEditInput(input);

  const taskType = input.task_type ?? "image_inpaint";
  return {
    tasks: Array.from({ length: input.num_generations }, () =>
      buildQueuedTask(context.projectId, taskType, buildMaskedEditParams(input))),
  };
};
