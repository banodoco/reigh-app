import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import { DEFAULT_STRUCTURE_VIDEO } from '@/shared/lib/tasks/travelBetweenImages';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

export interface LegacyPrimaryStructureVideoFields {
  primaryStructureVideoPath?: string | null;
  primaryStructureVideoMetadata?: VideoMetadata | null;
  primaryStructureVideoTreatment?: 'adjust' | 'clip';
  primaryStructureVideoMotionStrength?: number;
  primaryStructureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  primaryStructureVideoUni3cEndPercent?: number;
}

export interface ResolvedPrimaryStructureVideo {
  path: string | null;
  metadata: VideoMetadata | null;
  treatment: 'adjust' | 'clip';
  motionStrength: number;
  structureType: 'uni3c' | 'flow' | 'canny' | 'depth';
  uni3cEndPercent: number;
}

interface ResolvePrimaryStructureVideoParams extends LegacyPrimaryStructureVideoFields {
  structureVideos?: StructureVideoConfigWithMetadata[];
}

export function resolvePrimaryStructureVideo({
  structureVideos,
  primaryStructureVideoPath,
  primaryStructureVideoMetadata,
  primaryStructureVideoTreatment,
  primaryStructureVideoMotionStrength,
  primaryStructureVideoType,
  primaryStructureVideoUni3cEndPercent,
}: ResolvePrimaryStructureVideoParams): ResolvedPrimaryStructureVideo {
  const primaryFromArray = structureVideos?.[0];

  return {
    path: primaryFromArray?.path ?? primaryStructureVideoPath ?? null,
    metadata: primaryFromArray?.metadata ?? primaryStructureVideoMetadata ?? null,
    treatment: primaryFromArray?.treatment
      ?? primaryStructureVideoTreatment
      ?? DEFAULT_STRUCTURE_VIDEO.treatment,
    motionStrength: primaryFromArray?.motion_strength
      ?? primaryStructureVideoMotionStrength
      ?? DEFAULT_STRUCTURE_VIDEO.motion_strength,
    structureType: primaryFromArray?.structure_type
      ?? primaryStructureVideoType
      ?? DEFAULT_STRUCTURE_VIDEO.structure_type,
    uni3cEndPercent: primaryFromArray?.uni3c_end_percent
      ?? primaryStructureVideoUni3cEndPercent
      ?? DEFAULT_STRUCTURE_VIDEO.uni3c_end_percent,
  };
}
