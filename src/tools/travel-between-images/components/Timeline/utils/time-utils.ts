/**
 * Video Time/Frame Utilities
 *
 * Re-exports from shared/lib/videoUtils.ts for backwards compatibility.
 * The actual implementation has been moved to shared/ as these utilities
 * are used across multiple tools and shared components.
 */

export {
  isValidFrameCount,
  quantizeFrameCount,
  getValidFrameCounts,
  quantizeGap,
  framesToSeconds,
} from '@/shared/lib/media/videoUtils';
