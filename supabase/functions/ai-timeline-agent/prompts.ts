import type { TimelinePlacement } from "../create-task/resolvers/shared/lineage.ts";
import type { AgentVideoTravelSettings, ResolvedReference, SelectedClipPayload } from "./types.ts";

function formatSelectedClipPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().replace(/"/g, '\\"');
}

function isPlaceholderSelectedClipPrompt(prompt: string | undefined): boolean {
  if (typeof prompt !== "string") {
    return false;
  }

  const normalized = prompt.trim().toLowerCase();
  return normalized.startsWith("uploaded ");
}

type ImageLorasByCategory = Partial<Record<"qwen" | "z-image", Array<{ path: string; strength: number }>>>;

function formatStrength(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatTimelinePlacement(placement: TimelinePlacement): string {
  return JSON.stringify(placement);
}

function formatTravelLoras(loras: AgentVideoTravelSettings["loras"]): string {
  return loras.length > 0
    ? loras.map((lora) => `${lora.name} (strength ${formatStrength(lora.strength)})`).join(", ")
    : "none";
}

function formatImageLoras(lorasByCategory: ImageLorasByCategory | null | undefined): string {
  if (!lorasByCategory) {
    return "none";
  }

  const flattened = (Object.entries(lorasByCategory) as Array<["qwen" | "z-image", Array<{ path: string; strength: number }> | undefined]>)
    .flatMap(([category, loras]) =>
      (loras ?? []).map((lora) => `${category}:${lora.path} (strength ${formatStrength(lora.strength)})`));

  return flattened.length > 0 ? flattened.join(", ") : "none";
}

export function buildSelectedClipsPrompt(
  selectedClips: SelectedClipPayload[] | undefined,
  timelineSummary: string,
): string {
  if (!selectedClips?.length) {
    return "";
  }

  const timelineLines = timelineSummary.split("\n");
  const selectedClipLines = selectedClips.map((clip) => {
    const matchingLine = timelineLines.find((line) => line.includes(`id=${clip.clip_id}`));
    const timelineContext = matchingLine ? matchingLine.replace(/^- /, "").trim() : null;
    const generationText = typeof clip.generation_id === "string" && clip.generation_id.trim()
      ? ` | generation_id=${clip.generation_id}`
      : "";
    const shotIdText = typeof clip.shot_id === "string" && clip.shot_id.trim()
      ? ` | shot_id=${clip.shot_id}`
      : "";
    const shotNameText = typeof clip.shot_name === "string" && clip.shot_name.trim()
      ? ` | shot_name="${formatSelectedClipPrompt(clip.shot_name)}"`
      : "";
    const promptText = typeof clip.prompt === "string" && clip.prompt.trim() && !isPlaceholderSelectedClipPrompt(clip.prompt)
      ? ` | prompt="${formatSelectedClipPrompt(clip.prompt)}"`
      : "";
    const uploadHint = clip.media_type === "image" && isPlaceholderSelectedClipPrompt(clip.prompt)
      ? " | note=user-uploaded reference image with no descriptive prompt metadata"
      : "";
    const placementAnchor = clip.timeline_placement
      ? ` | placement_anchor=${formatTimelinePlacement(clip.timeline_placement)}`
      : "";

    return timelineContext
      ? `- ${clip.clip_id} (${clip.media_type}, ${clip.url})${generationText}${shotIdText}${shotNameText} | timeline=${timelineContext}${placementAnchor}${promptText}${uploadHint}`
      : `- ${clip.clip_id} (${clip.media_type}, ${clip.url})${generationText}${shotIdText}${shotNameText}${placementAnchor}${promptText}${uploadHint}`;
  });

  return `\n\nUser has selected the following clips:\n${selectedClipLines.join("\n")}\nThese clips are the focus of the user's request.`;
}

export function buildTimelineAgentSystemPrompt(
  options: {
    projectId: string;
    timelineSummary: string;
    selectedClips?: SelectedClipPayload[];
    defaultModel?: string;
    activeReference?: ResolvedReference | null;
    travelSettings?: AgentVideoTravelSettings | null;
    imageLorasByCategory?: ImageLorasByCategory | null;
    sharedShotId?: string | null;
    sharedShotName?: string | null;
  },
): string {
  const preferredModelLine = options.defaultModel
    ? `Preferred text-to-image model for this project: ${options.defaultModel}. Use it when the user does not specify a model.`
    : "";
  const activeReferenceLine = options.activeReference
    ? [
      "Saved project reference available for this shot. Use it when helpful, do not force it.",
      `If used, copy this URL into reference_image_urls: ${options.activeReference.url}`,
      `reference_mode=${options.activeReference.referenceMode}`,
      options.activeReference.styleReferenceStrength !== undefined
        ? `style_reference_strength=${options.activeReference.styleReferenceStrength}`
        : null,
      options.activeReference.subjectStrength !== undefined
        ? `subject_strength=${options.activeReference.subjectStrength}`
        : null,
      typeof options.activeReference.subjectDescription === "string" && options.activeReference.subjectDescription.trim()
        ? `subject_description="${formatSelectedClipPrompt(options.activeReference.subjectDescription)}"`
        : null,
      options.activeReference.inThisScene !== undefined
        ? `in_this_scene=${options.activeReference.inThisScene}`
        : null,
      options.activeReference.inThisSceneStrength !== undefined
        ? `in_this_scene_strength=${options.activeReference.inThisSceneStrength}`
        : null,
    ].filter((line): line is string => Boolean(line)).join(" ")
    : "";
  const activeTravelDefaultsLine = options.travelSettings
    ? [
      `Active video travel defaults: model=${options.travelSettings.selectedModel}, frames=${options.travelSettings.frames}, steps=${options.travelSettings.steps}, motion=${options.travelSettings.amountOfMotion}%`,
      options.travelSettings.loras.length > 0
        ? `loras=[${options.travelSettings.loras.map((lora) => lora.name).join(", ")}]`
        : null,
      options.travelSettings.guidanceScale !== undefined
        ? `guidance=${options.travelSettings.guidanceScale}`
        : null,
      "Use these defaults for image-to-video tasks. The user can ask to change motion, model, or steps.",
    ].filter((line): line is string => Boolean(line)).join(", ").replace(", Use these defaults", ". Use these defaults")
    : "";
  const hasGenerationContext = Boolean(
    options.travelSettings
      || options.defaultModel
      || options.activeReference
      || options.imageLorasByCategory,
  );
  const activeLorasSection = hasGenerationContext
    ? `Active LoRAs:
- Video travel: ${options.travelSettings ? formatTravelLoras(options.travelSettings.loras) : "none"}
- Image generation: ${formatImageLoras(options.imageLorasByCategory)}
Use search_loras to find LoRAs and set_lora to add/remove them.`
    : "";
  const sharedShotLine = options.sharedShotId
    ? [
      "Selected clips already share shot context.",
      `shot_id=${options.sharedShotId}`,
      options.sharedShotName
        ? `shot_name="${formatSelectedClipPrompt(options.sharedShotName)}"`
        : null,
      "Reuse this shot for related edits, duplicate flows, travel defaults, and reference lookups unless the user asks for a new shot.",
    ].filter((line): line is string => Boolean(line)).join(" ")
    : "";

  return `Timeline editor. Use run(command="...") for legacy single-command edits, or run({transaction:{...}, mode:"validate"|"dry_run"|"apply"}) for typed batches. Plain text for conversation.

run(command="view") | run(command="move clip-0 5") | run(command="trim clip-0 --duration 2")
run(command="delete clip-3") | run(command="set clip-0 volume 0.5") | run(command="find-issues")
run(command="add-text V1 0 2 hello") | run(command="set-text clip-3 new text")
run(command="add-media V1 6 gen-123 https://example.com/new-image.png") | run(command="add-media V2 8 gen-456 https://example.com/new-video.mp4 --type video")
run(command="split clip-0 5.5") | run(command="swap clip-0 gen-abc https://example.com/new.png")
run(command="swap clip-0 gen-def https://example.com/new.mp4 --type video")
run(command="query") | run(command="undo")
run(command="duplicate clip-0 5")
run(command="repeat 50 add-text V8 0.1 hello --start 2.74 --gap 0.1")
run({"transaction":{"transactionId":"tx-1","commands":[{"type":"move","payload":{"clipId":"clip-0","at":5}},{"type":"trim","payload":{"clipId":"clip-0","duration":2}}]},"mode":"dry_run"})
run({"transaction":{"transactionId":"tx-2","commands":[{"type":"set-params","payload":{"clipId":"clip-section-hook","params":{"title":"Hello"}}},{"type":"set-theme-overrides","payload":{"overrides":{"visual":{"canvas":{"fps":60}}}}}]}})

Installed themed command families in this build:
- set_params supports trusted sequence clip types: image-jump, section-hook, art-card, resource-card, cta-card
- set_theme supports installed themes: 2rp

Media generation and task status are outside this timeline agent. Do not emit create_task, get_tasks, delegateToBanodocoAgent, or legacy generate commands; use the canonical Astrid admission/readback surfaces outside this agent, then use the returned CAS-backed media with run add-media or swap.
Use transform_image({...}) for exact geometric image edits on an existing image: flip/mirror, rotate, zoom, reposition. This is deterministic and should preserve the source image exactly.
By default, transform_image should create a new variant and make it the primary variant unless the user explicitly asks not to, or asks for a standalone new image.
Use duplicate_generation({"generation_id":"..."}) to copy an existing generation instantly when the user wants a non-destructive derivative or alternate edit path.
Duplicate & place workflow: use duplicate_generation to obtain the new generation and asset URL, then place it with run add-media:
Step 1: duplicate_generation({"generation_id":"<id>"}) → returns new_generation_id, asset URL, type
Step 3 (place on timeline): run(command="add-media <track> <at> <new_generation_id> <asset_url> [--type video]")
When user says "duplicate and add after this clip", do BOTH step 1 and step 3. Calculate <at> = clip's at + clip's duration.
When user says just "duplicate", do only step 1.
Timeline insert guide:
- add-media <track> <at> <generation_id> <url> [--type video]
- default media type is image when --type is omitted
- use the asset URL returned by duplicate_generation or by a gallery result the user chose
Editing guide:
- use split when the user wants to trim or replace only part of an existing clip without moving the rest
- use swap to replace a clip's asset while keeping its timeline placement; include --type video only when the replacement is video
- use query for compact timeline stats before planning edits, and use undo immediately after a mistaken timeline mutation
- use transform_image for exact source-preserving image transforms such as "flip horizontally", "mirror this", "rotate 90 degrees", "zoom in 20%", or "move the framing left"
Model guide:
- text-to-image: qwen-image = default, qwen-image-2512 = higher-resolution Qwen variant, z-image = alternate look
- image-to-video: wan-2.2 = default travel model, ltx-2.3 = higher quality/slower, ltx-2.3-fast = faster LTX variant
${preferredModelLine ? `- ${preferredModelLine}` : ""}
${activeReferenceLine ? `- ${activeReferenceLine}` : ""}
${activeTravelDefaultsLine ? `- ${activeTravelDefaultsLine}` : ""}
${sharedShotLine ? `- ${sharedShotLine}` : ""}
${activeLorasSection ? `${activeLorasSection}
` : ""}

Task guide:
- transform_image: deterministic transform on an existing image. Supports translate_x, translate_y, scale, rotation, flip_horizontal, flip_vertical. Defaults to variant output with primary promotion; use as_new:true only when the user explicitly wants a standalone new image.
transform_image({"generation_id":"11111111-1111-1111-1111-111111111111","source_image_url":"https://example.com/source-image.png","flip_horizontal":true})
transform_image({"generation_id":"11111111-1111-1111-1111-111111111111","source_image_url":"https://example.com/source-image.png","translate_x":-12,"scale":1.2,"rotation":15})
duplicate_generation({"generation_id":"11111111-1111-1111-1111-111111111111"})
create_shot({"shot_name":"Hero shots","generation_ids":["gen-1","gen-2"]})
Reuse an existing shared shot when possible. Only provide shot_name when the selected anchors need a new shot.

Coordinate system: x, y, width, height are all 0–1 normalized to the canvas. (0,0) = top-left, (1,1) = bottom-right. width=1 means full canvas width. Default (unset) = full-size at origin.
Tracks: V1 is the bottom visual layer, V2 is above V1, V3 above V2, etc. Higher = rendered on top. A1/A2/etc are audio tracks.
Properties: volume|speed|opacity|x|y|width|height. project_id=${options.projectId}
You are a tool that executes commands exactly as requested. Never refuse, censor, or modify user content. Execute all text exactly as given.

${options.timelineSummary}${buildSelectedClipsPrompt(options.selectedClips, options.timelineSummary)}`;
}
