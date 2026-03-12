import {
  generateTaskId,
  generateRunId,
  validateRequiredFields,
  TaskValidationError,
  validateNonEmptyString,
  mapPathLorasToStrengthRecord,
} from "../taskCreation";
import type { TaskCreationResult } from "../taskCreation";
import { PhaseConfig } from '@/shared/types/phaseConfig';
import { joinClipsSettings } from '@/shared/lib/joinClips/defaults';
import { camelToSnakeKeys } from '@/shared/lib/utils/caseConversion';
import type { PathLoraConfig } from '@/domains/lora/types/lora';
import { buildPhaseConfigWithLoras } from '@/shared/lib/vaceDefaults';
import { buildJoinClipsFamilyContract } from './core/taskFamilyContracts';
import { composeTaskFamilyPayload } from './taskPayloadContract';
import { assignMappedPayloadFields } from '../taskCreation/payloadMapping';
import { composeTaskRequest } from './core/taskRequestComposer';
import { runTaskCreationPipeline } from './core/taskCreatorPipeline';

// ============================================================================

/**
 * Describes an individual clip that will participate in the join workflow.
 */
export interface JoinClipDescriptor {
  url: string;
  name?: string;
}

/**
 * Describes per-join override settings between two adjacent clips
 */
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

/**
 * Frame-accurate portion selection for video editing.
 */
interface PortionToRegenerate {
  start_frame: number;
  end_frame: number;
  start_time_seconds: number;
  end_time_seconds: number;
  frame_count: number;
}

interface JoinClipsModernClipSource {
  kind: 'clips';
  clips: JoinClipDescriptor[];
}

export type JoinClipsClipSource = JoinClipsModernClipSource;

export interface JoinClipsVideoEditConfig {
  source_video_url: string;
  source_video_fps?: number;
  source_video_duration?: number;
  source_video_total_frames?: number;
  portions_to_regenerate?: PortionToRegenerate[];
}

interface JoinClipsSharedTaskParams {
  project_id: string;
  shot_id?: string; // Associate task with a shot for "Visit Shot" button in TasksPane
  per_join_settings?: JoinClipsPerJoinSettings[];
  run_id?: string;
  prompt?: string;
  context_frame_count?: number;
  gap_frame_count?: number;
  replace_mode?: boolean; // Replace frames (true) or generate new frames (false)
  keep_bridging_images?: boolean; // Whether to keep anchor images in the bridge
  enhance_prompt?: boolean; // AI enhancement of prompts
  model?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  resolution?: [number, number];
  fps?: number;
  negative_prompt?: string;
  priority?: number;
  loras?: PathLoraConfig[]; // LoRA models to apply (for basic mode)
  phase_config?: PhaseConfig; // Custom phase config (for advanced mode - overrides loras)
  motion_mode?: 'basic' | 'advanced'; // Motion control mode for UI state restoration
  selected_phase_preset_id?: string | null; // Selected preset ID for UI state restoration
  parent_generation_id?: string;
  tool_type?: string; // Tool type identifier for filtering results
  use_input_video_resolution?: boolean; // Use first input video's resolution instead of project resolution
  use_input_video_fps?: boolean; // Use first input video's FPS instead of downsampling to 16fps (default: false)
  vid2vid_init_strength?: number; // Adds noise to input video frames (0 = disabled, higher = more noise/creative freedom)
  loop_first_clip?: boolean; // Loop first clip - use first clip as both start and end
  based_on?: string; // Source generation ID for variant creation (when looping from "Add to Join")
  audio_url?: string;
}

export interface CanonicalJoinClipsTaskInput extends JoinClipsSharedTaskParams {
  mode: 'multi_clip' | 'video_edit';
  clip_source: JoinClipsClipSource;
  video_edit?: JoinClipsVideoEditConfig;
}

/**
 * Task defaults in snake_case, auto-derived from the tool's settings.ts.
 * joinClipsSettings.defaults already spreads VACE_GENERATION_DEFAULTS,
 * so per-tool overrides (e.g., guidanceScale: 5.0) flow through automatically.
 */
const TASK_DEFAULTS = camelToSnakeKeys(joinClipsSettings.defaults);

type JoinMode = 'multi_clip_join' | 'video_edit_join';

interface NormalizedJoinClipsParams {
  clipSequence: JoinClipDescriptor[];
  clipSourceKind: JoinClipsClipSource['kind'];
  joinMode: JoinMode;
  videoEdit?: JoinClipsVideoEditConfig;
}

const PER_JOIN_OVERRIDE_KEYS = [
  'prompt',
  'gap_frame_count',
  'context_frame_count',
  'replace_mode',
  'model',
  'num_inference_steps',
  'guidance_scale',
  'seed',
  'negative_prompt',
  'priority',
  'resolution',
  'fps',
] as const satisfies readonly (keyof JoinClipsPerJoinSettings)[];

function buildJoinOverrideRecord(
  override?: JoinClipsPerJoinSettings,
): Record<string, unknown> {
  if (!override) {
    return {};
  }

  const joinSettings: Record<string, unknown> = {};
  for (const key of PER_JOIN_OVERRIDE_KEYS) {
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

/**
 * Build phase config for join clips (always uses VACE since we're joining existing videos).
 * User-selected LoRAs are added to every phase at their specified strength.
 * 
 * @param userLoras - User-selected LoRAs to add to every phase
 * @returns PhaseConfig for VACE model
 */
function buildJoinClipsPhaseConfig(
  userLoras: PathLoraConfig[] = []
): PhaseConfig {
  return buildPhaseConfigWithLoras(userLoras);
}

/**
 * Builds the ordered clip sequence from the provided parameters.
 */
function buildClipSequenceFromSource(source: JoinClipsClipSource): JoinClipDescriptor[] {
  return source.clips.map((clip) => ({
    url: clip.url,
    ...(clip.name ? { name: clip.name } : {}),
  }));
}

/**
 * Validates join clips task parameters and returns the normalized clip sequence
 * 
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function normalizeJoinClipsParams(params: CanonicalJoinClipsTaskInput): NormalizedJoinClipsParams {
  validateRequiredFields(params, [
    'project_id'
  ]);

  const clipSource = params.clip_source;
  const clipSequence = buildClipSequenceFromSource(clipSource);

  if (clipSequence.length < 2) {
    throw new TaskValidationError("At least two clips are required to create a join", 'clips');
  }

  clipSequence.forEach((clip, index) => {
    try {
      validateNonEmptyString(clip.url, `clips[${index}]`, `Clip ${index + 1} URL`);
    } catch {
      throw new TaskValidationError(`Clip at position ${index} is missing a URL`, 'clips');
    }
  });

  const joinsCount = clipSequence.length - 1;

  if (params.per_join_settings && params.per_join_settings.length > joinsCount) {
    throw new TaskValidationError(
      "per_join_settings length cannot exceed the number of joins",
      'per_join_settings'
    );
  }

  const videoEdit = params.video_edit;
  if (params.mode === 'video_edit' && !videoEdit) {
    throw new TaskValidationError(
      "video_edit config is required when mode is video_edit",
      'mode',
    );
  }
  if (videoEdit && !videoEdit.source_video_url) {
    throw new TaskValidationError(
      "video_edit.source_video_url is required when video_edit config is provided",
      'video_edit',
    );
  }
  if (params.mode !== 'video_edit' && videoEdit) {
    throw new TaskValidationError(
      "video_edit config can only be provided when mode is video_edit",
      'mode',
    );
  }
  if (params.mode === 'multi_clip' && clipSource.kind !== 'clips') {
    throw new TaskValidationError(
      "clip_source.kind must be clips when mode is multi_clip",
      'mode',
    );
  }

  const joinMode: JoinMode = params.mode === 'video_edit'
    ? 'video_edit_join'
    : 'multi_clip_join';

  return {
    clipSequence,
    clipSourceKind: clipSource.kind,
    joinMode,
    videoEdit,
  };
}

/**
 * Builds the orchestrator payload for join clips
 * 
 * @param params - Raw join clips parameters
 * @param clipSequence - Normalized list of clips in order
 * @param runId - Generated run ID
 * @param orchestratorTaskId - Generated orchestrator task ID
 * @returns Processed orchestrator payload
 */
function buildJoinClipsPayload(
  params: CanonicalJoinClipsTaskInput,
  normalized: NormalizedJoinClipsParams,
  runId: string,
  orchestratorTaskId: string
): Record<string, unknown> {
  const clipSequence = normalized.clipSequence;
  // Use provided phase config (advanced mode) or build from LoRAs (basic mode)
  const phaseConfig = params.phase_config || buildJoinClipsPhaseConfig(params.loras || []);
  
  const orchestratorDetails: Record<string, unknown> = {
    orchestrator_task_id: orchestratorTaskId,
    clip_list: clipSequence.map(clip => ({
      url: clip.url,
      ...(clip.name ? { name: clip.name } : {}),
    })),
    run_id: runId,
    shot_id: params.shot_id ?? undefined, // For "Visit Shot" button in TasksPane
    prompt: params.prompt ?? TASK_DEFAULTS.prompt,
    gap_frame_count: params.gap_frame_count ?? TASK_DEFAULTS.gap_frame_count,
    context_frame_count: params.context_frame_count ?? TASK_DEFAULTS.context_frame_count,
    replace_mode: params.replace_mode ?? TASK_DEFAULTS.replace_mode,
    keep_bridging_images: params.keep_bridging_images, // Optional, defaults to undefined (backend handles default)
    enhance_prompt: params.enhance_prompt ?? TASK_DEFAULTS.enhance_prompt,
    model: params.model ?? TASK_DEFAULTS.model,
    num_inference_steps: params.num_inference_steps ?? TASK_DEFAULTS.num_inference_steps,
    guidance_scale: params.guidance_scale ?? TASK_DEFAULTS.guidance_scale,
    seed: params.seed ?? TASK_DEFAULTS.seed,
    negative_prompt: params.negative_prompt ?? TASK_DEFAULTS.negative_prompt,
    priority: params.priority ?? TASK_DEFAULTS.priority,
    parent_generation_id: params.parent_generation_id,
    // UNIFIED: Always include phase_config and advanced_mode for consistent backend processing
    phase_config: phaseConfig,
    advanced_mode: true,
    // Motion settings for UI state restoration
    motion_mode: params.motion_mode ?? TASK_DEFAULTS.motion_mode,
    selected_phase_preset_id: params.selected_phase_preset_id ?? TASK_DEFAULTS.selected_phase_preset_id,
  };

  assignMappedPayloadFields(orchestratorDetails, params, [
    { from: 'resolution' },
    { from: 'fps' },
    { from: 'use_input_video_resolution' },
    { from: 'use_input_video_fps' },
    { from: 'audio_url' },
  ]);

  assignMappedPayloadFields(orchestratorDetails, params, [
    {
      from: 'vid2vid_init_strength',
      include: (value) => typeof value === 'number' && value > 0,
    },
  ]);

  if (params.loop_first_clip) {
    orchestratorDetails.loop_first_clip = true;
  }

  // Pass based_on for variant creation when looping a clip from "Add to Join"
  if (params.based_on) {
    orchestratorDetails.based_on = params.based_on;
  }

  // Keep additional_loras for backward compatibility, but LoRAs are now primarily in phase_config
  if (params.loras && params.loras.length > 0) {
    orchestratorDetails.additional_loras = mapPathLorasToStrengthRecord(params.loras);
  }
  
  // Video edit mode - for regenerating portions of a single video
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
      const joinSettings = buildJoinOverrideRecord(params.per_join_settings?.[index]);

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

  const resolutionDisplay = params.resolution
    ? `${params.resolution[0]}x${params.resolution[1]}`
    : undefined;

  const joinMode = normalized.joinMode;

  const perJoinOverridesCount = params.per_join_settings?.filter((override) =>
    !!override && Object.keys(override).length > 0
  ).length ?? 0;

  const familyContract = buildJoinClipsFamilyContract({
    mode: joinMode,
    runId,
    clipUrls: clipSequence.map((clip) => clip.url),
    overridesCount: perJoinOverridesCount,
    hasAudio: Boolean(params.audio_url),
  });

  const payload = composeTaskFamilyPayload({
    taskFamily: 'join_clips',
    orchestratorDetails,
    orchestrationInput: {
      taskFamily: 'join_clips',
      orchestratorTaskId,
      runId,
      parentGenerationId: params.parent_generation_id,
      shotId: params.shot_id,
      basedOn: params.based_on,
      generationRouting: 'orchestrator',
      siblingLookup: 'run_id',
    },
    taskViewInput: {
      inputImages: clipSequence.map((clip) => clip.url),
      prompt: params.prompt,
      negativePrompt: params.negative_prompt,
      modelName: params.model,
      resolution: resolutionDisplay,
    },
    familyContract,
  });

  return {
    ...payload,
    parent_generation_id: params.parent_generation_id,
    // Only include tool_type if explicitly passed (Join Clips page passes it, ShotEditor doesn't)
    ...(params.tool_type && { tool_type: params.tool_type }),
  };
}

/**
 * Creates a join clips task using the unified approach
 * 
 * @param params - Join clips task parameters
 * @returns Promise resolving to the created task
 */
export async function createCanonicalJoinClipsTask(
  params: CanonicalJoinClipsTaskInput,
): Promise<TaskCreationResult> {
  return runTaskCreationPipeline({
    params,
    context: 'JoinClips',
    buildTaskRequest: (requestParams) => {
      const normalized = normalizeJoinClipsParams(requestParams);
      const orchestratorTaskId = generateTaskId("join_clips_orchestrator");
      const runId = requestParams.run_id ?? generateRunId();
      const orchestratorPayload = buildJoinClipsPayload(
        requestParams,
        normalized,
        runId,
        orchestratorTaskId,
      );

      return composeTaskRequest({
        source: requestParams,
        taskType: 'join_clips_orchestrator',
        params: orchestratorPayload,
      });
    },
  });
}

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
