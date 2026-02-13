import { useCallback } from 'react';
import type { GenerationRow } from '@/types/shots';
import type { PairData } from '../TimelineContainer/types';
import type { getPairInfo } from '../utils/timeline-utils';

interface UsePairSettingsHandlerProps {
  images: GenerationRow[];
  imagePositions: Map<string, number>;
  trailingEndFrame: number | undefined;
  pairInfo: ReturnType<typeof getPairInfo>;
  pairDataByIndex: Map<number, PairData>;
  onPairClick?: (pairIndex: number, pairData: PairData) => void;
}

/**
 * usePairSettingsHandler - Builds the pair click handler for SegmentOutputStrip
 * and TrailingEndpoint components.
 *
 * Handles three cases:
 * 1. Single-image mode (trailing segment is the only segment)
 * 2. Multi-image trailing segment (after all regular pairs)
 * 3. Regular pair segments
 */
export function usePairSettingsHandler({
  images,
  imagePositions,
  trailingEndFrame,
  pairInfo,
  pairDataByIndex,
  onPairClick,
}: UsePairSettingsHandlerProps) {
  const handleOpenPairSettings = useCallback((pairIndex: number, passedFrameData?: { frames: number; startFrame: number; endFrame: number }) => {

    if (!onPairClick) return;

    // Handle single-image mode (trailing segment is the only segment)
    if (images.length === 1 && trailingEndFrame !== undefined) {
      const entry = [...imagePositions.entries()][0];
      if (entry) {
        const [imageId, imageFrame] = entry;
        const image = images[0];
        const frames = passedFrameData?.frames ?? (trailingEndFrame - imageFrame);
        const startFrame = passedFrameData?.startFrame ?? imageFrame;
        const endFrame = passedFrameData?.endFrame ?? trailingEndFrame;
        onPairClick(pairIndex, {
          index: 0,
          frames,
          startFrame,
          endFrame,
          startImage: {
            id: imageId,
            generationId: image.generation_id,
            url: image.imageUrl || image.thumbUrl,
            thumbUrl: image.thumbUrl,
            position: 1,
          },
          endImage: null,
        });
      }
      return;
    }

    // Handle multi-image trailing segment (pairIndex is after all regular pairs)
    if (pairIndex === pairInfo.length && trailingEndFrame !== undefined && imagePositions.size > 0) {
      const sortedEntries = [...imagePositions.entries()].sort((a, b) => a[1] - b[1]);
      const lastEntry = sortedEntries[sortedEntries.length - 1];
      if (lastEntry) {
        const [imageId, imageFrame] = lastEntry;
        const lastImage = images.find(img => {
          const imgId = img.shot_generation_id || img.id;
          return imgId === imageId;
        }) || images[images.length - 1];

        const defaultOffset = 9; // Same as multi-image default
        const effectiveEndFrame = trailingEndFrame ?? (imageFrame + defaultOffset);
        const frames = passedFrameData?.frames ?? (effectiveEndFrame - imageFrame);
        const startFrame = passedFrameData?.startFrame ?? imageFrame;
        const endFrame = passedFrameData?.endFrame ?? effectiveEndFrame;

        const pairData = {
          index: pairIndex,
          frames,
          startFrame,
          endFrame,
          startImage: lastImage ? {
            id: imageId,
            generationId: lastImage.generation_id,
            url: lastImage.imageUrl || lastImage.thumbUrl,
            thumbUrl: lastImage.thumbUrl,
            position: sortedEntries.length,
          } : null,
          endImage: null,
        };
        onPairClick(pairIndex, pairData);
      }
      return;
    }

    const pairData = pairDataByIndex.get(pairIndex);
    const frameData = passedFrameData ?? pairInfo[pairIndex];
    if (frameData) {
      const mergedPairData = {
        index: pairIndex,
        frames: frameData.frames,
        startFrame: frameData.startFrame,
        endFrame: frameData.endFrame,
        startImage: pairData?.startImage ?? null,
        endImage: pairData?.endImage ?? null,
      };
      onPairClick(pairIndex, mergedPairData);
    } else if (pairData) {
      onPairClick(pairIndex, pairData);
    }
  }, [onPairClick, images, trailingEndFrame, pairDataByIndex, pairInfo, imagePositions]);

  return { handleOpenPairSettings };
}
