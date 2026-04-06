import {
  searchLoras,
  updateProjectImageLoras,
  updateShotLoras,
} from "../db.ts";
import type {
  GenerationContext,
  SelectedClipPayload,
  SupabaseAdmin,
  TimelineState,
  ToolResult,
} from "../types.ts";
import { asTrimmedString } from "../utils.ts";
import { findShotForGenerations, resolveClipGenerationIds } from "./clips.ts";

type SetLoraAction = "add" | "remove" | "update_strength";
type SetLoraTarget = "video-travel" | "image-generation";
type ImageLoraCategory = "qwen" | "z-image";

const DEFAULT_VIDEO_TRAVEL_CONTEXT = {
  selectedModel: "wan-2.2",
  frames: 61,
  steps: 6,
  amountOfMotion: 50,
  turboMode: false,
  enhancePrompt: false,
  generationTypeMode: "i2v" as const,
  generationMode: "timeline" as const,
  smoothContinuations: false,
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asSetLoraAction(value: unknown): SetLoraAction | null {
  return value === "add" || value === "remove" || value === "update_strength" ? value : null;
}

function asSetLoraTarget(value: unknown): SetLoraTarget | null {
  return value === "video-travel" || value === "image-generation" ? value : null;
}

function matchesBaseModel(baseModel: string | undefined, requestedBaseModel: string): boolean {
  const normalizedBaseModel = (baseModel ?? "").toLowerCase();
  if (requestedBaseModel === "z-image") {
    return normalizedBaseModel.includes("z-image")
      || normalizedBaseModel.includes("z image")
      || normalizedBaseModel.includes("zimage");
  }
  return normalizedBaseModel.includes(requestedBaseModel);
}

function formatSearchResultLine(result: {
  name: string;
  path: string;
  baseModel?: string;
  triggerWord?: string;
  lowNoiseUrl?: string;
  highNoiseUrl?: string;
}): string {
  const parts = [
    result.name,
    `path=${result.path}`,
    result.baseModel ? `base_model=${result.baseModel}` : "base_model=unknown",
    result.triggerWord ? `trigger_word=${result.triggerWord}` : "trigger_word=none",
    result.lowNoiseUrl || result.highNoiseUrl ? "multi_stage=yes" : "multi_stage=no",
  ];
  return `- ${parts.join(" | ")}`;
}

function resolveVideoTravelShotId(
  timelineState: TimelineState,
  selectedClips: SelectedClipPayload[] | undefined,
  supabaseAdmin: SupabaseAdmin,
): Promise<string | null> {
  const generationIds = resolveClipGenerationIds(
    selectedClips ?? [],
    timelineState.registry,
    timelineState.config,
  );
  return generationIds.length > 0 ? findShotForGenerations(supabaseAdmin, generationIds) : Promise.resolve(null);
}

export async function executeSearchLoras(
  args: Record<string, unknown>,
  supabaseAdmin: SupabaseAdmin,
  userId?: string,
): Promise<Pick<ToolResult, "result">> {
  const query = asTrimmedString(args.query);
  if (!query) {
    return { result: "search_loras requires query." };
  }

  const requestedBaseModel = asTrimmedString(args.base_model)?.toLowerCase();
  const results = await searchLoras(supabaseAdmin, query, userId);
  const filteredResults = requestedBaseModel
    ? results.filter((result) => matchesBaseModel(result.baseModel, requestedBaseModel))
    : results;

  if (filteredResults.length === 0) {
    const suffix = requestedBaseModel ? ` for base_model=${requestedBaseModel}` : "";
    return { result: `No LoRAs found matching "${query}"${suffix}.` };
  }

  return {
    result: `Found ${filteredResults.length} LoRAs:\n${filteredResults.map((result) => formatSearchResultLine(result)).join("\n")}`,
  };
}

export async function executeSetLora(
  args: Record<string, unknown>,
  timelineState: TimelineState,
  selectedClips: SelectedClipPayload[] | undefined,
  supabaseAdmin: SupabaseAdmin,
  generationContext?: GenerationContext,
): Promise<Pick<ToolResult, "result">> {
  const action = asSetLoraAction(args.action);
  const loraPath = asTrimmedString(args.lora_path);
  const target = asSetLoraTarget(args.target);
  const loraName = asTrimmedString(args.lora_name);
  const triggerWord = asTrimmedString(args.trigger_word);
  const lowNoisePath = asTrimmedString(args.low_noise_path);
  const providedStrength = asFiniteNumber(args.strength);

  if (!action) {
    return { result: "set_lora requires action=add|remove|update_strength." };
  }
  if (!loraPath) {
    return { result: "set_lora requires lora_path." };
  }
  if (!target) {
    return { result: "set_lora requires target=video-travel|image-generation." };
  }
  if (providedStrength !== null && (providedStrength < 0 || providedStrength > 2)) {
    return { result: "set_lora strength must be between 0 and 2." };
  }
  if (action === "update_strength" && providedStrength === null) {
    return { result: "set_lora update_strength requires strength." };
  }

  if (target === "video-travel") {
    const shotId = await resolveVideoTravelShotId(timelineState, selectedClips, supabaseAdmin);
    if (!shotId) {
      return { result: "No shot context. Select clips first." };
    }

    const currentTravelLoras = generationContext?.travel?.loras ?? [];
    let updatedTravelLoras = currentTravelLoras;

    if (action === "add") {
      const nextStrength = providedStrength ?? 1;
      if (currentTravelLoras.some((lora) => lora.path === loraPath)) {
        return { result: `LoRA ${loraPath} is already active for video travel.` };
      }

      const fallbackName = loraName ?? loraPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? loraPath;
      const nextLora = {
        id: crypto.randomUUID(),
        name: fallbackName,
        path: loraPath,
        strength: nextStrength,
        ...(triggerWord ? { triggerWord, trigger_word: triggerWord } : {}),
        ...(lowNoisePath ? { lowNoisePath, low_noise_path: lowNoisePath } : {}),
        ...(lowNoisePath ? { isMultiStage: true, is_multi_stage: true } : {}),
      };
      updatedTravelLoras = [...currentTravelLoras, nextLora];
    } else if (action === "remove") {
      updatedTravelLoras = currentTravelLoras.filter((lora) => lora.path !== loraPath);
      if (updatedTravelLoras.length === currentTravelLoras.length) {
        return { result: `LoRA ${loraPath} is not active for video travel.` };
      }
    } else {
      let didUpdate = false;
      updatedTravelLoras = currentTravelLoras.map((lora) => {
        if (lora.path !== loraPath) {
          return lora;
        }
        didUpdate = true;
        return {
          ...lora,
          strength: providedStrength ?? lora.strength,
        };
      });
      if (!didUpdate) {
        return { result: `LoRA ${loraPath} is not active for video travel.` };
      }
    }

    await updateShotLoras(supabaseAdmin, shotId, updatedTravelLoras);

    if (generationContext) {
      if (generationContext.travel) {
        generationContext.travel.loras = updatedTravelLoras.map((lora) => ({
          id: lora.id,
          name: lora.name,
          path: lora.path,
          strength: lora.strength,
          ...(typeof lora.triggerWord === "string" ? { triggerWord: lora.triggerWord } : {}),
          ...(typeof lora.lowNoisePath === "string" ? { lowNoisePath: lora.lowNoisePath } : {}),
          ...(typeof lora.isMultiStage === "boolean" ? { isMultiStage: lora.isMultiStage } : {}),
        }));
      } else {
        generationContext.travel = {
          ...DEFAULT_VIDEO_TRAVEL_CONTEXT,
          loras: updatedTravelLoras.map((lora) => ({
            id: lora.id,
            name: lora.name,
            path: lora.path,
            strength: lora.strength,
            ...(typeof lora.triggerWord === "string" ? { triggerWord: lora.triggerWord } : {}),
            ...(typeof lora.lowNoisePath === "string" ? { lowNoisePath: lora.lowNoisePath } : {}),
            ...(typeof lora.isMultiStage === "boolean" ? { isMultiStage: lora.isMultiStage } : {}),
          })),
        };
      }
    }

    const actionLabel = action === "add" ? "Added" : action === "remove" ? "Removed" : "Updated";
    return { result: `${actionLabel} video travel LoRA ${loraPath}. Active count: ${updatedTravelLoras.length}.` };
  }

  const category: ImageLoraCategory = generationContext?.image?.defaultModelName?.startsWith("z-") ? "z-image" : "qwen";
  const currentImageLoras = generationContext?.image?.selectedLorasByCategory?.[category] ?? [];
  let updatedImageLoras = currentImageLoras;

  if (action === "add") {
    const nextStrength = providedStrength ?? 1;
    if (currentImageLoras.some((lora) => lora.path === loraPath)) {
      return { result: `LoRA ${loraPath} is already active for image generation.` };
    }
    updatedImageLoras = [...currentImageLoras, { path: loraPath, strength: nextStrength }];
  } else if (action === "remove") {
    updatedImageLoras = currentImageLoras.filter((lora) => lora.path !== loraPath);
    if (updatedImageLoras.length === currentImageLoras.length) {
      return { result: `LoRA ${loraPath} is not active for image generation.` };
    }
  } else {
    let didUpdate = false;
    updatedImageLoras = currentImageLoras.map((lora) => {
      if (lora.path !== loraPath) {
        return lora;
      }
      didUpdate = true;
      return {
        ...lora,
        strength: providedStrength ?? lora.strength,
      };
    });
    if (!didUpdate) {
      return { result: `LoRA ${loraPath} is not active for image generation.` };
    }
  }

  await updateProjectImageLoras(supabaseAdmin, timelineState.projectId, category, updatedImageLoras);

  if (generationContext) {
    if (!generationContext.image) {
      generationContext.image = {
        defaultModelName: category === "z-image" ? "z-image" : "qwen-image",
        activeReference: null,
        selectedLorasByCategory: { [category]: updatedImageLoras },
      };
    } else {
      generationContext.image.selectedLorasByCategory = {
        ...(generationContext.image.selectedLorasByCategory ?? {}),
        [category]: updatedImageLoras,
      };
    }
  }

  const actionLabel = action === "add" ? "Added" : action === "remove" ? "Removed" : "Updated";
  return {
    result: `${actionLabel} image generation LoRA ${loraPath} in ${category}. Active count: ${updatedImageLoras.length}.`,
  };
}
