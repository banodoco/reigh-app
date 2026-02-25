import type { GenerationRow } from '@/domains/generation/types/generationViewRow';
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
