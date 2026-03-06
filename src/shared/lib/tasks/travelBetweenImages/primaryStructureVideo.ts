import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import { DEFAULT_STRUCTURE_VIDEO } from './defaults';
import type { StructureVideoConfigWithMetadata } from './uiTypes';

export interface PrimaryStructureVideo {
  path: string | null;
  metadata: VideoMetadata | null;
  treatment: 'adjust' | 'clip';
  motionStrength: number;
  structureType: 'uni3c' | 'flow' | 'canny' | 'depth';
  uni3cEndPercent: number;
}

/**
 * Derive the editor's primary structure video from canonical structureVideos[0].
 * Legacy field migration is handled upstream in data loading hooks.
 */
export function resolvePrimaryStructureVideo(
  structureVideos?: StructureVideoConfigWithMetadata[] | null,
): PrimaryStructureVideo {
  const primary = structureVideos?.[0];

  return {
    path: primary?.path ?? null,
    metadata: primary?.metadata ?? null,
    treatment: primary?.treatment ?? DEFAULT_STRUCTURE_VIDEO.treatment,
    motionStrength: primary?.motion_strength ?? DEFAULT_STRUCTURE_VIDEO.motion_strength,
    structureType: primary?.structure_type ?? DEFAULT_STRUCTURE_VIDEO.structure_type,
    uni3cEndPercent: primary?.uni3c_end_percent ?? DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
  };
}
