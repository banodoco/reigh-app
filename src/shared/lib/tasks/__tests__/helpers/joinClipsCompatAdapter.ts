import { TaskValidationError } from '../../../taskCreation';
import type { TaskCreationResult } from '../../../taskCreation';
import type {
  CanonicalJoinClipsTaskInput,
  JoinClipDescriptor,
  JoinClipsClipSource,
  JoinClipsVideoEditConfig,
} from '../../joinClips';
import { createCanonicalJoinClipsTask } from '../../joinClips';
import {
  getDeprecationPolicy,
  isPastRemovalTarget,
} from '@/shared/lib/governance/deprecationPolicy';

const joinClipsCompatPolicy = getDeprecationPolicy('join_clips_compat');
const JOIN_CLIPS_COMPAT_REMOVAL_TARGET = joinClipsCompatPolicy.removeBy;
const JOIN_CLIPS_COMPAT_OWNER = joinClipsCompatPolicy.owner;

export type JoinClipsCompatLegacySource =
  | 'legacy_clip_paths'
  | 'legacy_video_edit_mode'
  | 'legacy_video_edit_payload';

export interface JoinClipsCompatUseEvent {
  mode: CanonicalJoinClipsTaskInput['mode'];
  clip_source_kind: JoinClipsClipSource['kind'];
  legacy_sources: JoinClipsCompatLegacySource[];
  owner: string;
  removal_target: string;
}

interface JoinClipsTaskCompatParams {
  project_id: string;
  mode?: CanonicalJoinClipsTaskInput['mode'] | 'legacy';
  clip_source?: JoinClipsClipSource;
  video_edit?: JoinClipsVideoEditConfig;
  shot_id?: string;
  clips?: JoinClipDescriptor[];
  per_join_settings?: {
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
    loras?: { path: string; strength: number }[];
  }[];
  run_id?: string;
  starting_video_path?: string;
  ending_video_path?: string;
  intermediate_video_paths?: string[];
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
  loras?: { path: string; strength: number }[];
  phase_config?: unknown;
  motion_mode?: 'basic' | 'advanced';
  selected_phase_preset_id?: string | null;
  parent_generation_id?: string;
  tool_type?: string;
  use_input_video_resolution?: boolean;
  use_input_video_fps?: boolean;
  vid2vid_init_strength?: number;
  loop_first_clip?: boolean;
  based_on?: string;
  audio_url?: string;
  video_edit_mode?: boolean;
  source_video_url?: string;
  source_video_fps?: number;
  source_video_duration?: number;
  source_video_total_frames?: number;
  portions_to_regenerate?: Array<{
    start_frame: number;
    end_frame: number;
    start_time_seconds: number;
    end_time_seconds: number;
    frame_count: number;
  }>;
}

interface LegacyJoinClipsPathSource {
  kind: 'legacy_paths';
  starting_video_path?: string;
  ending_video_path?: string;
  intermediate_video_paths?: string[];
}

function hasLegacyPathFields(params: JoinClipsTaskCompatParams): boolean {
  return Boolean(resolveLegacyClipSource(params));
}

function hasLegacyVideoEditPayloadFields(params: JoinClipsTaskCompatParams): boolean {
  return Boolean(
    params.source_video_url
    || params.source_video_fps !== undefined
    || params.source_video_duration !== undefined
    || params.source_video_total_frames !== undefined
    || (params.portions_to_regenerate && params.portions_to_regenerate.length > 0),
  );
}

function validateCompatModeBoundaries(params: JoinClipsTaskCompatParams): void {
  if (params.mode === 'legacy') {
    throw new TaskValidationError("mode='legacy' is no longer supported", 'mode');
  }

  if (!params.video_edit_mode && hasLegacyVideoEditPayloadFields(params)) {
    throw new TaskValidationError(
      "Legacy source_* video edit fields require video_edit_mode=true (or migrate to canonical video_edit config)",
      'video_edit_mode',
    );
  }
}

function assertSingleClipSourceMode(params: JoinClipsTaskCompatParams): void {
  const hasCanonicalClipSource = Boolean(params.clip_source);
  const hasCompatClips = Boolean(params.clips && params.clips.length > 0);
  const hasLegacyPaths = Boolean(resolveLegacyClipSource(params));
  if (hasCanonicalClipSource && (hasCompatClips || hasLegacyPaths)) {
    throw new TaskValidationError('Provide exactly one clip-source mode', 'clip_source');
  }
}

function resolveLegacyClipSource(params: JoinClipsTaskCompatParams): LegacyJoinClipsPathSource | undefined {
  if (
    !params.starting_video_path
    && !params.ending_video_path
    && (!params.intermediate_video_paths || params.intermediate_video_paths.length === 0)
  ) {
    return undefined;
  }

  return {
    kind: 'legacy_paths',
    starting_video_path: params.starting_video_path,
    ending_video_path: params.ending_video_path,
    intermediate_video_paths: params.intermediate_video_paths,
  };
}

function toCanonicalClipSourceFromLegacy(
  source: LegacyJoinClipsPathSource,
): JoinClipsClipSource {
  const clips: JoinClipDescriptor[] = [];

  if (source.starting_video_path) {
    clips.push({ url: source.starting_video_path });
  }

  if (source.intermediate_video_paths?.length) {
    clips.push(...source.intermediate_video_paths.map((url) => ({ url })));
  }

  if (source.ending_video_path) {
    clips.push({ url: source.ending_video_path });
  }

  return {
    kind: 'clips',
    clips,
  };
}

function resolveClipSource(
  params: JoinClipsTaskCompatParams,
): { clipSource: JoinClipsClipSource; usedLegacyPathSource: boolean } | undefined {
  if (params.clip_source) {
    return {
      clipSource: params.clip_source,
      usedLegacyPathSource: false,
    };
  }

  if (params.clips && params.clips.length > 0) {
    return {
      clipSource: {
        kind: 'clips',
        clips: params.clips,
      },
      usedLegacyPathSource: false,
    };
  }

  const legacySource = resolveLegacyClipSource(params);
  if (!legacySource) {
    return undefined;
  }

  return {
    clipSource: toCanonicalClipSourceFromLegacy(legacySource),
    usedLegacyPathSource: true,
  };
}

function assertLegacyClipSourceAllowed(usedLegacyPathSource: boolean): void {
  if (!usedLegacyPathSource) {
    return;
  }
  if (!isPastRemovalTarget(joinClipsCompatPolicy)) {
    return;
  }
  throw new TaskValidationError(
    `Legacy join-clips path fields passed the removal target (${JOIN_CLIPS_COMPAT_REMOVAL_TARGET}). Migrate to clip_source.clips.`,
    'clip_source',
  );
}

function assertLegacyVideoEditSourceAllowed(usedLegacyVideoEditSource: boolean): void {
  if (!usedLegacyVideoEditSource) {
    return;
  }
  if (!isPastRemovalTarget(joinClipsCompatPolicy)) {
    return;
  }
  throw new TaskValidationError(
    `Legacy join-clips video_edit_mode/source_* fields passed the removal target (${JOIN_CLIPS_COMPAT_REMOVAL_TARGET}). Migrate to video_edit config.`,
    'video_edit',
  );
}

interface ResolvedVideoEditConfig {
  videoEdit: JoinClipsVideoEditConfig | undefined;
  usedLegacyVideoEditMode: boolean;
  usedLegacyVideoEditPayload: boolean;
}

function resolveVideoEditConfig(params: JoinClipsTaskCompatParams): ResolvedVideoEditConfig {
  const hasCanonicalVideoEdit = Boolean(params.video_edit);
  const hasCanonicalVideoEditMode = params.mode === 'video_edit';
  const usedLegacyVideoEditMode = Boolean(params.video_edit_mode);
  const usedLegacyVideoEditPayload = hasLegacyVideoEditPayloadFields(params);
  const hasLegacyVideoEdit = usedLegacyVideoEditMode || usedLegacyVideoEditPayload;

  if ((hasCanonicalVideoEdit || hasCanonicalVideoEditMode) && hasLegacyVideoEdit) {
    throw new TaskValidationError('Provide exactly one video-edit mode', 'video_edit');
  }

  if (hasCanonicalVideoEdit || hasCanonicalVideoEditMode) {
    if (!params.video_edit?.source_video_url) {
      throw new TaskValidationError(
        "video_edit.source_video_url is required when mode is video_edit",
        'video_edit',
      );
    }
    return {
      videoEdit: params.video_edit,
      usedLegacyVideoEditMode: false,
      usedLegacyVideoEditPayload: false,
    };
  }

  if (!usedLegacyVideoEditMode) {
    return {
      videoEdit: undefined,
      usedLegacyVideoEditMode: false,
      usedLegacyVideoEditPayload: false,
    };
  }

  if (!params.source_video_url) {
    throw new TaskValidationError(
      "source_video_url is required when video_edit_mode is enabled",
      'video_edit_mode',
    );
  }

  return {
    videoEdit: {
      source_video_url: params.source_video_url,
      source_video_fps: params.source_video_fps,
      source_video_duration: params.source_video_duration,
      source_video_total_frames: params.source_video_total_frames,
      portions_to_regenerate: params.portions_to_regenerate,
    },
    usedLegacyVideoEditMode,
    usedLegacyVideoEditPayload,
  };
}

function toCanonicalJoinClipsTaskInput(
  params: JoinClipsTaskCompatParams,
): CanonicalJoinClipsTaskInput {
  validateCompatModeBoundaries(params);
  assertSingleClipSourceMode(params);

  const resolvedClipSource = resolveClipSource(params);
  if (!resolvedClipSource) {
    throw new TaskValidationError(
      "At least two clips are required to create a join",
      'clips',
    );
  }
  const { clipSource, usedLegacyPathSource } = resolvedClipSource;
  assertLegacyClipSourceAllowed(usedLegacyPathSource);

  const {
    videoEdit,
    usedLegacyVideoEditMode,
    usedLegacyVideoEditPayload,
  } = resolveVideoEditConfig(params);
  assertLegacyVideoEditSourceAllowed(usedLegacyVideoEditMode || usedLegacyVideoEditPayload);

  const {
    mode: requestedMode,
    clip_source: _canonicalClipSource,
    video_edit: _canonicalVideoEdit,
    clips: _legacyClips,
    starting_video_path: _legacyStartingVideoPath,
    ending_video_path: _legacyEndingVideoPath,
    intermediate_video_paths: _legacyIntermediateVideoPaths,
    video_edit_mode: _legacyVideoEditMode,
    source_video_url: _legacySourceVideoUrl,
    source_video_fps: _legacySourceVideoFps,
    source_video_duration: _legacySourceVideoDuration,
    source_video_total_frames: _legacySourceVideoTotalFrames,
    portions_to_regenerate: _legacyPortionsToRegenerate,
    ...shared
  } = params;

  const mode: CanonicalJoinClipsTaskInput['mode'] = requestedMode === 'video_edit' || videoEdit
    ? 'video_edit'
    : 'multi_clip';

  return {
    ...shared,
    mode: requestedMode === 'multi_clip' || requestedMode === 'video_edit'
      ? requestedMode
      : mode,
    clip_source: clipSource,
    ...(videoEdit ? { video_edit: videoEdit } : {}),
  };
}

/**
 * @deprecated Migration adapter for mixed-shape join-clips inputs.
 * Prefer mode-specific APIs from `joinClips.ts`.
 */
export function createJoinClipsTaskCompat(
  params: JoinClipsTaskCompatParams,
  onCompatUse?: (event: JoinClipsCompatUseEvent) => void,
): Promise<TaskCreationResult> {
  return Promise.resolve().then(() => {
    const legacySources: JoinClipsCompatLegacySource[] = [];
    if (hasLegacyPathFields(params)) {
      legacySources.push('legacy_clip_paths');
    }
    if (params.video_edit_mode) {
      legacySources.push('legacy_video_edit_mode');
    }
    if (hasLegacyVideoEditPayloadFields(params)) {
      legacySources.push('legacy_video_edit_payload');
    }

    const canonical = toCanonicalJoinClipsTaskInput(params);
    onCompatUse?.({
      mode: canonical.mode,
      clip_source_kind: canonical.clip_source.kind,
      legacy_sources: legacySources,
      owner: JOIN_CLIPS_COMPAT_OWNER,
      removal_target: JOIN_CLIPS_COMPAT_REMOVAL_TARGET,
    });
    return createCanonicalJoinClipsTask(canonical);
  });
}
