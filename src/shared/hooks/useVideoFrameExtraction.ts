import { useState, useEffect } from 'react';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { extractFramesFromVideo } from './videoFrameExtraction/extractor';

interface UseVideoFrameExtractionOptions {
  metadata: VideoMetadata | null;
  treatment: 'adjust' | 'clip';
  sourceRange: { start: number; end: number };
  outputFrameCount: number;
  maxFrames?: number;
  skip?: boolean;
  quality?: number;
}

interface UseVideoFrameExtractionReturn {
  frames: string[];
  isExtracting: boolean;
  isReady: boolean;
}

export function useVideoFrameExtraction(
  videoUrl: string,
  options: UseVideoFrameExtractionOptions,
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

  useEffect(() => {
    if (skip || !metadata) {
      return;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;
    video.load();

    const runExtraction = async () => {
      setIsExtracting(true);

      try {
        await extractFramesFromVideo({
          video,
          metadata,
          treatment,
          sourceRange: {
            start: sourceRange.start,
            end: sourceRange.end,
          },
          outputFrameCount,
          maxFrames,
          quality,
          onPartialFrames: (partialFrames) => {
            if (!isCancelled()) {
              setFrames(partialFrames);
            }
          },
          onReady: () => {
            if (!isCancelled()) {
              setIsReady(true);
            }
          },
          isCancelled,
        });
      } catch (error) {
        handleError(error, { context: 'useVideoFrameExtraction', showToast: false });
      } finally {
        if (!isCancelled()) {
          setIsExtracting(false);
        }
      }
    };

    void runExtraction();

    return () => {
      cancelled = true;
      video.src = '';
    };
  }, [videoUrl, metadata, treatment, sourceRange.start, sourceRange.end, outputFrameCount, maxFrames, skip, quality]);

  return { frames, isExtracting, isReady };
}
