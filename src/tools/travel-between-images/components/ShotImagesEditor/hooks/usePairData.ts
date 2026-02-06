/**
 * Hook for computing pair data from shot generations.
 * Pure computation - no side effects, no state management.
 */

import { useMemo } from 'react';
import type { PairData } from '../../Timeline/TimelineContainer';
import type { GenerationRow } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';

export interface UsePairDataProps {
  /** Shot generations (images) */
  shotGenerations: GenerationRow[];
  /** Current generation mode */
  generationMode: 'batch' | 'timeline';
  /** Frame spacing for batch mode */
  batchVideoFrames: number;
}

export interface UsePairDataReturn {
  /** Map of pair index to pair data */
  pairDataByIndex: Map<number, PairData>;
}

/**
 * Helper to read end_frame from image metadata.
 * Returns undefined if not set.
 */
function getEndFrameFromMetadata(metadata: Record<string, unknown> | null | undefined): number | undefined {
  if (!metadata) return undefined;
  const endFrame = metadata.end_frame;
  return typeof endFrame === 'number' ? endFrame : undefined;
}

/**
 * Computes pair data from shot generations.
 * Each pair represents two consecutive images that can generate a video segment.
 *
 * For the last image (or single image), if metadata.end_frame is set, a trailing
 * pair is created with endImage: undefined. This handles both single-image mode
 * and multi-image timelines with a trailing segment.
 */
export function usePairData({
  shotGenerations,
  generationMode,
  batchVideoFrames,
}: UsePairDataProps): UsePairDataReturn {
  return useMemo(() => {
    const dataMap = new Map<number, PairData>();

    // Filter and sort images
    const sortedImages = [...(shotGenerations || [])]
      .filter((img) => img.timeline_frame != null && img.timeline_frame >= 0 && !isVideoAny(img))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    if (sortedImages.length === 0) {
      return { pairDataByIndex: dataMap };
    }

    const isBatchMode = generationMode === 'batch';

    // Build pairs from consecutive images
    for (let pairIndex = 0; pairIndex < sortedImages.length - 1; pairIndex++) {
      const startImage = sortedImages[pairIndex];
      const endImage = sortedImages[pairIndex + 1];

      // Read per-segment overrides from metadata
      const startImageOverrides = readSegmentOverrides(startImage.metadata as Record<string, unknown> | null);
      const pairNumFramesFromMetadata = startImageOverrides.numFrames;

      // Calculate frame positions based on mode
      const startFrame = isBatchMode
        ? pairIndex * batchVideoFrames
        : (startImage.timeline_frame ?? 0);
      const endFrame = isBatchMode
        ? (pairIndex + 1) * batchVideoFrames
        : (endImage.timeline_frame ?? 0);
      const frames = isBatchMode
        ? (pairNumFramesFromMetadata ?? batchVideoFrames)
        : endFrame - startFrame;

      dataMap.set(pairIndex, {
        index: pairIndex,
        frames,
        startFrame,
        endFrame,
        startImage: {
          id: startImage.id,
          generationId: startImage.generation_id,
          primaryVariantId: startImage.primary_variant_id || undefined,
          url: startImage.imageUrl || startImage.location,
          thumbUrl: startImage.thumbUrl || startImage.location,
          position: pairIndex + 1,
        },
        endImage: {
          id: endImage.id,
          generationId: endImage.generation_id,
          primaryVariantId: endImage.primary_variant_id || undefined,
          url: endImage.imageUrl || endImage.location,
          thumbUrl: endImage.thumbUrl || endImage.location,
          position: pairIndex + 2,
        },
      });
    }

    // Check if the last image has an end_frame for a trailing segment
    // This handles both single-image (sortedImages.length === 1) and multi-image trailing segments
    const lastImage = sortedImages[sortedImages.length - 1];
    const lastImageEndFrame = getEndFrameFromMetadata(lastImage.metadata as Record<string, unknown> | null);

    if (lastImageEndFrame !== undefined) {
      const trailingPairIndex = sortedImages.length - 1;
      const startFrame = isBatchMode
        ? trailingPairIndex * batchVideoFrames
        : (lastImage.timeline_frame ?? 0);

      // Read numFrames override for batch mode
      const lastImageOverrides = readSegmentOverrides(lastImage.metadata as Record<string, unknown> | null);
      const trailingNumFrames = lastImageOverrides.numFrames;

      const frames = isBatchMode
        ? (trailingNumFrames ?? batchVideoFrames)
        : lastImageEndFrame - startFrame;

      dataMap.set(trailingPairIndex, {
        index: trailingPairIndex,
        frames,
        startFrame,
        endFrame: lastImageEndFrame,
        startImage: {
          id: lastImage.id,
          generationId: lastImage.generation_id,
          primaryVariantId: lastImage.primary_variant_id || undefined,
          url: lastImage.imageUrl || lastImage.location,
          thumbUrl: lastImage.thumbUrl || lastImage.location,
          position: trailingPairIndex + 1,
        },
        endImage: undefined,
      });
    }

    return { pairDataByIndex: dataMap };
  }, [shotGenerations, generationMode, batchVideoFrames]);
}
