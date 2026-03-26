import type { ResolverResult, TaskFamilyResolver, TaskInsertObject } from "./types.ts";
import { generateTaskId } from "./shared/ids.ts";
import { mapPathLorasToStrengthRecord, validateLoraConfigs } from "./shared/loras.ts";
import { resolveImageGenerationResolution } from "./shared/resolution.ts";
import { validateSeed32Bit } from "./shared/seed.ts";
import {
  TaskValidationError,
  validateNonEmptyString,
  validateRequiredFields,
} from "./shared/validation.ts";

interface PathLoraConfig {
  path: string;
  strength: number;
}

type ReferenceMode = "style" | "subject" | "style-character" | "scene" | "custom";

interface BatchImageGenerationTaskInput {
  prompts: Array<{ id: string; fullPrompt: string; shortPrompt?: string }>;
  imagesPerPrompt: number;
  loras?: PathLoraConfig[];
  shot_id?: string;
  resolution?: string;
  resolution_scale?: number;
  resolution_mode?: "project" | "custom";
  custom_aspect_ratio?: string;
  model_name?: string;
  steps?: number;
  negative_prompt?: string;
  seed?: number;
  style_reference_image?: string;
  subject_reference_image?: string;
  style_reference_strength?: number;
  subject_strength?: number;
  subject_description?: string;
  in_this_scene?: boolean;
  in_this_scene_strength?: number;
  reference_mode?: ReferenceMode;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  lightning_lora_strength_phase_1?: number;
  lightning_lora_strength_phase_2?: number;
  additional_loras?: Record<string, number>;
}

const IN_SCENE_LORA_URL = "https://huggingface.co/peteromallet/random_junk/resolve/main/in_scene_different_object_000010500.safetensors";

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

function validateImageGenerationInput(input: BatchImageGenerationTaskInput): void {
  validateRequiredFields(input, ["prompts", "imagesPerPrompt"]);

  if (input.prompts.length === 0) {
    throw new TaskValidationError("At least one prompt is required", "prompts");
  }
  if (input.imagesPerPrompt < 1 || input.imagesPerPrompt > 16) {
    throw new TaskValidationError("Images per prompt must be between 1 and 16", "imagesPerPrompt");
  }

  input.prompts.forEach((prompt, index) => {
    validateNonEmptyString(prompt.fullPrompt, `prompts[${index}].fullPrompt`, `Prompt ${index + 1}`);
  });

  validateSeed32Bit(input.seed);
  validateLoraConfigs(input.loras, {
    pathField: "path",
    strengthField: "strength",
    strengthLabel: "strength",
    min: 0,
    max: 2,
  });
}

function buildTaskType(input: BatchImageGenerationTaskInput): string {
  switch (input.model_name) {
    case "qwen-image":
      return input.style_reference_image ? "qwen_image_style" : "qwen_image";
    case "qwen-image-2512":
      return "qwen_image_2512";
    case "z-image":
      return "z_image_turbo";
    default:
      return "wan_2_2_t2i";
  }
}

function supportsReferenceParams(input: BatchImageGenerationTaskInput): boolean {
  return input.model_name?.startsWith("qwen-image") === true || input.model_name === "z-image";
}

function filterReferenceSettingsByMode(
  referenceMode: ReferenceMode | undefined,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  if (!referenceMode || referenceMode === "custom") {
    return settings;
  }

  const filtered: Record<string, unknown> = {};
  switch (referenceMode) {
    case "style":
      if (settings.style_reference_strength !== undefined) filtered.style_reference_strength = settings.style_reference_strength;
      break;
    case "subject":
      filtered.style_reference_strength = 1.1;
      filtered.subject_strength = 0.5;
      if (typeof settings.subject_description === "string" && settings.subject_description.trim()) {
        filtered.subject_description = settings.subject_description;
      }
      break;
    case "style-character":
      if (settings.style_reference_strength !== undefined) filtered.style_reference_strength = settings.style_reference_strength;
      if (settings.subject_strength !== undefined) filtered.subject_strength = settings.subject_strength;
      if (typeof settings.subject_description === "string" && settings.subject_description.trim()) {
        filtered.subject_description = settings.subject_description;
      }
      break;
    case "scene":
      filtered.style_reference_strength = 1.1;
      filtered.in_this_scene = true;
      filtered.in_this_scene_strength = 0.5;
      break;
  }
  return filtered;
}

function buildLorasParam(
  loras: PathLoraConfig[] | undefined,
  inSceneLora?: { url: string; strength: number },
): { additional_loras?: Record<string, number> } {
  const lorasMap = mapPathLorasToStrengthRecord(loras);
  if (inSceneLora && inSceneLora.strength > 0) {
    lorasMap[inSceneLora.url] = inSceneLora.strength;
  }
  return Object.keys(lorasMap).length > 0 ? { additional_loras: lorasMap } : {};
}

function buildReferenceParams(input: BatchImageGenerationTaskInput): Record<string, unknown> {
  if (!input.style_reference_image) {
    return {};
  }

  const filteredSettings = filterReferenceSettingsByMode(input.reference_mode, {
    style_reference_strength: input.style_reference_strength,
    subject_strength: input.subject_strength,
    subject_description: input.subject_description,
    in_this_scene: input.in_this_scene,
    in_this_scene_strength: input.in_this_scene_strength,
  });

  return {
    style_reference_image: input.style_reference_image,
    subject_reference_image: input.subject_reference_image || input.style_reference_image,
    ...filteredSettings,
    ...(filteredSettings.in_this_scene_strength !== undefined
      ? { scene_reference_strength: filteredSettings.in_this_scene_strength }
      : {}),
  };
}

function buildHiresOverride(
  input: BatchImageGenerationTaskInput,
  baseLoras: Record<string, number> = {},
): Record<string, unknown> {
  return {
    ...(input.hires_scale !== undefined ? { hires_scale: input.hires_scale } : {}),
    ...(input.hires_steps !== undefined ? { hires_steps: input.hires_steps } : {}),
    ...(input.hires_denoise !== undefined ? { hires_denoise: input.hires_denoise } : {}),
    ...(input.additional_loras && Object.keys(input.additional_loras).length > 0
      ? { additional_loras: { ...baseLoras, ...input.additional_loras } }
      : {}),
  };
}

function buildTaskParams(
  input: BatchImageGenerationTaskInput,
  prompt: string,
  taskType: string,
  finalResolution: string,
  seed: number,
): Record<string, unknown> {
  const taskId = generateTaskId(taskType);
  const lorasParam = buildLorasParam(
    input.loras,
    supportsReferenceParams(input) && input.in_this_scene && input.in_this_scene_strength
      ? { url: IN_SCENE_LORA_URL, strength: input.in_this_scene_strength }
      : undefined,
  );

  const referenceParams = supportsReferenceParams(input) ? buildReferenceParams(input) : {};
  const hiresOverride = buildHiresOverride(input, lorasParam.additional_loras);

  return {
    task_id: taskId,
    model: input.model_name ?? "optimised-t2i",
    prompt,
    resolution: finalResolution,
    seed,
    steps: input.steps ?? 12,
    add_in_position: false,
    ...(input.negative_prompt ? { negative_prompt: input.negative_prompt } : {}),
    ...lorasParam,
    ...referenceParams,
    ...hiresOverride,
    ...(input.shot_id ? { shot_id: input.shot_id } : {}),
    ...(input.lightning_lora_strength_phase_1 !== undefined
      ? { lightning_lora_strength_phase_1: input.lightning_lora_strength_phase_1 }
      : {}),
    ...(input.lightning_lora_strength_phase_2 !== undefined
      ? { lightning_lora_strength_phase_2: input.lightning_lora_strength_phase_2 }
      : {}),
  };
}

export const imageGenerationResolver: TaskFamilyResolver = (request, context): ResolverResult => {
  const input = request.input as unknown as BatchImageGenerationTaskInput;
  validateImageGenerationInput(input);

  const finalResolution = resolveImageGenerationResolution({
    aspectRatio: context.aspectRatio,
    customResolution: input.resolution,
    modelName: input.model_name,
    resolutionScale: input.resolution_scale,
    resolutionMode: input.resolution_mode,
    customAspectRatio: input.custom_aspect_ratio,
  }).resolution;
  const taskType = buildTaskType(input);
  const totalTaskCount = input.prompts.length * input.imagesPerPrompt;
  const baseSeed = input.seed ?? Math.floor(Math.random() * 0x7fffffff);
  let taskIndex = 0;

  const tasks = input.prompts.flatMap((promptEntry) => {
    return Array.from({ length: input.imagesPerPrompt }, () => {
      const seed = totalTaskCount > 1 ? baseSeed + taskIndex++ : baseSeed;
      const params = buildTaskParams(
        input,
        promptEntry.fullPrompt,
        taskType,
        finalResolution,
        seed,
      );
      return buildQueuedTask(context.projectId, taskType, params);
    });
  });

  return { tasks };
};
