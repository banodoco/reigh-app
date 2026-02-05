/**
 * Preloading System
 *
 * Unified module for all image preloading functionality.
 *
 * Usage:
 *   import { preloadingService, PRIORITY, hasLoadedImage } from '@/shared/lib/preloading';
 *
 *   // Preload images
 *   preloadingService.preloadImages(images, PRIORITY.high);
 *
 *   // Check if image is loaded
 *   if (hasLoadedImage(image)) { ... }
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  PreloadableImage,
  PreloadConfig,
  TrackerLimits,
  PriorityLevel,
  TrackableImage,
  PreloadingServiceState,
  PreloadingEventType,
  PreloadingEvent,
  PreloadingSubscriber,
} from './types';

export { PRIORITY } from './types';

// Legacy alias (used by useAdjacentPagePreloader)
export { PRIORITY as PRIORITY_VALUES } from './types';

// =============================================================================
// SERVICE (main API)
// =============================================================================

export { preloadingService } from './service';

// =============================================================================
// TRACKER (for direct access when needed)
// =============================================================================

export {
  hasLoadedImage,
  markImageLoaded,
  setImageLoadStatus,
  clearLoadedImages,
  clearAllLoadedImages,
  getLoadTrackerStats,
  getImageElement,
} from './tracker';

// =============================================================================
// PRELOADER (for direct use)
// =============================================================================

export { preloadImages } from './preloader';
