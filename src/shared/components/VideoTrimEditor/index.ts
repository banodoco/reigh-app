/**
 * VideoTrimEditor Module
 *
 * Provides video trimming functionality for segment videos.
 * Uses server-side Edge Function (trim-video) for MP4 conversion with proper duration metadata.
 *
 * Usage:
 * ```tsx
 * import { useVideoTrimming, useTrimSave } from '@/shared/components/VideoTrimEditor';
 * import { TrimControlsPanel } from '@/shared/components/VideoTrimEditor';
 * ```
 */

// Re-export hooks
export * from './hooks';

// Re-export components
export * from './components';

// Re-export types
export * from './types';
