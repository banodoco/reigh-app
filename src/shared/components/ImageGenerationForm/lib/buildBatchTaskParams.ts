/**
 * buildBatchTaskParams - Constructs BatchImageGenerationTaskParams from form state
 *
 * Pure utility function extracted from ImageGenerationForm.
 * Single source of truth for building task parameters.
 */

import type { PathLoraConfig } from '@/domains/lora/types/lora';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { joinPromptParts } from '@/shared/lib/tasks/promptAssembly';
import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';
import { PromptEntry, HiresFixConfig, ReferenceApiParams } from '../types';
import { toShortPrompt } from './promptUtils';

interface BuildBatchTaskParamsInput {
  projectId: string;
  prompts: PromptEntry[];
  imagesPerPrompt: number;
  shotId: string | null;
  beforePromptText: string;
  afterPromptText: string;
  styleBoostTerms: string; // Appended to prompts, NOT sent to API
  isLocalGenerationEnabled: boolean;
  hiresFixConfig: HiresFixConfig;
  modelName: string; // Model name for task type mapping (e.g., 'qwen-image', 'qwen-image-2512', 'z-image')
  projectResolution?: string;
  loras: PathLoraConfig[];
  // Reference params grouped together - snake_case to match API directly
  referenceParams: Partial<ReferenceApiParams>;
}

function scaledResolution(baseResolution: string | undefined, scale: number | undefined): string | undefined {
  if (!baseResolution) return undefined;
  const match = /^(\d+)x(\d+)$/.exec(baseResolution.trim());
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return undefined;
  const effectiveScale = scale ?? 1;
  if (!Number.isFinite(effectiveScale) || effectiveScale <= 0) return undefined;
  return `${Math.round(width * effectiveScale)}x${Math.round(height * effectiveScale)}`;
}

export function buildBatchTaskParams(input: BuildBatchTaskParamsInput): BatchImageGenerationTaskParams {
  const styleBoostTerms = input.styleBoostTerms?.trim() ?? '';
  const effectiveAfterText = joinPromptParts(
    [input.afterPromptText, styleBoostTerms],
    'legacy_batch_comma',
  );
  const referenceParams = {
    ...(input.referenceParams.style_reference_image !== undefined && {
      style_reference_image: input.referenceParams.style_reference_image,
    }),
    ...(input.referenceParams.subject_reference_image !== undefined && {
      subject_reference_image: input.referenceParams.subject_reference_image,
    }),
    ...(input.referenceParams.style_reference_strength !== undefined && {
      style_reference_strength: input.referenceParams.style_reference_strength,
    }),
    ...(input.referenceParams.subject_strength !== undefined && {
      subject_strength: input.referenceParams.subject_strength,
    }),
    ...(input.referenceParams.subject_description !== undefined && {
      subject_description: input.referenceParams.subject_description,
    }),
    ...(input.referenceParams.in_this_scene !== undefined && {
      in_this_scene: input.referenceParams.in_this_scene,
    }),
    ...(input.referenceParams.in_this_scene_strength !== undefined && {
      in_this_scene_strength: input.referenceParams.in_this_scene_strength,
    }),
    ...(input.referenceParams.reference_mode !== undefined && {
      reference_mode: input.referenceParams.reference_mode,
    }),
  };

  const baseResolution = input.hiresFixConfig.resolution_mode === 'custom'
    ? ASPECT_RATIO_TO_RESOLUTION[input.hiresFixConfig.custom_aspect_ratio ?? '']
    : input.projectResolution;
  const resolution = scaledResolution(baseResolution, input.hiresFixConfig.resolution_scale);

  return {
    project_id: input.projectId,
    prompts: input.prompts.map(p => {
      const combinedFull = joinPromptParts(
        [input.beforePromptText, p.fullPrompt, effectiveAfterText],
        'batch_comma',
      );
      return {
        id: p.id,
        fullPrompt: combinedFull,
        shortPrompt: p.shortPrompt || toShortPrompt(combinedFull),
      };
    }),
    imagesPerPrompt: input.imagesPerPrompt,
    loras: input.loras,
    shot_id: input.shotId || undefined,
    model_name: input.modelName,
    ...(resolution ? { resolution } : {}),
    execution: input.isLocalGenerationEnabled ? 'local' : 'cloud',
    steps: input.isLocalGenerationEnabled ? input.hiresFixConfig.base_steps : undefined,
    // Reference params - passthrough explicit values only (already snake_case)
    ...referenceParams,
    // Phase 1 params - only for local generation
    ...(input.isLocalGenerationEnabled && {
      lightning_lora_strength_phase_1: input.hiresFixConfig.lightning_lora_strength_phase_1,
    }),
    // Phase 2 / Hires fix params - only for local generation AND when enabled
    ...(input.isLocalGenerationEnabled && input.hiresFixConfig.enabled && {
      hires_scale: input.hiresFixConfig.hires_scale,
      hires_steps: input.hiresFixConfig.hires_steps,
      hires_denoise: input.hiresFixConfig.hires_denoise,
      lightning_lora_strength_phase_2: input.hiresFixConfig.lightning_lora_strength_phase_2,
      // phaseLoraStrengths is UI structure, transform to API format
      additional_loras: Object.fromEntries(
        (input.hiresFixConfig.phaseLoraStrengths ?? []).map(lora => [
          lora.loraPath,
          `${lora.pass1Strength};${lora.pass2Strength}`
        ])
      ),
    }),
  };
}
