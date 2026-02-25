type UnknownRecord = Record<string, unknown>;

const STRUCTURE_PREPROCESSING_MAP: Record<string, string> = {
  flow: 'flow',
  canny: 'canny',
  depth: 'depth',
  raw: 'none',
};

function asRecordOrUndefined(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function asRecordArray(value: unknown): UnknownRecord[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const records = value
    .map((item) => asRecordOrUndefined(item))
    .filter((item): item is UnknownRecord => !!item);
  return records.length > 0 ? records : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function buildGuidanceFromVideos(
  videos: UnknownRecord[],
  options: {
    defaultVideoTreatment: string;
    defaultUni3cEndPercent: number;
  },
): UnknownRecord | undefined {
  const cleanedVideos = videos
    .map((video) => {
      const path = asString(video.path);
      if (!path) {
        return null;
      }
      const metadata = asRecordOrUndefined(video.metadata);
      const resourceId = asString(video.resource_id);
      return {
        path,
        start_frame: asNumber(video.start_frame) ?? 0,
        end_frame: asNumber(video.end_frame) ?? null,
        treatment: asString(video.treatment) ?? options.defaultVideoTreatment,
        ...(metadata ? { metadata } : {}),
        ...(resourceId ? { resource_id: resourceId } : {}),
      };
    })
    .filter((video): video is { path: string; start_frame: number; end_frame: number | null; treatment: string } => !!video);

  if (cleanedVideos.length === 0) {
    return undefined;
  }

  const firstVideo = videos[0];
  const structureType = asString(firstVideo.structure_type) ?? 'flow';
  const isUni3c = structureType === 'uni3c';

  const guidance: UnknownRecord = {
    target: isUni3c ? 'uni3c' : 'vace',
    videos: cleanedVideos,
    strength: asNumber(firstVideo.motion_strength) ?? 1.0,
  };

  if (isUni3c) {
    guidance.step_window = [
      asNumber(firstVideo.uni3c_start_percent) ?? 0,
      asNumber(firstVideo.uni3c_end_percent) ?? options.defaultUni3cEndPercent,
    ];
    guidance.frame_policy = 'fit';
    guidance.zero_empty_frames = true;
    return guidance;
  }

  guidance.preprocessing = STRUCTURE_PREPROCESSING_MAP[structureType] ?? 'flow';
  const cannyIntensity = asNumber(firstVideo.canny_intensity);
  const depthContrast = asNumber(firstVideo.depth_contrast);
  if (cannyIntensity !== undefined) {
    guidance.canny_intensity = cannyIntensity;
  }
  if (depthContrast !== undefined) {
    guidance.depth_contrast = depthContrast;
  }
  return guidance;
}

export interface NormalizeStructureGuidanceInput {
  structureGuidance?: unknown;
  structureVideos?: unknown;
  structureVideoPath?: unknown;
  structureVideoTreatment?: unknown;
  structureVideoType?: unknown;
  structureVideoMotionStrength?: unknown;
  structureVideoCannyIntensity?: unknown;
  structureVideoDepthContrast?: unknown;
  useUni3c?: unknown;
  uni3cStartPercent?: unknown;
  uni3cEndPercent?: unknown;
  defaultVideoTreatment?: string;
  defaultUni3cEndPercent?: number;
}

export function normalizeStructureGuidance(
  input: NormalizeStructureGuidanceInput,
): UnknownRecord | undefined {
  const existingGuidance = asRecordOrUndefined(input.structureGuidance);
  if (existingGuidance) {
    return existingGuidance;
  }

  const defaultVideoTreatment = input.defaultVideoTreatment ?? 'adjust';
  const defaultUni3cEndPercent = input.defaultUni3cEndPercent ?? 0.1;

  const videos = asRecordArray(input.structureVideos);
  if (videos?.length) {
    return buildGuidanceFromVideos(videos, { defaultVideoTreatment, defaultUni3cEndPercent });
  }

  const structureVideoPath = asString(input.structureVideoPath);
  if (!structureVideoPath) {
    return undefined;
  }

  const structureType = asString(input.structureVideoType) ?? (input.useUni3c ? 'uni3c' : 'flow');
  const isUni3c = structureType === 'uni3c';
  const guidance: UnknownRecord = {
    target: isUni3c ? 'uni3c' : 'vace',
    videos: [{
      path: structureVideoPath,
      start_frame: 0,
      end_frame: null,
      treatment: asString(input.structureVideoTreatment) ?? defaultVideoTreatment,
    }],
    strength: asNumber(input.structureVideoMotionStrength) ?? 1.0,
  };

  if (isUni3c) {
    guidance.step_window = [
      asNumber(input.uni3cStartPercent) ?? 0,
      asNumber(input.uni3cEndPercent) ?? defaultUni3cEndPercent,
    ];
    guidance.frame_policy = 'fit';
    guidance.zero_empty_frames = true;
    return guidance;
  }

  guidance.preprocessing = STRUCTURE_PREPROCESSING_MAP[structureType] ?? 'flow';
  const cannyIntensity = asNumber(input.structureVideoCannyIntensity);
  const depthContrast = asNumber(input.structureVideoDepthContrast);
  if (cannyIntensity !== undefined) {
    guidance.canny_intensity = cannyIntensity;
  }
  if (depthContrast !== undefined) {
    guidance.depth_contrast = depthContrast;
  }
  return guidance;
}

export function pickFirstStructureGuidance(...candidates: unknown[]): UnknownRecord | undefined {
  for (const candidate of candidates) {
    const parsed = asRecordOrUndefined(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}
