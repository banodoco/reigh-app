export {
  calculateGapFramesFromRange,
  getDefaultSelectionRange,
  getNewSelectionRange,
  quantizeGapFrameCount,
  validatePortionSelections,
} from '@/shared/lib/video/replaceSelectionMath';
export {
  selectionsToFrameRanges,
  calculateMaxContextFrames,
  capContextFrameCountForRanges,
} from '@/shared/lib/video/replaceFrameRanges';
export type { ReplaceFrameRangeSelection } from '@/shared/lib/video/replaceFrameRanges';
