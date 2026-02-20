export interface PreviewSegment {
  hasVideo: boolean;
  videoUrl: string | null;
  thumbUrl: string | null;
  startImageUrl: string | null;
  endImageUrl: string | null;
  index: number;
  durationFromFrames: number;
}
