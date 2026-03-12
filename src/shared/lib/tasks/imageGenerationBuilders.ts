import { mapPathLorasToStrengthRecord } from '../taskCreation';
import { composeOptionalFields, isNonEmptyString } from './core/taskFieldPolicy';
import { resolveByPrecedence } from './taskParamContract';
import { filterReferenceSettingsByMode } from './referenceImageFiltering';
import type {
  BuildReferenceParamsInput,
  ImageGenerationTaskParams,
  ReferenceMode,
} from './imageGenerationTypes';

export function buildLorasParam(
  loras: ImageGenerationTaskParams['loras'],
  inSceneLora?: { url: string; strength: number },
): { additional_loras?: Record<string, number> } {
  const lorasMap: Record<string, number> = mapPathLorasToStrengthRecord(loras);
  if (inSceneLora && inSceneLora.strength > 0) {
    lorasMap[inSceneLora.url] = inSceneLora.strength;
  }
  return Object.keys(lorasMap).length > 0 ? { additional_loras: lorasMap } : {};
}

export function buildReferenceParams(
  styleReferenceImage: string | undefined,
  mode: ReferenceMode | undefined,
  settings: BuildReferenceParamsInput,
): Record<string, unknown> {
  if (!styleReferenceImage) {
    return {};
  }

  const filteredSettings = filterReferenceSettingsByMode(mode, {
    style_reference_strength: settings.styleReferenceStrength,
    subject_strength: settings.subjectStrength,
    subject_description: settings.subjectDescription,
    in_this_scene: settings.inThisScene,
    in_this_scene_strength: settings.inThisSceneStrength,
  });

  return {
    style_reference_image: styleReferenceImage,
    subject_reference_image: settings.subjectReferenceImage || styleReferenceImage,
    ...filteredSettings,
    ...composeOptionalFields([
      {
        key: 'scene_reference_strength',
        value: filteredSettings.in_this_scene_strength,
      },
    ]),
  };
}

export function buildHiresOverride(
  hiresScale: number | undefined,
  hiresDenoise: number | undefined,
  hiresSteps: number | undefined,
  additionalLoras: Record<string, number> | undefined,
  baseLoras: Record<string, number> = {},
): Record<string, unknown> {
  return {
    ...composeOptionalFields([
      { key: 'hires_scale', value: hiresScale },
      { key: 'hires_steps', value: hiresSteps },
      { key: 'hires_denoise', value: hiresDenoise },
    ]),
    ...(additionalLoras && Object.keys(additionalLoras).length > 0
      ? { additional_loras: { ...baseLoras, ...additionalLoras } }
      : {}),
  };
}

export function buildImageGenerationBaseParams(
  params: ImageGenerationTaskParams,
  taskId: string,
  finalResolution: string,
): Record<string, unknown> {
  const modelName = resolveByPrecedence(params.model_name, 'optimised-t2i') ?? 'optimised-t2i';
  const seed = resolveByPrecedence(params.seed, 11111) ?? 11111;
  const steps = resolveByPrecedence(params.steps, 12) ?? 12;

  return {
    task_id: taskId,
    model: modelName,
    prompt: params.prompt,
    resolution: finalResolution,
    seed,
    steps,
    add_in_position: false,
    ...composeOptionalFields([
      {
        key: 'negative_prompt',
        value: params.negative_prompt,
        include: isNonEmptyString,
      },
    ]),
  };
}
