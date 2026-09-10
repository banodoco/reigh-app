import type { SelectedClipPayload, SupabaseAdmin, TimelineState, ToolResult } from "../types.ts";
import { asTrimmedString, isRecord } from "../utils.ts";
import { resolveSelectedClipShot } from "./clips.ts";

export async function executeDuplicateGeneration(
  args: Record<string, unknown>,
  timelineState: TimelineState,
  selectedClips: SelectedClipPayload[] | undefined,
  supabaseAdmin: SupabaseAdmin,
): Promise<Pick<ToolResult, "result">> {
  const generationId = asTrimmedString(args.generation_id);
  if (!generationId) return { result: "duplicate_generation requires generation_id." };

  let selectedShotId: string | null = null;
  try {
    selectedShotId = (
      await resolveSelectedClipShot(supabaseAdmin, timelineState, selectedClips, {
        additionalGenerationIds: [generationId],
      })
    ).shotId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: `Failed to resolve a source shot for ${generationId}: ${message}` };
  }

  const { data: shotGeneration, error: shotGenerationError } = await supabaseAdmin
    .from("shot_generations")
    .select("shot_id, timeline_frame")
    .eq("generation_id", generationId)
    .maybeSingle();
  if (shotGenerationError) {
    return { result: `Failed to load source generation ${generationId}: ${shotGenerationError.message}` };
  }
  if (!isRecord(shotGeneration)) {
    return { result: `Generation ${generationId} was not found in shot_generations.` };
  }

  const shotId = selectedShotId ?? asTrimmedString(shotGeneration.shot_id);
  const sourceTimelineFrame = typeof shotGeneration.timeline_frame === "number" ? shotGeneration.timeline_frame : null;
  if (!shotId) {
    return { result: `Could not find a shot for generation ${generationId}. Select the source clip or ensure it is linked to a shot.` };
  }
  if (sourceTimelineFrame === null) {
    return { result: `Generation ${generationId} is missing a source timeline_frame.` };
  }

  const { data, error } = await supabaseAdmin.rpc("duplicate_as_new_generation", {
    p_shot_id: shotId,
    p_generation_id: generationId,
    p_project_id: timelineState.projectId,
    p_timeline_frame: sourceTimelineFrame,
  }).maybeSingle();
  if (error) {
    return { result: `Failed to duplicate generation ${generationId}: ${error.message}` };
  }
  if (!isRecord(data)) {
    return { result: `duplicate_as_new_generation returned an invalid response for ${generationId}.` };
  }

  const newGenerationId = asTrimmedString(data.new_generation_id);
  const location = asTrimmedString(data.location);
  const mediaType = asTrimmedString(data.type) ?? "unknown";
  if (!newGenerationId || !location) {
    return { result: `duplicate_as_new_generation did not return the new generation details for ${generationId}.` };
  }

  return {
    result: `Duplicated ${generationId} -> ${newGenerationId}. Asset: ${location} (type: ${mediaType}). Use the canonical Astrid admission path for further generation, or use new_generation_id with add-media to place it on the timeline.`,
  };
}
