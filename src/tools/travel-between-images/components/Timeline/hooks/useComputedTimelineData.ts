import { useMemo } from 'react';
import { getPairInfo, TRAILING_ENDPOINT_KEY } from '../utils/timeline-utils';
import { TIMELINE_PADDING_OFFSET } from '../constants';
import type { GenerationRow } from '@/domains/generation/types';
import type { PairData } from '../TimelineContainer/types';

interface UseComputedTimelineDataProps {
  currentPositions: Map<string, number>;
  images: GenerationRow[];

  containerWidth: number;
  fullRange: number;
  zoomLevel: number;
}

interface UseComputedTimelineDataReturn {
  pairInfo: ReturnType<typeof getPairInfo>;
  pairDataByIndex: Map<number, PairData>;
  localShotGenPositions: Map<string, number>;
  showPairLabels: boolean;
}

export function useComputedTimelineData({
  currentPositions,
  images,

  containerWidth,
  fullRange,
  zoomLevel,
}: UseComputedTimelineDataProps): UseComputedTimelineDataReturn {
  const pairInfo = useMemo(() => getPairInfo(currentPositions), [currentPositions]);

  // Image-only positions (excluding trailing endpoint key)
  const imageOnlyPositions = useMemo(() => {
    const filtered = new Map(currentPositions);
    filtered.delete(TRAILING_ENDPOINT_KEY);
    return filtered;
  }, [currentPositions]);

  // Compute shot_generation_id -> position index map
  const localShotGenPositions = useMemo(() => {
    const posMap = new Map<string, number>();
    const sortedEntries = [...imageOnlyPositions.entries()].sort((a, b) => a[1] - b[1]);
    sortedEntries.forEach(([shotGenId], index) => {
      posMap.set(shotGenId, index);
    });
    return posMap;
  }, [imageOnlyPositions]);

  // Compute full pair data for each pair index
  const pairDataByIndex = useMemo(() => {
    const dataMap = new Map<number, PairData>();
    const sortedEntries = [...imageOnlyPositions.entries()].sort((a, b) => a[1] - b[1]);
    for (let pairIndex = 0; pairIndex < sortedEntries.length - 1; pairIndex++) {
      const [startId, startFrame] = sortedEntries[pairIndex];
      const [endId, endFrame] = sortedEntries[pairIndex + 1];
      const startImage = images.find(img => img.id === startId);
      const endImage = images.find(img => img.id === endId);
      dataMap.set(pairIndex, {
        index: pairIndex,
        frames: endFrame - startFrame,
        startFrame,
        endFrame,
        startImage: startImage ? {
          id: startImage.id,
          generationId: startImage.generation_id,
          url: startImage.imageUrl || startImage.thumbUrl,
          thumbUrl: startImage.thumbUrl,
          position: pairIndex + 1,
        } : null,
        endImage: endImage ? {
          id: endImage.id,
          generationId: endImage.generation_id,
          url: endImage.imageUrl || endImage.thumbUrl,
          thumbUrl: endImage.thumbUrl,
          position: pairIndex + 2,
        } : null,
      });
    }
    return dataMap;
  }, [imageOnlyPositions, images]);

  // Calculate whether to show pair labels
  const showPairLabels = useMemo(() => {
    if (images.length < 2) return false;
    const sortedPositions = [...imageOnlyPositions.entries()].sort((a, b) => a[1] - b[1]);
    let totalPairWidth = 0;
    let pairCount = 0;
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      const [, startFrame] = sortedPositions[i];
      const [, endFrame] = sortedPositions[i + 1];
      const frameWidth = endFrame - startFrame;
      const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
      const pixelWidth = (frameWidth / fullRange) * effectiveWidth * zoomLevel;
      totalPairWidth += pixelWidth;
      pairCount++;
    }
    const avgPairWidth = pairCount > 0 ? totalPairWidth / pairCount : 0;
    return avgPairWidth >= 100;
  }, [images.length, imageOnlyPositions, containerWidth, fullRange, zoomLevel]);

  return {
    pairInfo,
    pairDataByIndex,
    localShotGenPositions,
    showPairLabels,
  };
}
