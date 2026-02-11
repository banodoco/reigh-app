/**
 * TimelineMediaContext — passes structure video + audio props from
 * ShotImagesEditor straight to TimelineContainer, skipping Timeline.
 */

import { createContext, useContext } from 'react';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

export interface TimelineMediaContextValue {
  // Structure video — legacy single-video
  structureVideoPath?: string | null;
  structureVideoMetadata?: VideoMetadata | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  // Structure video — multi-video array
  structureVideos?: StructureVideoConfigWithMetadata[];
  isStructureVideoLoading?: boolean;
  cachedHasStructureVideo?: boolean;
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  // Audio
  audioUrl?: string | null;
  audioMetadata?: { duration: number; name?: string } | null;
  onAudioChange?: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null
  ) => void;
}

const TimelineMediaContext = createContext<TimelineMediaContextValue | null>(null);

export const TimelineMediaProvider = TimelineMediaContext.Provider;

export function useTimelineMedia(): TimelineMediaContextValue {
  const ctx = useContext(TimelineMediaContext);
  if (!ctx) throw new Error('useTimelineMedia must be used within a TimelineMediaProvider');
  return ctx;
}
