import type { VideoMetadata } from '@/shared/lib/media/videoUploader';

export interface BatchGuidanceVideoProps {
  shotId: string;
  projectId: string;
  videoUrl: string | null;
  videoMetadata: VideoMetadata | null;
  treatment: 'adjust' | 'clip';
  motionStrength: number;
  structureType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  onVideoUploaded: (videoUrl: string | null, metadata: VideoMetadata | null, resourceId?: string) => void;
  onTreatmentChange: (treatment: 'adjust' | 'clip') => void;
  onMotionStrengthChange: (strength: number) => void;
  onStructureTypeChange?: (type: 'uni3c' | 'flow' | 'canny' | 'depth') => void;
  uni3cEndPercent?: number;
  onUni3cEndPercentChange?: (value: number) => void;
  imageCount?: number;
  timelineFramePositions?: number[];
  readOnly?: boolean;
  hideStructureSettings?: boolean;
}
