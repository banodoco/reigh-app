/**
 * Preloading System Types
 *
 * Central type definitions for the unified preloading system.
 */

// =============================================================================
// PRELOADABLE IMAGE
// =============================================================================

export interface PreloadableImage {
  id?: string;
  url?: string;
  thumbUrl?: string;
  location?: string;
  thumbnail_url?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

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

// =============================================================================
// PRIORITY
// =============================================================================

export const PRIORITY = {
  critical: 200, // Current page images
  high: 100, // Next page
  normal: 50, // Previous page
  low: 25, // Proactive preloading
} as const;

type PriorityLevel = keyof typeof PRIORITY;

// =============================================================================
// TRACKABLE IMAGE (for tracker)
// =============================================================================

export interface TrackableImage {
  id: string;
  __memoryCached?: boolean; // Legacy field, kept for backwards compatibility
}

// =============================================================================
// SERVICE TYPES
// =============================================================================

export interface PreloadingServiceState {
  currentProjectId: string | null;
  isConnected: boolean;
  isPaused: boolean;
}

export type PreloadingEventType =
  | 'project-changed'
  | 'generations-deleted'
  | 'connection-changed'
  | 'queue-updated';

export interface PreloadingEvent {
  type: PreloadingEventType;
  data?: unknown;
}

export type PreloadingSubscriber = (event: PreloadingEvent) => void;
