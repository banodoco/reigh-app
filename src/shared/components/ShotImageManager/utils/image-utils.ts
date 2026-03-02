import type { GenerationRow } from '@/domains/generation/types';
import {
  calculateFrameForIndex,
  extractExistingFrames,
} from '@/shared/lib/timelinePositionCalculator';
import { getProjectAspectRatioStyle } from '@/shared/lib/imageAspectRatio';

export const getFramePositionForIndex = (
  index: number,
  currentImages: GenerationRow[],
  batchVideoFrames: number
): number | undefined => {
  const existingFrames = extractExistingFrames(currentImages);
  return calculateFrameForIndex(index, existingFrames, batchVideoFrames);
};

/**
 * Resolve the timeline frame used for duplication.
 * Prefers the persisted timeline frame; falls back to normalized index spacing.
 */
export const resolveDuplicateFrame = (
  image: Pick<GenerationRow, 'timeline_frame'>,
  index: number,
  batchVideoFrames: number,
): number | undefined => {
  if (
    typeof image.timeline_frame === 'number'
    && Number.isFinite(image.timeline_frame)
    && image.timeline_frame >= 0
  ) {
    return image.timeline_frame;
  }

  if (!Number.isFinite(batchVideoFrames) || batchVideoFrames <= 0) {
    return undefined;
  }

  return index * batchVideoFrames;
};

export const getImageRange = (
  startIndex: number,
  endIndex: number,
  currentImages: GenerationRow[]
): string[] => {
  const minIndex = Math.min(startIndex, endIndex);
  const maxIndex = Math.max(startIndex, endIndex);
  const rangeIds: string[] = [];
  
  for (let i = minIndex; i <= maxIndex; i++) {
    if (currentImages[i]) {
      rangeIds.push(currentImages[i].id);
    }
  }
  
  return rangeIds;
};

export const getAspectRatioStyle = getProjectAspectRatioStyle;
