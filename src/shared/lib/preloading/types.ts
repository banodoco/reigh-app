export interface PreloadableImage {
  id?: string;
  url?: string;
  thumbUrl?: string;
  location?: string;
  thumbnail_url?: string;
}

export interface PreloadConfig {
  maxConcurrent: number;
  debounceMs: number;
  maxImagesPerPage: number;
  preloadThumbnailsOnly: boolean;
}

export interface TrackerLimits {
  maxImages: number;
  maxUrls: number;
}

export const PRIORITY = {
  critical: 200,
  high: 100,
  normal: 50,
  low: 25,
} as const;

export interface TrackableImage {
  id: string;
}

export interface PreloadingServiceState {
  currentProjectId: string | null;
  isConnected: boolean;
  isPaused: boolean;
}

type PreloadingEventType =
  | 'project-changed'
  | 'generations-deleted'
  | 'connection-changed'
  | 'queue-updated';

export interface PreloadingEvent {
  type: PreloadingEventType;
  data?: unknown;
}

export type PreloadingSubscriber = (event: PreloadingEvent) => void;
