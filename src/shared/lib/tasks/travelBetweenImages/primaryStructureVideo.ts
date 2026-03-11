import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import { resolveStructureGuidanceControls } from '@/shared/lib/tasks/structureGuidance';
import { DEFAULT_STRUCTURE_VIDEO } from './defaults';
import type {
  StructureGuidanceConfig,
  StructureVideoConfigWithLegacyGuidance,
  StructureVideoConfigWithMetadata,
} from './index';

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
  structureGuidance?: StructureGuidanceConfig | null,
): PrimaryStructureVideo {
  const primary = structureVideos?.[0] as StructureVideoConfigWithLegacyGuidance | undefined;
  const controls = structureGuidance
    ? resolveStructureGuidanceControls(structureGuidance, {
        defaultStructureType: DEFAULT_STRUCTURE_VIDEO.structure_type,
        defaultMotionStrength: DEFAULT_STRUCTURE_VIDEO.motion_strength,
        defaultUni3cEndPercent: DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
      })
    : null;

  return {
    path: primary?.path ?? null,
    metadata: primary?.metadata ?? null,
    treatment: primary?.treatment ?? DEFAULT_STRUCTURE_VIDEO.treatment,
    motionStrength: controls?.motionStrength ?? primary?.motion_strength ?? DEFAULT_STRUCTURE_VIDEO.motion_strength,
    structureType: controls?.structureType ?? primary?.structure_type ?? DEFAULT_STRUCTURE_VIDEO.structure_type,
    uni3cEndPercent: controls?.uni3cEndPercent ?? primary?.uni3c_end_percent ?? DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
  };
}
