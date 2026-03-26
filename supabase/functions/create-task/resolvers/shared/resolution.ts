export const DEFAULT_ASPECT_RATIO = "1:1";

export const ASPECT_RATIO_TO_RESOLUTION: Record<string, string> = {
  "21:9": "1024x438",
  "16:9": "902x508",
  "4:3": "768x576",
  "3:2": "768x512",
  "1:1": "670x670",
  "2:3": "512x768",
  "3:4": "576x768",
  "9:16": "508x902",
  "9:21": "438x1024",
  "Square": "670x670",
};

export interface ProjectResolutionResult {
  resolution: string;
  aspectRatio: string;
}

export interface ResolveProjectResolutionOptions {
  aspectRatio?: string | null;
  customResolution?: string;
}

export interface ResolveImageGenerationResolutionOptions
  extends ResolveProjectResolutionOptions {
  modelName?: string;
  resolutionScale?: number;
  resolutionMode?: "project" | "custom";
  customAspectRatio?: string;
}

function isScaledImageGenerationModel(modelName?: string): boolean {
  return modelName === "qwen-image"
    || modelName === "qwen-image-2512"
    || modelName === "z-image";
}

function scaleResolution(resolution: string, scale: number): string {
  const [width, height] = resolution.split("x").map(Number);
  return `${Math.round(width * scale)}x${Math.round(height * scale)}`;
}

export function resolutionForAspectRatio(aspectRatio?: string | null): string {
  const aspectRatioKey = aspectRatio ?? DEFAULT_ASPECT_RATIO;
  return ASPECT_RATIO_TO_RESOLUTION[aspectRatioKey]
    ?? ASPECT_RATIO_TO_RESOLUTION[DEFAULT_ASPECT_RATIO];
}

export function resolveProjectResolutionFromAspectRatio({
  aspectRatio,
  customResolution,
}: ResolveProjectResolutionOptions): ProjectResolutionResult {
  if (customResolution?.trim()) {
    return {
      resolution: customResolution.trim(),
      aspectRatio: "custom",
    };
  }

  const resolvedAspectRatio = aspectRatio ?? DEFAULT_ASPECT_RATIO;
  return {
    resolution: resolutionForAspectRatio(resolvedAspectRatio),
    aspectRatio: resolvedAspectRatio,
  };
}

export function resolveImageGenerationResolution({
  aspectRatio,
  customResolution,
  modelName,
  resolutionScale,
  resolutionMode,
  customAspectRatio,
}: ResolveImageGenerationResolutionOptions): ProjectResolutionResult {
  if (customResolution?.trim()) {
    return {
      resolution: customResolution.trim(),
      aspectRatio: "custom",
    };
  }

  const resolvedAspectRatio = resolutionMode === "custom" && customAspectRatio
    ? customAspectRatio
    : (aspectRatio ?? DEFAULT_ASPECT_RATIO);

  const baseResolution = resolutionMode === "custom" && customAspectRatio
    ? resolutionForAspectRatio(customAspectRatio)
    : resolutionForAspectRatio(resolvedAspectRatio);

  if (!isScaledImageGenerationModel(modelName)) {
    return {
      resolution: baseResolution,
      aspectRatio: resolvedAspectRatio,
    };
  }

  return {
    resolution: scaleResolution(baseResolution, resolutionScale ?? 1.5),
    aspectRatio: resolvedAspectRatio,
  };
}
