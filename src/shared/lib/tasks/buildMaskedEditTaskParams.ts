import type { MaskedEditTaskParams } from './maskedEditTaskBuilder';

interface BuildMaskedEditTaskParamsInput {
  projectId: string;
  imageUrl: string;
  maskUrl: string;
  prompt: string;
  numGenerations: number;
  generationId?: string;
  shotId?: string;
  toolType?: string;
  loras?: MaskedEditTaskParams['loras'];
  createAsGeneration?: boolean;
  sourceVariantId?: string;
  hiresFix?: MaskedEditTaskParams['hires_fix'];
  qwenEditModel?: string;
}

export function buildMaskedEditTaskParams(
  input: BuildMaskedEditTaskParamsInput,
): MaskedEditTaskParams {
  return {
    project_id: input.projectId,
    image_url: input.imageUrl,
    mask_url: input.maskUrl,
    prompt: input.prompt,
    num_generations: input.numGenerations,
    generation_id: input.generationId,
    shot_id: input.shotId,
    tool_type: input.toolType,
    loras: input.loras,
    create_as_generation: input.createAsGeneration,
    source_variant_id: input.sourceVariantId,
    hires_fix: input.hiresFix,
    qwen_edit_model: input.qwenEditModel,
  };
}
