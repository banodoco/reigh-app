import { captureVideoFrameBlob } from './captureVideoFrameBlob';

export function extractVideoPosterFrame(videoFile: File): Promise<Blob> {
  return captureVideoFrameBlob({
    source: videoFile,
    resolveSeekTime: () => 0.1,
    onVideoError: () => new Error('Failed to load video'),
  });
}

export function extractVideoFinalFrame(videoFile: File): Promise<Blob> {
  return captureVideoFrameBlob({
    source: videoFile,
    resolveSeekTime: (video) => Math.max(0, video.duration - 0.1),
    onVideoError: () => new Error('Failed to load video'),
  });
}
