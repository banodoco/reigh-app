import type { ResolverResult, TaskFamilyResolver, TaskInsertObject } from "./types.ts";
import { buildHiresFixParams, type HiresFixApiParams } from "./shared/hiresFix.ts";
import { resolveProjectResolutionFromAspectRatio } from "./shared/resolution.ts";
import { resolveSeed32Bit, validateSeed32Bit } from "./shared/seed.ts";
import { setTaskLineageFields } from "./shared/lineage.ts";
import {
  TaskValidationError,
  validateNonEmptyString,
  validateRequiredFields,
  validateUrlString,
} from "./shared/validation.ts";

interface ComfyLoraConfig {
  url: string;
  strength: number;
}

interface MagicEditTaskInput {
  prompt: string;
  image_url: string;
  negative_prompt?: string;
  resolution?: string;
  seed?: number;
  in_scene?: boolean;
  shot_id?: string;
  output_format?: string;
  enable_sync_mode?: boolean;
  max_wait_seconds?: number;
  enable_base64_output?: boolean;
  tool_type?: string;
  loras?: ComfyLoraConfig[];
  based_on?: string;
  source_variant_id?: string;
  create_as_generation?: boolean;
  hires_fix?: HiresFixApiParams;
  qwen_edit_model?: "qwen-edit" | "qwen-edit-2509" | "qwen-edit-2511";
  numImages?: number;
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

function validateMagicEditInput(input: MagicEditTaskInput): void {
  validateRequiredFields(input, ["prompt", "image_url"]);
  validateNonEmptyString(input.prompt, "prompt", "Prompt");
  validateNonEmptyString(input.image_url, "image_url", "Image URL");
  validateUrlString(input.image_url, "image_url", "Image URL");
  validateSeed32Bit(input.seed);

  if (input.max_wait_seconds !== undefined && input.max_wait_seconds < 1) {
    throw new TaskValidationError("Max wait seconds must be positive", "max_wait_seconds");
  }

  const numImages = input.numImages ?? 1;
  if (numImages < 1 || numImages > 16) {
    throw new TaskValidationError("Number of images must be between 1 and 16", "numImages");
  }
}

function buildMagicEditTaskParams(
  input: MagicEditTaskInput,
  finalResolution: string,
  seed: number,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    seed,
    image: input.image_url,
    prompt: input.prompt,
    output_format: input.output_format ?? "jpeg",
    qwen_edit_model: input.qwen_edit_model ?? "qwen-edit",
    enable_sync_mode: input.enable_sync_mode ?? false,
    max_wait_seconds: input.max_wait_seconds ?? 300,
    enable_base64_output: input.enable_base64_output ?? false,
  };

  if (input.negative_prompt) {
    params.negative_prompt = input.negative_prompt;
  }
  if (input.in_scene !== undefined) {
    params.in_scene = input.in_scene;
  }
  if (finalResolution && finalResolution !== "custom") {
    params.resolution = finalResolution;
  }

  params.add_in_position = false;

  if (input.loras && input.loras.length > 0) {
    params.loras = input.loras;
  }

  setTaskLineageFields(params, {
    shotId: input.shot_id,
    basedOn: input.based_on,
    sourceVariantId: input.source_variant_id,
    createAsGeneration: input.create_as_generation,
    toolType: input.tool_type,
  });

  Object.assign(params, buildHiresFixParams(input.hires_fix));
  return params;
}

export const magicEditResolver: TaskFamilyResolver = (request, context): ResolverResult => {
  const input = request.input as unknown as MagicEditTaskInput;
  validateMagicEditInput(input);

  const finalResolution = resolveProjectResolutionFromAspectRatio({
    aspectRatio: context.aspectRatio,
    customResolution: input.resolution,
  }).resolution;
  const taskCount = input.numImages ?? 1;
  const baseSeed = resolveSeed32Bit({ seed: input.seed, field: "seed" });

  return {
    tasks: Array.from({ length: taskCount }, (_, index) =>
      buildQueuedTask(
        context.projectId,
        "qwen_image_edit",
        buildMagicEditTaskParams(input, finalResolution, baseSeed + index),
      )),
  };
};
