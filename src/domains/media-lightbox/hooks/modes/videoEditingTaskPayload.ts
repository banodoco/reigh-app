import type { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { generateRunId } from '@/shared/lib/taskCreation';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
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

interface FrameRange {
  start_frame: number;
  end_frame: number;
}

function calculateMinKeeperFrames(totalFrames: number, sortedPortions: FrameRange[]): number {
  let minKeeperFrames = totalFrames;

  if (sortedPortions.length > 0) {
    const firstKeeperLength = sortedPortions[0].start_frame;
    if (firstKeeperLength > 0) {
      minKeeperFrames = Math.min(minKeeperFrames, firstKeeperLength);
    }
  }

  for (let i = 0; i < sortedPortions.length - 1; i++) {
    const keeperLength = sortedPortions[i + 1].start_frame - sortedPortions[i].end_frame;
    if (keeperLength > 0) {
      minKeeperFrames = Math.min(minKeeperFrames, keeperLength);
    }
  }

  if (sortedPortions.length > 0) {
    const lastKeeperLength = totalFrames - sortedPortions[sortedPortions.length - 1].end_frame;
    if (lastKeeperLength > 0) {
      minKeeperFrames = Math.min(minKeeperFrames, lastKeeperLength);
    }
  }

  return minKeeperFrames;
}

function resolveResolutionTuple(projectAspectRatio?: string): [number, number] | undefined {
  if (!projectAspectRatio) return undefined;

  const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
  if (!resolutionStr) return undefined;

  const [width, height] = resolutionStr.split('x').map(Number);
  if (!width || !height) return undefined;

  return [width, height];
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
  const sortedPortions = [...portionFrameRanges].sort((a, b) => a.start_frame - b.start_frame);
  const minKeeperFrames = calculateMinKeeperFrames(totalFrames, sortedPortions);
  const safeMaxContextFrames = Math.max(1, minKeeperFrames - 1);
  const contextFrameCount = Math.min(requestedContextFrameCount, safeMaxContextFrames);
  const resolutionTuple = resolveResolutionTuple(projectAspectRatio);

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
