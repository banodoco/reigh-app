import type { HiresFixApiParams } from '@/shared/lib/taskCreation';
import type { ComfyLoraConfig } from '@/domains/lora/types/lora';

export type MaskedEditKind = 'inpaint' | 'annotated_edit';

export interface MaskedEditTaskParams {
  project_id: string;
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
  edit_kind?: MaskedEditKind;
  strength?: number;
}

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
  editKind?: MaskedEditKind;
  strength?: number;
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
    edit_kind: input.editKind,
    strength: input.strength,
  };
}
