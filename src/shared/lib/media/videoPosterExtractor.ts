/**
 * Utility for extracting poster images (first frame) from video files
 */

import { captureVideoFrameBlob } from './captureVideoFrameBlob';

/**
 * Extract the first frame of a video as a Blob
 * @param videoFile The video file to extract from
 * @returns Promise that resolves to a Blob of the poster image (JPEG)
 */
export function extractVideoPosterFrame(videoFile: File): Promise<Blob> {
  return captureVideoFrameBlob({
    source: videoFile,
    resolveSeekTime: () => 0.1,
    onVideoError: () => new Error('Failed to load video'),
  });
}

/**
 * Extract the final frame of a video as a Blob
 * @param videoFile The video file to extract from
 * @returns Promise that resolves to a Blob of the final frame image (JPEG)
 */
export function extractVideoFinalFrame(videoFile: File): Promise<Blob> {
  return captureVideoFrameBlob({
    source: videoFile,
    resolveSeekTime: (video) => Math.max(0, video.duration - 0.1),
    onVideoError: () => new Error('Failed to load video'),
  });
}
