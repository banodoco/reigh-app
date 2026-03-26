import type { TaskFamilyResolver } from "./types.ts";
import { characterAnimateResolver } from "./characterAnimate.ts";
import { crossfadeJoinResolver } from "./crossfadeJoin.ts";
import { editVideoOrchestratorResolver } from "./editVideoOrchestrator.ts";
import { imageGenerationResolver } from "./imageGeneration.ts";
import { imageUpscaleResolver } from "./imageUpscale.ts";
import { individualTravelSegmentResolver } from "./individualTravelSegment.ts";
import { joinClipsResolver } from "./joinClips.ts";
import { magicEditResolver } from "./magicEdit.ts";
import { maskedEditResolver } from "./maskedEdit.ts";
import { travelBetweenImagesResolver } from "./travelBetweenImages.ts";
import { videoEnhanceResolver } from "./videoEnhance.ts";
import { zImageTurboI2IResolver } from "./zImageTurboI2I.ts";

const TASK_FAMILY_RESOLVERS: Record<string, TaskFamilyResolver> = {
  image_upscale: imageUpscaleResolver,
  image_generation: imageGenerationResolver,
  individual_travel_segment: individualTravelSegmentResolver,
  join_clips: joinClipsResolver,
  video_enhance: videoEnhanceResolver,
  z_image_turbo_i2i: zImageTurboI2IResolver,
  magic_edit: magicEditResolver,
  masked_edit: maskedEditResolver,
  travel_between_images: travelBetweenImagesResolver,
  crossfade_join: crossfadeJoinResolver,
  edit_video_orchestrator: editVideoOrchestratorResolver,
  character_animate: characterAnimateResolver,
};

export function getTaskFamilyResolver(family: string): TaskFamilyResolver | undefined {
  return TASK_FAMILY_RESOLVERS[family];
}
