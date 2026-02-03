/**
 * ShotImagesEditor hooks barrel.
 */

// UI state hooks
export { useLightboxTransition } from './useLightboxTransition';
export type { UseLightboxTransitionReturn } from './useLightboxTransition';

export { useSegmentSlotMode } from './useSegmentSlotMode';
export type { UseSegmentSlotModeReturn, UseSegmentSlotModeProps } from './useSegmentSlotMode';

// Data hooks
export { useShotGenerationsData } from './useShotGenerationsData';
export type { UseShotGenerationsDataReturn, UseShotGenerationsDataProps } from './useShotGenerationsData';

export { usePreviewSegments } from './usePreviewSegments';
export type { UsePreviewSegmentsReturn } from './usePreviewSegments';

// Feature hooks
export { useDownloadImages } from './useDownloadImages';
export type { UseDownloadImagesReturn } from './useDownloadImages';

export { useSmoothContinuations } from './useSmoothContinuations';

// Note: usePairData and useFrameCountUpdater are internal - used by useSegmentSlotMode
