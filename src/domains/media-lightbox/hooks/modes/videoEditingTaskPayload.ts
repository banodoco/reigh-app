import type { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { generateRunId } from '@/shared/lib/taskCreation';
import { capContextFrameCountForRanges } from '@/shared/lib/video/replaceFrameRanges';
import { resolveAspectRatioResolutionTuple } from '@/shared/lib/video/resolveAspectRatioResolutionTuple';
import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import type { PortionFrameRange } from './useVideoEditingSelections';

interface TaskLora {
  path: string;
  strength: number;
}

interface BuildVideoEditOrchestratorDetailsInput {
  media: GenerationRow;
  videoUrl: string;
  videoDuration: number;
  fps: number;
  portionFrameRanges: PortionFrameRange[];
  projectAspectRatio?: string;
  requestedContextFrameCount: number;
  globalGapFrameCount: number;
  globalPrompt: string;
  negativePrompt: string;
  enhancePrompt: boolean;
  priority: number;
  model?: string;
  seed: number;
  numInferenceSteps: number;
  guidanceScale: number;
  lorasForTask: TaskLora[];
}

function buildPhaseConfig() {
  return {
    phases: [
      {
        phase: 1,
        guidance_scale: 3,
        loras: [{
          url: 'https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors',
          multiplier: '0.75',
        }],
      },
      {
        phase: 2,
        guidance_scale: 1,
        loras: [{
          url: 'https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors',
          multiplier: '1.0',
        }],
      },
      {
        phase: 3,
        guidance_scale: 1,
        loras: [{
          url: 'https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors',
          multiplier: '1.0',
        }],
      },
    ],
    flow_shift: 5,
    num_phases: 3,
    sample_solver: 'euler',
    steps_per_phase: [2, 2, 2],
    model_switch_phase: 2,
  };
}

export function buildVideoEditOrchestratorDetails({
  media,
  videoUrl,
  videoDuration,
  fps,
  portionFrameRanges,
  projectAspectRatio,
  requestedContextFrameCount,
  globalGapFrameCount,
  globalPrompt,
  negativePrompt,
  enhancePrompt,
  priority,
  model,
  seed,
  numInferenceSteps,
  guidanceScale,
  lorasForTask,
}: BuildVideoEditOrchestratorDetailsInput): Record<string, unknown> {
  const totalFrames = Math.round(videoDuration * fps);
  const contextFrameCount = capContextFrameCountForRanges({
    contextFrameCount: requestedContextFrameCount,
    totalFrames,
    frameRanges: portionFrameRanges,
  });
  const resolutionTuple = resolveAspectRatioResolutionTuple(projectAspectRatio);

  const orchestratorDetails: Record<string, unknown> = {
    run_id: generateRunId(),
    priority,
    tool_type: TOOL_IDS.EDIT_VIDEO,

    source_video_url: videoUrl,
    source_video_fps: fps,
    source_video_total_frames: totalFrames,

    portions_to_regenerate: portionFrameRanges,

    model: model || VACE_GENERATION_DEFAULTS.model,
    resolution: resolutionTuple || [902, 508],
    seed,

    context_frame_count: contextFrameCount,
    gap_frame_count: globalGapFrameCount,
    replace_mode: true,
    keep_bridging_images: false,

    prompt: globalPrompt,
    negative_prompt: negativePrompt,
    enhance_prompt: enhancePrompt,

    num_inference_steps: numInferenceSteps,
    guidance_scale: guidanceScale,
    phase_config: buildPhaseConfig(),

    parent_generation_id: getGenerationId(media),
  };

  if (lorasForTask.length > 0) {
    orchestratorDetails.loras = lorasForTask;
  }

  return orchestratorDetails;
}
