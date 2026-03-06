import { buildHiresFixParams, processBatchResults } from '../taskCreation';
import type {
  HiresFixApiParams,
  TaskCreationResult,
} from '../taskCreation';
import type { ComfyLoraConfig } from '@/domains/lora/types/lora';
import { runTaskCreationPipeline } from './taskCreatorPipeline';
import { composeTaskParams, composeTaskRequest } from './taskRequestComposer';

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
}

interface MaskedEditTaskBuilderConfig {
  taskType: 'image_inpaint' | 'annotated_image_edit';
  context: string;
  batchOperationName: string;
}

async function createSingleMaskedEditTask(
  config: MaskedEditTaskBuilderConfig,
  params: Omit<MaskedEditTaskParams, 'num_generations'>,
): Promise<TaskCreationResult> {
  const {
    image_url,
    mask_url,
    prompt,
    generation_id,
    shot_id,
    tool_type,
    loras,
    create_as_generation,
    source_variant_id,
    hires_fix,
    qwen_edit_model,
  } = params;

  const taskParams = composeTaskParams({
    source: params,
    baseParams: {
      image_url,
      mask_url,
      prompt,
      num_generations: 1,
      generation_id,
      based_on: generation_id,
      parent_generation_id: generation_id,
    },
    segments: [
      shot_id ? { shot_id } : undefined,
      tool_type ? { tool_type } : undefined,
      loras && loras.length > 0 ? { loras } : undefined,
      create_as_generation ? { create_as_generation: true } : undefined,
      source_variant_id ? { source_variant_id } : undefined,
      buildHiresFixParams(hires_fix),
      qwen_edit_model ? { qwen_edit_model } : undefined,
    ],
  });

  return runTaskCreationPipeline({
    params,
    context: config.context,
    buildTaskRequest: (pipelineParams) => composeTaskRequest({
      source: pipelineParams,
      taskType: config.taskType,
      params: taskParams,
    }),
  });
}

export async function createMaskedEditTask(
  config: MaskedEditTaskBuilderConfig,
  params: MaskedEditTaskParams,
): Promise<string> {
  const { num_generations, ...singleTaskParams } = params;

  if (num_generations === 1) {
    const result = await createSingleMaskedEditTask(config, singleTaskParams);
    return result.task_id;
  }

  const results = await Promise.allSettled(
    Array.from({ length: num_generations }, () => createSingleMaskedEditTask(config, singleTaskParams)),
  );

  const successful = processBatchResults(results, config.batchOperationName);
  return successful[0].task_id;
}
