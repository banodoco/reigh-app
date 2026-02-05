/**
 * Preloading System Types
 */

export interface PreloadableImage {
  id?: string;
  url?: string;
  thumbUrl?: string;
  location?: string;
  thumbnail_url?: string;
}

export interface PreloadConfig {
  /** Max concurrent image loads */
  maxConcurrent: number;
  /** Debounce delay before starting preload (ms) */
  debounceMs: number;
  /** Max images to preload per page */
  maxImagesPerPage: number;
  /** Only preload thumbnails (not full images) */
  preloadThumbnailsOnly: boolean;
}

export interface TrackerLimits {
  /** Max images to track by ID */
  maxImages: number;
  /** Max URLs to track */
  maxUrls: number;
}

export const PRIORITY = {
  critical: 200,  // Current page images
  high: 100,      // Next page
  normal: 50,     // Previous page
  low: 25,        // Proactive preloading
} as const;

export type PriorityLevel = keyof typeof PRIORITY;
