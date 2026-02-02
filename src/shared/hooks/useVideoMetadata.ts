import { useState, useEffect } from 'react';
import { VideoMetadata, extractVideoMetadataFromUrl } from '@/shared/lib/videoUploader';

interface UseVideoMetadataOptions {
  /** Callback when metadata is extracted (e.g., to save to database) */
  onExtracted?: (metadata: VideoMetadata) => void;
}

/**
 * Hook that provides video metadata, extracting it from the URL if not provided.
 *
 * @param videoUrl - URL of the video
 * @param providedMetadata - Pre-existing metadata (if available)
 * @param options - Optional callbacks
 * @returns { metadata, isExtracting }
 *
 * @example
 * const { metadata, isExtracting } = useVideoMetadata(videoUrl, existingMetadata, {
 *   onExtracted: (m) => saveToDatabase(m),
 * });
 */
export function useVideoMetadata(
  videoUrl: string,
  providedMetadata: VideoMetadata | null,
  options: UseVideoMetadataOptions = {}
) {
  const { onExtracted } = options;

  const [extractedMetadata, setExtractedMetadata] = useState<VideoMetadata | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Use provided metadata or extracted metadata
  const metadata = providedMetadata || extractedMetadata;

  // Extract metadata from URL if not provided
  useEffect(() => {
    if (!providedMetadata && !isExtracting && !extractedMetadata) {
      setIsExtracting(true);
      console.log('[useVideoMetadata] Extracting metadata from URL:', videoUrl.substring(0, 100) + '...');

      extractVideoMetadataFromUrl(videoUrl)
        .then((meta) => {
          console.log('[useVideoMetadata] Metadata extracted:', {
            duration: meta.duration_seconds,
            frameRate: meta.frame_rate,
            totalFrames: meta.total_frames,
            dimensions: `${meta.width}x${meta.height}`,
          });
          setExtractedMetadata(meta);

          if (onExtracted) {
            onExtracted(meta);
          }
        })
        .catch((error) => {
          console.error('[useVideoMetadata] Failed to extract metadata:', error);
        })
        .finally(() => {
          setIsExtracting(false);
        });
    }
  }, [videoUrl, providedMetadata, isExtracting, extractedMetadata, onExtracted]);

  return { metadata, isExtracting };
}
