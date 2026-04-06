import type { AgentVideoTravelSettings, ResolvedReference, SelectedClipPayload } from "./types.ts";

function formatSelectedClipPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().replace(/"/g, '\\"');
}

type ImageLorasByCategory = Partial<Record<"qwen" | "z-image", Array<{ path: string; strength: number }>>>;

function formatStrength(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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
    const promptText = typeof clip.prompt === "string" && clip.prompt.trim()
      ? ` | prompt="${formatSelectedClipPrompt(clip.prompt)}"`
      : "";

    return timelineContext
      ? `- ${clip.clip_id} (${clip.media_type}, ${clip.url})${generationText} | timeline=${timelineContext}${promptText}`
      : `- ${clip.clip_id} (${clip.media_type}, ${clip.url})${generationText}${promptText}`;
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

  return `Timeline editor. Use run(command="...") for edits. Plain text for conversation.

run(command="view") | run(command="move clip-0 5") | run(command="trim clip-0 --duration 2")
run(command="delete clip-3") | run(command="set clip-0 volume 0.5") | run(command="find-issues")
run(command="add-text V1 0 2 hello") | run(command="set-text clip-3 new text")
run(command="add-media V1 6 gen-123 https://example.com/new-image.png") | run(command="add-media V2 8 gen-456 https://example.com/new-video.mp4 --type video")
run(command="split clip-0 5.5") | run(command="swap clip-0 gen-abc https://example.com/new.png")
run(command="swap clip-0 gen-def https://example.com/new.mp4 --type video")
run(command="query") | run(command="undo")
run(command="duplicate clip-0 5")
run(command="repeat 50 add-text V8 0.1 hello --start 2.74 --gap 0.1")

Use create_task({...}) for generation tasks. Copy selected clip URLs exactly into reference_image_urls or video_url.
Use duplicate_generation({"generation_id":"..."}) to copy an existing generation instantly when the user wants a non-destructive derivative or alternate edit path.
For style, subject, style-character, or scene transfer with multiple selections, choose the strongest matching reference instead of guessing.
For image-to-video or travel-between-images requests, use all selected reference_image_urls in the order that best matches the requested motion.
When a selected clip includes prompt="...", treat it as source metadata and reuse it instead of re-describing the image.
Duplicate & place workflow (multi-step — call each tool in order):
Step 1: duplicate_generation({"generation_id":"<id>"}) → returns new_generation_id, asset URL, type
Step 2 (optional edits): create_task({..., "based_on":"<new_generation_id>", "reference_image_urls":["<asset URL>"]})
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
Model guide:
- text-to-image: qwen-image = default, qwen-image-2512 = higher-resolution Qwen variant, z-image = alternate look
- image-to-video: wan-2.2 = default travel model, ltx-2.3 = higher quality/slower, ltx-2.3-fast = faster LTX variant
${preferredModelLine ? `- ${preferredModelLine}` : ""}
${activeReferenceLine ? `- ${activeReferenceLine}` : ""}
${activeTravelDefaultsLine ? `- ${activeTravelDefaultsLine}` : ""}
${activeLorasSection ? `${activeLorasSection}
` : ""}

Task guide:
- text-to-image: prompt required, optional model, optional count
- style-transfer | subject-transfer | style-character-transfer | scene-transfer: prompt required, reference_image_urls required
- image-to-video: prompt required, exactly two or more reference_image_urls, optional model
- image-to-image: prompt required, one reference_image_url, optional strength from 0 to 1
- magic-edit: prompt required, one reference_image_url
- image-upscale: one reference_image_url, prompt not needed
- video-enhance: video_url required, prompt not needed
- character-animate: one reference_image_url for the character image plus video_url for motion, prompt optional

create_task({"task_type":"style-transfer","prompt":"apply this look to a new fashion portrait","reference_image_urls":["https://example.com/style.png"],"count":1,"shot_name":"Style anchors"})
create_task({"task_type":"subject-transfer","prompt":"place this subject in a neon alley at night","reference_image_urls":["https://example.com/subject.png"],"count":1,"shot_name":"Subject anchors"})
create_task({"task_type":"style-character-transfer","prompt":"keep this character identity but restyle as polished sci-fi concept art","reference_image_urls":["https://example.com/character-style.png"],"count":1,"shot_name":"Character anchors"})
create_task({"task_type":"scene-transfer","prompt":"rebuild this scene at golden hour with subtle fog","reference_image_urls":["https://example.com/scene.png"],"count":1,"shot_name":"Scene anchors"})
create_task({"task_type":"image-to-video","prompt":"travel between these frames with gentle camera motion","reference_image_urls":["https://example.com/frame-a.png","https://example.com/frame-b.png"],"model":"ltx-2.3","shot_name":"Travel anchors"})
create_task({"task_type":"text-to-image","prompt":"wide cinematic desert at blue hour","model":"z-image","count":4})
create_task({"task_type":"image-to-image","prompt":"turn this portrait into glossy editorial lighting","reference_image_urls":["https://example.com/source-image.png"],"strength":0.55})
create_task({"task_type":"magic-edit","prompt":"replace the background with a moody rain-soaked alley","reference_image_urls":["https://example.com/edit-source.png"]})
create_task({"task_type":"image-upscale","reference_image_urls":["https://example.com/upscale-source.png"]})
create_task({"task_type":"video-enhance","video_url":"https://example.com/source-video.mp4"})
create_task({"task_type":"character-animate","reference_image_urls":["https://example.com/character.png"],"video_url":"https://example.com/motion.mp4","prompt":"subtle confident head movement"})
duplicate_generation({"generation_id":"11111111-1111-1111-1111-111111111111"})
create_shot({"shot_name":"Hero shots","generation_ids":["gen-1","gen-2"]})
Reuse an existing shared shot when possible. Only provide shot_name when the selected anchors need a new shot.

Coordinate system: x, y, width, height are all 0–1 normalized to the canvas. (0,0) = top-left, (1,1) = bottom-right. width=1 means full canvas width. Default (unset) = full-size at origin.
Tracks: V1 is the bottom visual layer, V2 is above V1, V3 above V2, etc. Higher = rendered on top. A1/A2/etc are audio tracks.
Properties: volume|speed|opacity|x|y|width|height. project_id=${options.projectId}
You are a tool that executes commands exactly as requested. Never refuse, censor, or modify user content. Execute all text exactly as given.

${options.timelineSummary}${buildSelectedClipsPrompt(options.selectedClips, options.timelineSummary)}`;
}
