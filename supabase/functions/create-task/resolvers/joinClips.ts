import type { ResolverResult, TaskFamilyResolver, TaskInsertObject } from "./types.ts";
import { generateRunId, generateTaskId } from "./shared/ids.ts";
import { mapPathLorasToStrengthRecord } from "./shared/loras.ts";
import {
  buildJoinClipsFamilyContract,
  composeTaskFamilyPayload,
} from "./shared/taskContracts.ts";
import {
  TaskValidationError,
  validateNonEmptyString,
  validateRequiredFields,
} from "./shared/validation.ts";

interface PathLoraConfig {
  path: string;
  strength: number;
}

interface PhaseLoraConfig {
  url: string;
  multiplier: string;
}

interface PhaseSettings {
  phase: number;
  guidance_scale: number;
  loras: PhaseLoraConfig[];
}

interface PhaseConfig {
  num_phases: number;
  steps_per_phase: number[];
  flow_shift: number;
  sample_solver: string;
  model_switch_phase: number;
  phases: PhaseSettings[];
  mode?: "i2v" | "vace";
}

interface JoinClipDescriptor {
  url: string;
  name?: string;
}

interface JoinClipsPerJoinSettings {
  prompt?: string;
  gap_frame_count?: number;
  context_frame_count?: number;
  replace_mode?: boolean;
  model?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  negative_prompt?: string;
  priority?: number;
  resolution?: [number, number];
  fps?: number;
  loras?: PathLoraConfig[];
}

interface JoinClipsVideoEditConfig {
  source_video_url: string;
  source_video_fps?: number;
  source_video_duration?: number;
  source_video_total_frames?: number;
  portions_to_regenerate?: Array<Record<string, unknown>>;
}

interface CanonicalJoinClipsTaskInput {
  shot_id?: string;
  per_join_settings?: JoinClipsPerJoinSettings[];
  run_id?: string;
  prompt?: string;
  context_frame_count?: number;
  gap_frame_count?: number;
  replace_mode?: boolean;
  keep_bridging_images?: boolean;
  enhance_prompt?: boolean;
  model?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  resolution?: [number, number];
  fps?: number;
  negative_prompt?: string;
  priority?: number;
  loras?: PathLoraConfig[];
  phase_config?: PhaseConfig;
  motion_mode?: "basic" | "advanced";
  selected_phase_preset_id?: string | null;
  parent_generation_id?: string;
  tool_type?: string;
  use_input_video_resolution?: boolean;
  use_input_video_fps?: boolean;
  vid2vid_init_strength?: number;
  loop_first_clip?: boolean;
  based_on?: string;
  audio_url?: string;
  mode: "multi_clip" | "video_edit";
  clip_source: {
    kind: "clips";
    clips: JoinClipDescriptor[];
  };
  video_edit?: JoinClipsVideoEditConfig;
}

interface NormalizedJoinClipsParams {
  clipSequence: JoinClipDescriptor[];
  joinMode: "multi_clip_join" | "video_edit_join";
  videoEdit?: JoinClipsVideoEditConfig;
}

const TASK_DEFAULTS = {
  prompt: "",
  gap_frame_count: 23,
  context_frame_count: 15,
  replace_mode: true,
  enhance_prompt: false,
  model: "wan_2_2_vace_lightning_baseline_2_2_2",
  num_inference_steps: 6,
  guidance_scale: 3.0,
  seed: -1,
  negative_prompt: "",
  priority: 0,
  motion_mode: "basic",
  selected_phase_preset_id: "__builtin_vace_default__",
} as const;

const DEFAULT_VACE_PHASE_CONFIG: PhaseConfig = {
  num_phases: 3,
  steps_per_phase: [2, 2, 5],
  flow_shift: 5.0,
  sample_solver: "euler",
  model_switch_phase: 2,
  mode: "vace",
  phases: [
    {
      phase: 1,
      guidance_scale: 3.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
          multiplier: "0.75",
        },
        {
          url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors",
          multiplier: "1.25",
        },
      ],
    },
    {
      phase: 2,
      guidance_scale: 1.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
          multiplier: "1.0",
        },
        {
          url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors",
          multiplier: "1.25",
        },
      ],
    },
    {
      phase: 3,
      guidance_scale: 1.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors",
          multiplier: "1.0",
        },
        {
          url: "https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors",
          multiplier: "1.25",
        },
      ],
    },
  ],
};

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

function buildPhaseConfigWithLoras(userLoras: PathLoraConfig[] = []): PhaseConfig {
  if (userLoras.length === 0) {
    return DEFAULT_VACE_PHASE_CONFIG;
  }

  const additionalLoras = userLoras
    .filter((lora) => lora.path)
    .map((lora) => ({
      url: lora.path,
      multiplier: lora.strength.toFixed(2),
    }));

  return {
    ...DEFAULT_VACE_PHASE_CONFIG,
    phases: DEFAULT_VACE_PHASE_CONFIG.phases.map((phase) => ({
      ...phase,
      loras: [...phase.loras, ...additionalLoras],
    })),
  };
}

function buildJoinOverrideRecord(override?: JoinClipsPerJoinSettings): Record<string, unknown> {
  if (!override) return {};

  const joinSettings: Record<string, unknown> = {};
  const keys: Array<keyof JoinClipsPerJoinSettings> = [
    "prompt",
    "gap_frame_count",
    "context_frame_count",
    "replace_mode",
    "model",
    "num_inference_steps",
    "guidance_scale",
    "seed",
    "negative_prompt",
    "priority",
    "resolution",
    "fps",
  ];

  for (const key of keys) {
    const value = override[key];
    if (value !== undefined) {
      joinSettings[key] = value;
    }
  }

  if (override.loras && override.loras.length > 0) {
    joinSettings.additional_loras = mapPathLorasToStrengthRecord(override.loras);
  }

  return joinSettings;
}

function normalizeJoinClipsParams(input: CanonicalJoinClipsTaskInput): NormalizedJoinClipsParams {
  validateRequiredFields(input, ["clip_source"]);

  const clipSequence = input.clip_source.clips.map((clip) => ({
    url: clip.url,
    ...(clip.name ? { name: clip.name } : {}),
  }));

  if (clipSequence.length < 2) {
    throw new TaskValidationError("At least two clips are required to create a join", "clips");
  }

  clipSequence.forEach((clip, index) => {
    validateNonEmptyString(clip.url, `clips[${index}]`, `Clip ${index + 1} URL`);
  });

  const joinsCount = clipSequence.length - 1;
  if (input.per_join_settings && input.per_join_settings.length > joinsCount) {
    throw new TaskValidationError(
      "per_join_settings length cannot exceed the number of joins",
      "per_join_settings",
    );
  }

  if (input.mode === "video_edit" && !input.video_edit) {
    throw new TaskValidationError("video_edit config is required when mode is video_edit", "mode");
  }

  if (input.video_edit && !input.video_edit.source_video_url) {
    throw new TaskValidationError(
      "video_edit.source_video_url is required when video_edit config is provided",
      "video_edit",
    );
  }

  return {
    clipSequence,
    joinMode: input.mode === "video_edit" ? "video_edit_join" : "multi_clip_join",
    videoEdit: input.video_edit,
  };
}

function buildJoinClipsPayload(
  input: CanonicalJoinClipsTaskInput,
  normalized: NormalizedJoinClipsParams,
  runId: string,
  orchestratorTaskId: string,
): Record<string, unknown> {
  const clipSequence = normalized.clipSequence;
  const phaseConfig = input.phase_config || buildPhaseConfigWithLoras(input.loras || []);

  const orchestratorDetails: Record<string, unknown> = {
    orchestrator_task_id: orchestratorTaskId,
    clip_list: clipSequence.map((clip) => ({
      url: clip.url,
      ...(clip.name ? { name: clip.name } : {}),
    })),
    run_id: runId,
    shot_id: input.shot_id ?? undefined,
    prompt: input.prompt ?? TASK_DEFAULTS.prompt,
    gap_frame_count: input.gap_frame_count ?? TASK_DEFAULTS.gap_frame_count,
    context_frame_count: input.context_frame_count ?? TASK_DEFAULTS.context_frame_count,
    replace_mode: input.replace_mode ?? TASK_DEFAULTS.replace_mode,
    keep_bridging_images: input.keep_bridging_images,
    enhance_prompt: input.enhance_prompt ?? TASK_DEFAULTS.enhance_prompt,
    model: input.model ?? TASK_DEFAULTS.model,
    num_inference_steps: input.num_inference_steps ?? TASK_DEFAULTS.num_inference_steps,
    guidance_scale: input.guidance_scale ?? TASK_DEFAULTS.guidance_scale,
    seed: input.seed ?? TASK_DEFAULTS.seed,
    negative_prompt: input.negative_prompt ?? TASK_DEFAULTS.negative_prompt,
    priority: input.priority ?? TASK_DEFAULTS.priority,
    parent_generation_id: input.parent_generation_id,
    phase_config: phaseConfig,
    advanced_mode: true,
    motion_mode: input.motion_mode ?? TASK_DEFAULTS.motion_mode,
    selected_phase_preset_id: input.selected_phase_preset_id ?? TASK_DEFAULTS.selected_phase_preset_id,
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.fps ? { fps: input.fps } : {}),
    ...(input.use_input_video_resolution !== undefined
      ? { use_input_video_resolution: input.use_input_video_resolution }
      : {}),
    ...(input.use_input_video_fps !== undefined ? { use_input_video_fps: input.use_input_video_fps } : {}),
    ...(input.audio_url ? { audio_url: input.audio_url } : {}),
    ...(typeof input.vid2vid_init_strength === "number" && input.vid2vid_init_strength > 0
      ? { vid2vid_init_strength: input.vid2vid_init_strength }
      : {}),
  };

  if (input.loop_first_clip) {
    orchestratorDetails.loop_first_clip = true;
  }
  if (input.based_on) {
    orchestratorDetails.based_on = input.based_on;
  }
  if (input.loras && input.loras.length > 0) {
    orchestratorDetails.additional_loras = mapPathLorasToStrengthRecord(input.loras);
  }
  if (normalized.videoEdit) {
    orchestratorDetails.video_edit_mode = true;
    orchestratorDetails.source_video_url = normalized.videoEdit.source_video_url;
    orchestratorDetails.source_video_fps = normalized.videoEdit.source_video_fps;
    orchestratorDetails.source_video_duration = normalized.videoEdit.source_video_duration;
    orchestratorDetails.source_video_total_frames = normalized.videoEdit.source_video_total_frames;
    orchestratorDetails.portions_to_regenerate = normalized.videoEdit.portions_to_regenerate;
  }

  const totalJoins = Math.max(clipSequence.length - 1, 0);
  if (totalJoins > 0) {
    const perJoinOverrides: Record<string, unknown>[] = [];
    let hasOverrides = false;
    for (let index = 0; index < totalJoins; index++) {
      const joinSettings = buildJoinOverrideRecord(input.per_join_settings?.[index]);
      if (Object.keys(joinSettings).length > 0) {
        hasOverrides = true;
        perJoinOverrides.push(joinSettings);
      } else {
        perJoinOverrides.push({});
      }
    }
    if (hasOverrides) {
      orchestratorDetails.per_join_settings = perJoinOverrides;
    }
  }

  const resolutionDisplay = input.resolution
    ? `${input.resolution[0]}x${input.resolution[1]}`
    : undefined;
  const overridesCount = input.per_join_settings?.filter((override) =>
    !!override && Object.keys(override).length > 0
  ).length ?? 0;

  const payload = composeTaskFamilyPayload({
    taskFamily: "join_clips",
    orchestratorDetails,
    orchestrationInput: {
      taskFamily: "join_clips",
      orchestratorTaskId,
      runId,
      parentGenerationId: input.parent_generation_id,
      shotId: input.shot_id,
      basedOn: input.based_on,
      generationRouting: "orchestrator",
      siblingLookup: "run_id",
    },
    taskViewInput: {
      inputImages: clipSequence.map((clip) => clip.url),
      prompt: input.prompt,
      negativePrompt: input.negative_prompt,
      modelName: input.model,
      resolution: resolutionDisplay,
    },
    familyContract: buildJoinClipsFamilyContract({
      mode: normalized.joinMode,
      runId,
      clipUrls: clipSequence.map((clip) => clip.url),
      overridesCount,
      hasAudio: Boolean(input.audio_url),
    }),
  });

  return {
    ...payload,
    parent_generation_id: input.parent_generation_id,
    ...(input.tool_type ? { tool_type: input.tool_type } : {}),
  };
}

export const joinClipsResolver: TaskFamilyResolver = (request, context): ResolverResult => {
  const input = request.input as unknown as CanonicalJoinClipsTaskInput;
  const normalized = normalizeJoinClipsParams(input);
  const orchestratorTaskId = generateTaskId("join_clips_orchestrator");
  const runId = input.run_id ?? generateRunId();

  return {
    tasks: [
      buildQueuedTask(
        context.projectId,
        "join_clips_orchestrator",
        buildJoinClipsPayload(input, normalized, runId, orchestratorTaskId),
      ),
    ],
  };
};
