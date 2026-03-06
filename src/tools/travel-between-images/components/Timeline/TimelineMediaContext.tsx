/**
 * TimelineMediaContext — passes structure video + audio props from
 * ShotImagesEditor straight to TimelineContainer, skipping Timeline.
 */

import { createContext, useContext } from 'react';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';
import type { PrimaryStructureVideo, StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

export interface TimelineMediaContextValue {
  primaryStructureVideo: PrimaryStructureVideo;
  onPrimaryStructureVideoInputChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  // Structure video — canonical multi-video contract
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
