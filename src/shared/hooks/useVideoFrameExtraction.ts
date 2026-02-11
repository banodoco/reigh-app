import { useState, useEffect, useRef } from 'react';
import { VideoMetadata } from '@/shared/lib/videoUploader';
import { handleError } from '@/shared/lib/errorHandler';

interface UseVideoFrameExtractionOptions {
  /** Video metadata (required for extraction) */
  metadata: VideoMetadata | null;
  /** Treatment mode affects how frames are sampled */
  treatment: 'adjust' | 'clip';
  /** Source frame range within the video */
  sourceRange: { start: number; end: number };
  /** Number of output frames (used for adjust mode sampling) */
  outputFrameCount: number;
  /** Maximum frames to extract (default: 80) */
  maxFrames?: number;
  /** Skip extraction (e.g., during drag) */
  skip?: boolean;
  /** JPEG quality for extracted frames (0-1, default: 0.6) */
  quality?: number;
}

interface UseVideoFrameExtractionReturn {
  /** Extracted frame data URLs */
  frames: string[];
  /** Whether extraction is in progress */
  isExtracting: boolean;
  /** Whether frames are ready to display */
  isReady: boolean;
}

/**
 * Hook that extracts frames from a video URL as thumbnail images.
 *
 * Creates its own internal video element for extraction, separate from
 * any video elements used for playback/preview.
 *
 * @example
 * const { frames, isExtracting, isReady } = useVideoFrameExtraction(videoUrl, {
 *   metadata: effectiveMetadata,
 *   treatment: 'adjust',
 *   sourceRange: { start: 0, end: 100 },
 *   outputFrameCount: 90,
 *   skip: isDragging,
 * });
 */
export function useVideoFrameExtraction(
  videoUrl: string,
  options: UseVideoFrameExtractionOptions
): UseVideoFrameExtractionReturn {
  const {
    metadata,
    treatment,
    sourceRange,
    outputFrameCount,
    maxFrames = 80,
    skip = false,
    quality = 0.6,
  } = options;

  const [frames, setFrames] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const sourceFrameCount = Math.max(0, sourceRange.end - sourceRange.start);

  useEffect(() => {
    // Skip if disabled or no metadata
    if (skip) return;
    if (!metadata) return;

    // Cancellation flag — set by cleanup when deps change or unmount.
    // The async extraction checks this after every await to bail out early,
    // preventing stale extractions from fighting over the video element.
    let cancelled = false;

    // Each extraction gets its OWN video element so concurrent/overlapping
    // extractions (from rapid dep changes) don't clobber each other's seeks.
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;
    video.load();

    const extractFrames = async () => {
      setIsExtracting(true);

      // Wait for video to be ready
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const handleCanPlay = () => {
            video.removeEventListener('canplay', handleCanPlay);
            resolve();
          };
          video.addEventListener('canplay', handleCanPlay);
          setTimeout(() => {
            video.removeEventListener('canplay', handleCanPlay);
            resolve();
          }, 3000);
        });
        if (cancelled) return;
      }

      // Validate video actually loaded (has dimensions)
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.error('[useVideoFrameExtraction] Video did not load properly - dimensions are 0');
        if (!cancelled) setIsExtracting(false);
        return;
      }

      try {
        // Calculate number of frames to extract
        const numThumbnails = treatment === 'adjust'
          ? Math.min(outputFrameCount, maxFrames)
          : Math.min(sourceFrameCount, maxFrames);
        const numFrames = Math.max(1, numThumbnails);

        // Validate inputs
        if (!metadata.total_frames || metadata.total_frames < 1) {
          console.error('[useVideoFrameExtraction] Invalid total_frames:', metadata.total_frames);
          if (!cancelled) setIsExtracting(false);
          return;
        }

        if (!metadata.frame_rate || metadata.frame_rate <= 0 || !isFinite(metadata.frame_rate)) {
          console.error('[useVideoFrameExtraction] Invalid frame_rate:', metadata.frame_rate);
          if (!cancelled) setIsExtracting(false);
          return;
        }

        // Set up canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          console.error('[useVideoFrameExtraction] Failed to get canvas context');
          if (!cancelled) setIsExtracting(false);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const extractedFrames: string[] = [];
        const FLUSH_INTERVAL = 8;

        // Extract frames
        for (let i = 0; i < numFrames; i++) {
          if (cancelled) return;

          let frameIndex: number;

          if (numFrames === 1) {
            frameIndex = sourceRange.start;
          } else if (treatment === 'adjust') {
            // Sample evenly across source range
            frameIndex = sourceRange.start + Math.floor((i / (numFrames - 1)) * (sourceFrameCount - 1));
          } else {
            // Clip mode: 1:1 mapping
            const sourcePosition = (i / (numFrames - 1)) * (sourceFrameCount - 1);
            frameIndex = sourceRange.start + Math.floor(sourcePosition);
          }

          // Clamp to valid range
          frameIndex = Math.max(sourceRange.start, Math.min(frameIndex, sourceRange.end - 1));

          if (!isFinite(frameIndex) || frameIndex < 0) {
            console.error('[useVideoFrameExtraction] Invalid frameIndex:', frameIndex);
            throw new Error(`Invalid frame index: ${frameIndex}`);
          }

          const timeInSeconds = frameIndex / metadata.frame_rate;
          if (!isFinite(timeInSeconds) || timeInSeconds < 0) {
            throw new Error(`Invalid time value: ${timeInSeconds}`);
          }

          // Seek to frame
          video.currentTime = timeInSeconds;

          // Wait for seek
          await new Promise<void>((resolve) => {
            const handleSeeked = () => {
              video.removeEventListener('seeked', handleSeeked);
              resolve();
            };
            video.addEventListener('seeked', handleSeeked);
            setTimeout(() => {
              video.removeEventListener('seeked', handleSeeked);
              resolve();
            }, 1000);
          });

          if (cancelled) return;

          // Draw and capture frame
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          extractedFrames.push(dataUrl);

          // Log first frame details to verify data URL validity
          if (i === 0) {
            console.log('[FrameExtraction] First frame captured', {
              dataUrlLength: dataUrl.length,
              prefix: dataUrl.substring(0, 40),
              canvasSize: `${canvas.width}x${canvas.height}`,
              videoSize: `${video.videoWidth}x${video.videoHeight}`,
              videoReadyState: video.readyState,
              videoCurrentTime: video.currentTime.toFixed(3),
            });
          }

          // Flush frames progressively: after first frame, then every FLUSH_INTERVAL
          if (i === 0 || (i + 1) % FLUSH_INTERVAL === 0) {
            setFrames([...extractedFrames]);
            setIsReady(true);
          }
        }

        // Final flush with all frames
        if (!cancelled && extractedFrames.length > 0) {
          setFrames(extractedFrames);
          setIsReady(true);
        }
        if (!cancelled) setIsExtracting(false);
      } catch (error) {
        handleError(error, { context: 'useVideoFrameExtraction', showToast: false });
        if (!cancelled) setIsExtracting(false);
      }
    };

    if (video.readyState >= 2) {
      extractFrames();
    } else {
      const handleLoadedMetadata = () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        if (!cancelled) extractFrames();
      };

      const handleVideoError = (_e: Event) => {
        handleError(new Error('Video load error'), { context: 'useVideoFrameExtraction:videoLoad', showToast: false });
        if (!cancelled) {
          setIsReady(false);
          setIsExtracting(false);
        }
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('error', handleVideoError);
    }

    return () => {
      cancelled = true;
      // Stop the video element to free resources
      video.src = '';
    };
  }, [videoUrl, metadata, treatment, sourceRange.start, sourceRange.end, outputFrameCount, sourceFrameCount, maxFrames, skip, quality]);

  return { frames, isExtracting, isReady };
}
