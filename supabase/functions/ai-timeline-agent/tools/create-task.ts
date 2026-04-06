import type {
  GenerationContext,
  SelectedClipPayload,
  SupabaseAdmin,
  TimelineState,
  ToolResult,
} from "../types.ts";
import { asPositiveNumber, asStringArray, asTrimmedString } from "../utils.ts";
import { createShotWithGenerations, findShotForGenerations, resolveClipGenerationIds } from "./clips.ts";
import { createGenerationTask } from "./generation.ts";

const APPEND_SHOT_POSITION = 2_147_483_647;
const SUPPORTED_CREATE_TASK_TYPES = new Set([
  "text-to-image",
  "style-transfer",
  "subject-transfer",
  "style-character-transfer",
  "scene-transfer",
  "image-to-video",
  "image-to-image",
  "magic-edit",
  "image-upscale",
  "video-enhance",
  "character-animate",
]);
const TASK_TYPE_TO_REFERENCE_MODE: Record<string, string> = {
  "style-transfer": "style",
  "subject-transfer": "subject",
  "style-character-transfer": "style-character",
  "scene-transfer": "scene",
};
const TASK_TYPES_REQUIRING_PROMPT = new Set([
  "text-to-image",
  "style-transfer",
  "subject-transfer",
  "style-character-transfer",
  "scene-transfer",
  "image-to-video",
  "image-to-image",
  "magic-edit",
]);
const TASK_TYPES_REQUIRING_REFERENCE_IMAGE = new Set([
  "style-transfer",
  "subject-transfer",
  "style-character-transfer",
  "scene-transfer",
  "image-to-image",
  "magic-edit",
  "image-upscale",
  "character-animate",
]);
const TASK_TYPES_REQUIRING_VIDEO = new Set([
  "video-enhance",
  "character-animate",
]);

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function executeCreateTask(
  args: Record<string, unknown>,
  timelineState: TimelineState,
  selectedClips: SelectedClipPayload[] | undefined,
  supabaseAdmin: SupabaseAdmin,
  generationContext?: GenerationContext,
): Promise<Pick<ToolResult, "result">> {
  const imageContext = generationContext?.image ?? null;
  const travelContext = generationContext?.travel ?? null;
  const taskType = asTrimmedString(args.task_type);
  const prompt = asTrimmedString(args.prompt);
  if (!taskType) {
    return { result: "create_task requires task_type." };
  }
  if (!SUPPORTED_CREATE_TASK_TYPES.has(taskType)) {
    return { result: `create_task does not support task_type ${taskType}.` };
  }
  if (TASK_TYPES_REQUIRING_PROMPT.has(taskType) && !prompt) {
    return { result: `create_task ${taskType} requires prompt.` };
  }

  const requestedReferenceImageUrls = asStringArray(args.reference_image_urls);
  const activeReference = imageContext?.activeReference ?? null;
  const shouldUseActiveReference = requestedReferenceImageUrls.length === 0
    && Boolean(TASK_TYPE_TO_REFERENCE_MODE[taskType])
    && Boolean(activeReference?.url);
  const referenceImageUrls = shouldUseActiveReference && activeReference?.url
    ? [activeReference.url]
    : requestedReferenceImageUrls;
  const referenceMode = asTrimmedString(args.reference_mode) ?? TASK_TYPE_TO_REFERENCE_MODE[taskType] ?? undefined;
  const videoUrl = asTrimmedString(args.video_url);
  const strength = typeof args.strength === "number" && Number.isFinite(args.strength) ? args.strength : undefined;
  if (strength !== undefined && (strength < 0 || strength > 1)) {
    return { result: "create_task strength must be between 0 and 1." };
  }
  if (taskType === "image-to-video" && referenceImageUrls.length < 2) {
    return { result: "create_task image-to-video requires at least two reference_image_urls." };
  }
  if (TASK_TYPES_REQUIRING_REFERENCE_IMAGE.has(taskType) && referenceImageUrls.length === 0) {
    return { result: `create_task ${taskType} requires reference_image_urls.` };
  }
  if (TASK_TYPES_REQUIRING_VIDEO.has(taskType) && !videoUrl) {
    return { result: `create_task ${taskType} requires video_url.` };
  }

  const selectedReferenceClips = selectedClips?.filter((clip) => referenceImageUrls.includes(clip.url)) ?? [];
  const selectedVideoClip = videoUrl
    ? selectedClips?.find((clip) => clip.url === videoUrl)
    : undefined;
  const selectedClipsForShot = selectedVideoClip && !selectedReferenceClips.some((clip) => clip.url === selectedVideoClip.url)
    ? [...selectedReferenceClips, selectedVideoClip]
    : selectedReferenceClips;
  const generationIds = resolveClipGenerationIds(selectedClipsForShot, timelineState.registry, timelineState.config);
  let shotId = generationIds.length ? await findShotForGenerations(supabaseAdmin, generationIds) : null;
  let shotNote = "";
  const shotName = asTrimmedString(args.shot_name);
  if (!shotId && shotName && generationIds.length > 0) {
    shotId = await createShotWithGenerations(supabaseAdmin, {
      projectId: timelineState.projectId,
      shotName,
      generationIds,
      position: APPEND_SHOT_POSITION,
    });
    shotNote = ` Created shot ${shotName} (${shotId}).`;
  } else if (shotId) {
    shotNote = ` Reused shot ${shotId}.`;
  }

  const basedOn = asTrimmedString(args.based_on) ?? (taskType === "video-enhance"
    ? selectedVideoClip?.generation_id
    : selectedReferenceClips[0]?.generation_id);
  const generationId = taskType === "image-upscale" ? selectedReferenceClips[0]?.generation_id : undefined;
  const defaultModelName = taskType === "image-to-video"
    ? travelContext?.selectedModel
    : (taskType === "text-to-image" || Boolean(TASK_TYPE_TO_REFERENCE_MODE[taskType]))
      ? imageContext?.defaultModelName
      : undefined;
  const activeReferenceParams = shouldUseActiveReference && activeReference
    ? {
      ...(activeReference.styleReferenceStrength !== undefined
        ? { style_reference_strength: activeReference.styleReferenceStrength }
        : {}),
      ...(activeReference.subjectStrength !== undefined
        ? { subject_strength: activeReference.subjectStrength }
        : {}),
      ...(typeof activeReference.subjectDescription === "string" && activeReference.subjectDescription.trim()
        ? { subject_description: activeReference.subjectDescription }
        : {}),
      ...(activeReference.inThisScene !== undefined
        ? { in_this_scene: activeReference.inThisScene }
        : {}),
      ...(activeReference.inThisSceneStrength !== undefined
        ? { in_this_scene_strength: activeReference.inThisSceneStrength }
        : {}),
    }
    : undefined;
  const effectiveModel = asTrimmedString(args.model) ?? defaultModelName ?? undefined;
  const loraCategory = TASK_TYPE_TO_REFERENCE_MODE[taskType]
    ? "qwen"
    : (effectiveModel?.startsWith("z-") ? "z-image" : "qwen");
  const loras = imageContext?.selectedLorasByCategory?.[loraCategory] ?? [];
  const rawMotion = asFiniteNumber(args.amount_of_motion);
  const travelParams = taskType === "image-to-video"
    ? {
      amount_of_motion: rawMotion !== null
        ? rawMotion / 100
        : (travelContext ? travelContext.amountOfMotion / 100 : undefined),
      steps: asPositiveNumber(args.steps) ?? travelContext?.steps,
      guidance_scale: asFiniteNumber(args.guidance_scale) ?? travelContext?.guidanceScale,
      enhance_prompt: typeof args.enhance_prompt === "boolean" ? args.enhance_prompt : travelContext?.enhancePrompt,
      turbo_mode: typeof args.turbo_mode === "boolean" ? args.turbo_mode : travelContext?.turboMode,
      loras: travelContext?.loras?.map((lora) => ({ path: lora.path, strength: lora.strength })),
      negative_prompts: travelContext?.negativePrompt ? [travelContext.negativePrompt] : undefined,
      text_before_prompts: travelContext?.textBeforePrompts || undefined,
      text_after_prompts: travelContext?.textAfterPrompts || undefined,
      segment_frames: travelContext ? [travelContext.frames] : undefined,
      model_type: travelContext?.generationTypeMode,
      generation_mode: travelContext ? (travelContext.generationMode ?? "timeline") : undefined,
      phase_config: travelContext?.phaseConfig,
    }
    : undefined;
  const mergedParams = {
    ...(activeReferenceParams ?? {}),
    ...(loras.length > 0 ? { loras } : {}),
  };
  const filteredTravelParams = travelParams
    ? Object.fromEntries(Object.entries(travelParams).filter(([, value]) => value !== undefined))
    : undefined;

  const result = await createGenerationTask({
    project_id: timelineState.projectId,
    prompt: prompt ?? undefined,
    count: asPositiveNumber(args.count) ?? 1,
    task_type: taskType,
    reference_mode: referenceMode,
    reference_image_url: referenceImageUrls[0],
    image_urls: taskType === "image-to-video" ? referenceImageUrls : undefined,
    video_url: videoUrl ?? undefined,
    strength,
    model_name: effectiveModel,
    params: taskType === "image-to-video"
      ? (filteredTravelParams && Object.keys(filteredTravelParams).length > 0 ? filteredTravelParams : undefined)
      : (Object.keys(mergedParams).length > 0 ? mergedParams : undefined),
    based_on: basedOn ?? undefined,
    generation_id: generationId ?? undefined,
    shot_id: shotId ?? undefined,
  });
  return { result: `${result.result}${shotNote}`.trim() };
}
