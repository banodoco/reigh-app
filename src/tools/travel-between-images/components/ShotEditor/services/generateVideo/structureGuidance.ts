import {
  type StructureVideoConfigWithMetadata,
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
} from '@/shared/lib/tasks/travelBetweenImages';

const PREPROCESSING_MAP: Record<string, string> = {
  flow: 'flow',
  canny: 'canny',
  depth: 'depth',
  raw: 'none',
};

/**
 * Build unified structure_guidance object for API requests.
 * Returns null when no structure videos are configured.
 */
export function buildStructureGuidance(
  structureVideos: StructureVideoConfigWithMetadata[] | undefined,
): Record<string, unknown> | null {
  if (!structureVideos || structureVideos.length === 0) {
    return null;
  }

  const firstVideo = structureVideos[0];
  const isUni3c = firstVideo.structure_type === 'uni3c';

  const cleanedVideos = structureVideos.map((video) => ({
    path: video.path,
    start_frame: video.start_frame ?? 0,
    end_frame: video.end_frame ?? null,
    treatment: video.treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    ...(video.metadata ? { metadata: video.metadata } : {}),
    ...(video.resource_id ? { resource_id: video.resource_id } : {}),
  }));

  const guidance: Record<string, unknown> = {
    target: isUni3c ? 'uni3c' : 'vace',
    videos: cleanedVideos,
    strength: firstVideo.motion_strength ?? 1.0,
  };

  if (isUni3c) {
    guidance.step_window = [
      firstVideo.uni3c_start_percent ?? 0,
      firstVideo.uni3c_end_percent ?? 1.0,
    ];
    guidance.frame_policy = 'fit';
    guidance.zero_empty_frames = true;
  } else {
    guidance.preprocessing = PREPROCESSING_MAP[firstVideo.structure_type ?? 'flow'] ?? 'flow';
    const videoRecord = firstVideo as unknown as Record<string, unknown>;
    const cannyIntensity = videoRecord.canny_intensity;
    const depthContrast = videoRecord.depth_contrast;
    if (typeof cannyIntensity === 'number') guidance.canny_intensity = cannyIntensity;
    if (typeof depthContrast === 'number') guidance.depth_contrast = depthContrast;
  }

  return guidance;
}
