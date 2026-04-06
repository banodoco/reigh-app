import type { TimelineConfig } from "../../../src/tools/video-editor/types/index.ts";
import { isRecord, isSessionStatus, normalizeTimelineRow } from "./llm/messages.ts";
import type {
  AgentProjectImageSettings,
  AgentProjectImageSettingsReference,
  AgentReferenceMode,
  AgentSessionStatus,
  AgentTurn,
  ResolvedReference,
  SupabaseAdmin,
  TimelineState,
} from "./types.ts";

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asReferenceMode(value: unknown): AgentReferenceMode | undefined {
  return value === "style" || value === "subject" || value === "style-character" || value === "scene" || value === "custom"
    ? value
    : undefined;
}

function normalizeProjectImageReference(value: unknown): AgentProjectImageSettingsReference | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asTrimmedString(value.id);
  const resourceId = asTrimmedString(value.resourceId);
  if (!id || !resourceId) {
    return null;
  }

  return {
    id,
    resourceId,
    referenceMode: asReferenceMode(value.referenceMode),
    styleReferenceStrength: asOptionalNumber(value.styleReferenceStrength),
    subjectStrength: asOptionalNumber(value.subjectStrength),
    subjectDescription: asTrimmedString(value.subjectDescription) ?? undefined,
    inThisScene: asOptionalBoolean(value.inThisScene),
    inThisSceneStrength: asOptionalNumber(value.inThisSceneStrength),
  };
}

function normalizeProjectImageSettings(value: unknown): AgentProjectImageSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const selectedReferenceIdByShot = isRecord(value.selectedReferenceIdByShot)
    ? Object.fromEntries(
        Object.entries(value.selectedReferenceIdByShot)
          .filter(([key]) => typeof key === "string" && key.trim().length > 0)
          .map(([key, selection]) => [key, asTrimmedString(selection)]),
      )
    : undefined;
  const references = Array.isArray(value.references)
    ? value.references
      .map((reference) => normalizeProjectImageReference(reference))
      .filter((reference): reference is AgentProjectImageSettingsReference => reference !== null)
    : undefined;

  return {
    selectedTextModel: value.selectedTextModel === "qwen-image" || value.selectedTextModel === "qwen-image-2512" || value.selectedTextModel === "z-image"
      ? value.selectedTextModel
      : undefined,
    ...(references ? { references } : {}),
    ...(selectedReferenceIdByShot ? { selectedReferenceIdByShot } : {}),
  };
}

function buildResolvedReference(
  pointer: AgentProjectImageSettingsReference,
  metadataValue: unknown,
): ResolvedReference | null {
  if (!isRecord(metadataValue)) {
    return null;
  }

  const url = asTrimmedString(metadataValue.styleReferenceImage)
    ?? asTrimmedString(metadataValue.styleReferenceImageOriginal);
  if (!url) {
    return null;
  }

  return {
    url,
    referenceMode: pointer.referenceMode ?? asReferenceMode(metadataValue.referenceMode) ?? "style",
    styleReferenceStrength: pointer.styleReferenceStrength ?? asOptionalNumber(metadataValue.styleReferenceStrength) ?? 1.1,
    subjectStrength: pointer.subjectStrength ?? asOptionalNumber(metadataValue.subjectStrength) ?? 0,
    subjectDescription: pointer.subjectDescription ?? asTrimmedString(metadataValue.subjectDescription) ?? "",
    inThisScene: pointer.inThisScene ?? asOptionalBoolean(metadataValue.inThisScene) ?? false,
    inThisSceneStrength: pointer.inThisSceneStrength ?? asOptionalNumber(metadataValue.inThisSceneStrength) ?? 1,
  };
}

export async function loadTimelineState(
  supabaseAdmin: SupabaseAdmin,
  timelineId: string,
): Promise<TimelineState> {
  const { data, error } = await supabaseAdmin
    .from("timelines")
    .select("config, config_version, asset_registry, project_id")
    .eq("id", timelineId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load timeline: ${error.message}`);
  }

  if (!data || !isRecord(data)) {
    throw new Error("Timeline not found");
  }

  const normalized = normalizeTimelineRow(data);
  return {
    config: normalized.config,
    configVersion: normalized.config_version,
    registry: normalized.asset_registry,
    projectId: normalized.project_id,
  };
}

export async function loadProjectImageSettings(
  supabaseAdmin: SupabaseAdmin,
  projectId: string,
): Promise<AgentProjectImageSettings | null> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("settings")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load project image settings: ${error.message}`);
  }

  if (!data || !isRecord(data) || !isRecord(data.settings)) {
    return null;
  }

  return normalizeProjectImageSettings(data.settings["project-image-settings"]);
}

export async function loadActiveReference(
  supabaseAdmin: SupabaseAdmin,
  settings: AgentProjectImageSettings | null,
  shotId?: string,
): Promise<ResolvedReference | null> {
  if (!settings) {
    return null;
  }

  const selectedReferenceId = settings.selectedReferenceIdByShot?.[shotId ?? "none"] ?? null;
  if (!selectedReferenceId) {
    return null;
  }

  const pointer = settings.references?.find((reference) => reference.id === selectedReferenceId);
  if (!pointer) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("resources")
    .select("type, metadata")
    .eq("id", pointer.resourceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active reference: ${error.message}`);
  }

  if (!data || !isRecord(data) || data.type !== "style-reference") {
    return null;
  }

  return buildResolvedReference(pointer, data.metadata);
}

export async function saveTimelineConfigVersioned(
  supabaseAdmin: SupabaseAdmin,
  timelineId: string,
  expectedVersion: number,
  config: TimelineConfig,
  retries = 2,
): Promise<number | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabaseAdmin
        .rpc("update_timeline_config_versioned", {
          p_timeline_id: timelineId,
          p_expected_version: expectedVersion,
          p_config: config,
        })
        .maybeSingle();

      if (error) {
        // Connection errors are retryable
        if (attempt < retries && (error.message.includes("connection") || error.message.includes("reset") || error.message.includes("SendRequest"))) {
          console.warn(`[agent] DB save failed (attempt ${attempt + 1}), retrying: ${error.message}`);
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw new Error(`Failed to save timeline config: ${error.message}`);
      }

      const nextVersion = (data as { config_version?: unknown } | null)?.config_version;
      return typeof nextVersion === "number" ? nextVersion : null;
    } catch (err: unknown) {
      if (attempt < retries && err instanceof Error && (err.message.includes("connection") || err.message.includes("reset") || err.message.includes("SendRequest"))) {
        console.warn(`[agent] DB save threw (attempt ${attempt + 1}), retrying: ${err.message}`);
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to save timeline config after retries");
}

export async function loadSessionStatus(
  supabaseAdmin: SupabaseAdmin,
  sessionId: string,
): Promise<AgentSessionStatus | null> {
  const { data, error } = await supabaseAdmin
    .from("timeline_agent_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data || !isRecord(data)) {
    return null;
  }

  return isSessionStatus(data.status) ? data.status : null;
}

export async function persistSessionState(
  supabaseAdmin: SupabaseAdmin,
  options: {
    sessionId: string;
    status: AgentSessionStatus;
    turns: AgentTurn[];
    summary: string | null;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("timeline_agent_sessions")
    .update({
      status: options.status,
      turns: options.turns,
      summary: options.summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.sessionId);

  if (error) {
    throw new Error(`Failed to persist session state: ${error.message}`);
  }
}
