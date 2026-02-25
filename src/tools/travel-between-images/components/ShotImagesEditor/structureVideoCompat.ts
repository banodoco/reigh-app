import type { VideoMetadata } from '@/shared/lib/videoUploader';
import {
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
  type StructureVideoConfigWithMetadata,
} from '@/shared/lib/tasks/travelBetweenImages';

export interface PrimaryStructureVideoState {
  path: string | null;
  metadata: VideoMetadata | null;
  treatment: 'adjust' | 'clip';
  motionStrength: number;
  structureType: 'uni3c' | 'flow' | 'canny' | 'depth';
  uni3cEndPercent: number;
}

interface StructureVideoArrayActions {
  setStructureVideos?: (videos: StructureVideoConfigWithMetadata[]) => void;
  updateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
}

function createPrimaryStructureVideo(
  current: StructureVideoConfigWithMetadata | undefined,
  next: {
    videoPath: string;
    metadata: VideoMetadata | null;
    treatment: 'adjust' | 'clip';
    motionStrength: number;
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth';
    resourceId?: string;
  },
): StructureVideoConfigWithMetadata {
  return {
    path: next.videoPath,
    start_frame: current?.start_frame ?? 0,
    end_frame: current?.end_frame ?? 81,
    treatment: next.treatment,
    motion_strength: next.motionStrength,
    structure_type: next.structureType,
    uni3c_end_percent: current?.uni3c_end_percent ?? 0.1,
    metadata: next.metadata ?? null,
    resource_id: next.resourceId ?? current?.resource_id ?? null,
  };
}

export function getPrimaryStructureVideoState(
  structureVideos: StructureVideoConfigWithMetadata[] | undefined,
): PrimaryStructureVideoState {
  const primary = structureVideos?.[0];

  return {
    path: primary?.path ?? null,
    metadata: primary?.metadata ?? null,
    treatment: primary?.treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    motionStrength: primary?.motion_strength ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength,
    structureType: primary?.structure_type ?? 'uni3c',
    uni3cEndPercent: primary?.uni3c_end_percent ?? 0.1,
  };
}

export function applyPrimaryStructureVideoInput(
  structureVideos: StructureVideoConfigWithMetadata[] | undefined,
  actions: StructureVideoArrayActions,
  next: {
    videoPath: string | null;
    metadata: VideoMetadata | null;
    treatment: 'adjust' | 'clip';
    motionStrength: number;
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth';
    resourceId?: string;
  },
): void {
  if (!actions.setStructureVideos) {
    return;
  }

  if (!next.videoPath) {
    actions.setStructureVideos([]);
    return;
  }

  const currentPrimary = structureVideos?.[0];
  const nextPrimary = createPrimaryStructureVideo(currentPrimary, {
    videoPath: next.videoPath,
    metadata: next.metadata,
    treatment: next.treatment,
    motionStrength: next.motionStrength,
    structureType: next.structureType,
    resourceId: next.resourceId,
  });

  if (!structureVideos || structureVideos.length === 0) {
    actions.setStructureVideos([nextPrimary]);
    return;
  }

  actions.setStructureVideos([nextPrimary, ...structureVideos.slice(1)]);
}

export function updatePrimaryUni3cEndPercent(
  structureVideos: StructureVideoConfigWithMetadata[] | undefined,
  actions: StructureVideoArrayActions,
  value: number,
): void {
  if (actions.updateStructureVideo) {
    actions.updateStructureVideo(0, { uni3c_end_percent: value });
    return;
  }

  if (!actions.setStructureVideos || !structureVideos || structureVideos.length === 0) {
    return;
  }

  const [first, ...rest] = structureVideos;
  actions.setStructureVideos([{ ...first, uni3c_end_percent: value }, ...rest]);
}

