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
// CONSTANTS
// =============================================================================

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
  getImageElement,
} from './tracker';
