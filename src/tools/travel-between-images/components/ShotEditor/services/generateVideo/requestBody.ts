import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '@/shared/types/steerableMotion';
import { stripModeFromPhaseConfig } from './modelPhase';
import type { BuildTravelRequestBodyParams } from './types';
import type { TravelBetweenImagesRequestPayload } from '@/shared/lib/tasks/travelBetweenImages';

export function buildTravelRequestBodyV2(params: BuildTravelRequestBodyParams): TravelBetweenImagesRequestPayload {
  const {
    projectId,
    selectedShot,
    imagePayload,
    pairConfig,
    parentGenerationId,
    actualModelName,
    generationTypeMode,
    motionParams,
    generationParams,
    seedParams,
  } = params;

  const hasValidEnhancedPrompts = pairConfig.enhancedPromptsArray
    .some((prompt) => prompt && prompt.trim().length > 0);

  return {
    project_id: projectId,
    shot_id: selectedShot.id,
    image_urls: imagePayload.absoluteImageUrls,
    ...(imagePayload.imageGenerationIds.length > 0
      && imagePayload.imageGenerationIds.length === imagePayload.absoluteImageUrls.length
      ? { image_generation_ids: imagePayload.imageGenerationIds }
      : {}),
    ...(imagePayload.imageVariantIds.length > 0
      && imagePayload.imageVariantIds.length === imagePayload.absoluteImageUrls.length
      ? { image_variant_ids: imagePayload.imageVariantIds }
      : {}),
    ...(imagePayload.pairShotGenerationIds.length > 0
      ? { pair_shot_generation_ids: imagePayload.pairShotGenerationIds }
      : {}),
    ...(parentGenerationId ? { parent_generation_id: parentGenerationId } : {}),
    base_prompts: pairConfig.basePrompts,
    base_prompt: generationParams.batchVideoPrompt,
    segment_frames: pairConfig.segmentFrames,
    frame_overlap: pairConfig.frameOverlap,
    negative_prompts: pairConfig.negativePrompts,
    ...(hasValidEnhancedPrompts ? { enhanced_prompts: pairConfig.enhancedPromptsArray } : {}),
    ...(pairConfig.pairPhaseConfigsArray.some((config) => config !== null)
      ? { pair_phase_configs: pairConfig.pairPhaseConfigsArray }
      : {}),
    ...(pairConfig.pairLorasArray.some((loras) => loras !== null)
      ? { pair_loras: pairConfig.pairLorasArray }
      : {}),
    ...(pairConfig.pairMotionSettingsArray.some((settings) => settings !== null)
      ? { pair_motion_settings: pairConfig.pairMotionSettingsArray }
      : {}),
    model_name: actualModelName,
    model_type: generationTypeMode,
    seed: seedParams.seed,
    debug: seedParams.debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
    show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
    enhance_prompt: generationParams.enhancePrompt,
    generation_mode: generationParams.generationMode,
    random_seed: seedParams.randomSeed,
    turbo_mode: seedParams.turboMode,
    amount_of_motion: motionParams.amountOfMotion / 100.0,
    advanced_mode: motionParams.useAdvancedMode,
    motion_mode: motionParams.motionMode,
    phase_config: stripModeFromPhaseConfig(motionParams.effectivePhaseConfig),
    regenerate_anchors: false,
    selected_phase_preset_id: motionParams.selectedPhasePresetId || undefined,
    generation_name: generationParams.variantNameParam.trim() || undefined,
    ...(generationParams.textBeforePrompts ? { text_before_prompts: generationParams.textBeforePrompts } : {}),
    ...(generationParams.textAfterPrompts ? { text_after_prompts: generationParams.textAfterPrompts } : {}),
    independent_segments: true,
    chain_segments: false,
  };
}
