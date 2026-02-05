/**
 * PreloadingService - Unified coordinator for all image preloading
 *
 * This is the single source of truth for:
 * 1. Image load tracking (what's been preloaded)
 * 2. Preload queue management (network concurrency)
 * 3. Lifecycle coordination (project switch, deletions, connection changes)
 *
 * Components use hooks that delegate to this service, ensuring:
 * - No duplicate preloading across different components
 * - Proper cleanup on project switch
 * - Realtime deletion handling
 * - Observable state for debugging
 */

import {
  PreloadQueue,
  getPreloadConfig,
  preloadImages,
  PRIORITY_VALUES,
  type PreloadConfig,
  type PreloadableImage,
} from '@/shared/lib/imagePreloading';
import {
  clearAllLoadedImages,
  clearLoadedImages,
  getLoadTrackerStats,
  hasLoadedImage,
  setImageLoadStatus,
} from '@/shared/lib/imageLoadTracker';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

// =============================================================================
// TYPES
// =============================================================================

interface PreloadingServiceState {
  currentProjectId: string | null;
  isConnected: boolean;
  isPaused: boolean;
}

type PreloadingEventType =
  | 'project-changed'
  | 'generations-deleted'
  | 'connection-changed'
  | 'queue-updated';

interface PreloadingEvent {
  type: PreloadingEventType;
  data?: unknown;
}

type PreloadingSubscriber = (event: PreloadingEvent) => void;

// =============================================================================
// SERVICE
// =============================================================================

class PreloadingService {
  private state: PreloadingServiceState = {
    currentProjectId: null,
    isConnected: true,
    isPaused: false,
  };

  private queue: PreloadQueue;
  private config: PreloadConfig;
  private subscribers = new Set<PreloadingSubscriber>();

  // Track loaded images by ID (for deletion cleanup)
  private loadedImageIds = new Set<string>();

  // Singleton
  private static instance: PreloadingService | null = null;

  static getInstance(): PreloadingService {
    if (!PreloadingService.instance) {
      PreloadingService.instance = new PreloadingService();
    }
    return PreloadingService.instance;
  }

  private constructor() {
    this.config = getPreloadConfig();
    this.queue = new PreloadQueue(this.config.maxConcurrent);

    // Subscribe to connection status changes from DataFreshnessManager
    this.subscribeToConnectionStatus();

    console.log('[PreloadingService] Initialized', {
      config: this.config,
    });
  }

  /**
   * Subscribe to DataFreshnessManager to track connection status.
   */
  private subscribeToConnectionStatus(): void {
    // Get initial status
    const initialDiagnostics = dataFreshnessManager.getDiagnostics();
    this.state.isConnected = initialDiagnostics.realtimeStatus === 'connected';

    // Subscribe to changes
    dataFreshnessManager.subscribe(() => {
      const diagnostics = dataFreshnessManager.getDiagnostics();
      const isConnected = diagnostics.realtimeStatus === 'connected';

      if (isConnected !== this.state.isConnected) {
        this.onConnectionStatusChange(isConnected);
      }
    });
  }

  // ===========================================================================
  // LIFECYCLE EVENTS
  // ===========================================================================

  /**
   * Called when the selected project changes.
   * Clears all preloading state for the old project.
   */
  onProjectChange(projectId: string | null): void {
    if (projectId === this.state.currentProjectId) {
      return;
    }

    const previousProject = this.state.currentProjectId;
    console.log('[PreloadingService] Project change', {
      from: previousProject,
      to: projectId,
    });

    // Clear queue
    this.queue.clear();

    // Clear load tracker
    const clearedCount = clearAllLoadedImages('project switch');

    // Clear our internal tracking
    this.loadedImageIds.clear();

    // Clear legacy video gallery cache if it exists
    if (typeof window !== 'undefined' && window.videoGalleryPreloaderCache) {
      const cache = window.videoGalleryPreloaderCache;
      cache.preloadedUrlSetByProject = {};
      cache.preloadedPagesByShot = {};
      cache.hasStartedPreloadForProject = {};
      cache.preloadedImageRefs.clear();
      console.log('[PreloadingService] Cleared legacy video gallery cache');
    }

    this.state.currentProjectId = projectId;

    this.emit({
      type: 'project-changed',
      data: { from: previousProject, to: projectId, clearedCount },
    });
  }

  /**
   * Called when generations are deleted (via realtime or mutation).
   * Removes them from the load tracker.
   */
  onGenerationsDeleted(generationIds: string[]): void {
    if (generationIds.length === 0) return;

    // Remove from our tracking
    generationIds.forEach((id) => {
      this.loadedImageIds.delete(id);
    });

    // Remove from load tracker
    const clearedCount = clearLoadedImages(
      generationIds.map((id) => ({ id }))
    );

    console.log('[PreloadingService] Generations deleted', {
      count: generationIds.length,
      clearedFromTracker: clearedCount,
    });

    this.emit({
      type: 'generations-deleted',
      data: { ids: generationIds, clearedCount },
    });
  }

  /**
   * Called when connection status changes (from DataFreshnessManager).
   * Could be used to adjust preloading strategy.
   */
  onConnectionStatusChange(isConnected: boolean): void {
    if (isConnected === this.state.isConnected) return;

    console.log('[PreloadingService] Connection status changed', {
      isConnected,
    });

    this.state.isConnected = isConnected;

    // If disconnected, pause aggressive preloading
    if (!isConnected) {
      this.queue.clear();
    }

    this.emit({
      type: 'connection-changed',
      data: { isConnected },
    });
  }

  /**
   * Pause all preloading (e.g., when lightbox is open).
   */
  pause(): void {
    if (this.state.isPaused) return;
    this.state.isPaused = true;
    this.queue.clear();
    console.log('[PreloadingService] Paused');
  }

  /**
   * Resume preloading.
   */
  resume(): void {
    if (!this.state.isPaused) return;
    this.state.isPaused = false;
    console.log('[PreloadingService] Resumed');
  }

  // ===========================================================================
  // PRELOADING API
  // ===========================================================================

  /**
   * Preload a batch of images.
   * Uses the shared queue to avoid overwhelming the network.
   */
  async preloadImages(
    images: PreloadableImage[],
    priority: number = PRIORITY_VALUES.normal
  ): Promise<void> {
    if (this.state.isPaused || !this.state.isConnected) {
      return;
    }

    // Track which images we're loading
    images.forEach((img) => {
      if (img.id) {
        this.loadedImageIds.add(img.id);
      }
    });

    await preloadImages(images, this.queue, this.config, priority);

    this.emit({ type: 'queue-updated' });
  }

  /**
   * Check if an image has been loaded.
   */
  isImageLoaded(image: PreloadableImage): boolean {
    return hasLoadedImage(image);
  }

  /**
   * Mark an image as loaded (for images loaded by components, not preloader).
   */
  markImageLoaded(image: PreloadableImage): void {
    if (image.id) {
      this.loadedImageIds.add(image.id);
    }
    setImageLoadStatus(image, true);
  }

  /**
   * Get the shared preload queue (for advanced use cases).
   */
  getQueue(): PreloadQueue {
    return this.queue;
  }

  /**
   * Get the current config.
   */
  getConfig(): PreloadConfig {
    return this.config;
  }

  /**
   * Clear the preload queue (e.g., on page change).
   */
  clearQueue(): void {
    this.queue.clear();
  }

  // ===========================================================================
  // STATE ACCESS
  // ===========================================================================

  getCurrentProjectId(): string | null {
    return this.state.currentProjectId;
  }

  isPaused(): boolean {
    return this.state.isPaused;
  }

  isConnected(): boolean {
    return this.state.isConnected;
  }

  // ===========================================================================
  // SUBSCRIPTION
  // ===========================================================================

  subscribe(callback: PreloadingSubscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private emit(event: PreloadingEvent): void {
    this.subscribers.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('[PreloadingService] Subscriber error:', err);
      }
    });
  }

  // ===========================================================================
  // DEBUGGING
  // ===========================================================================

  getDiagnostics(): {
    state: PreloadingServiceState;
    queue: { size: number; active: number };
    tracker: ReturnType<typeof getLoadTrackerStats>;
    loadedImageIds: number;
    legacyVideoCache: number | null;
  } {
    return {
      state: { ...this.state },
      queue: {
        size: this.queue.size,
        active: this.queue.activeCount,
      },
      tracker: getLoadTrackerStats(),
      loadedImageIds: this.loadedImageIds.size,
      legacyVideoCache:
        this.state.currentProjectId &&
        typeof window !== 'undefined' &&
        window.videoGalleryPreloaderCache
          ? window.videoGalleryPreloaderCache.preloadedUrlSetByProject[
              this.state.currentProjectId
            ]?.size || 0
          : null,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const preloadingService = PreloadingService.getInstance();

// Expose for debugging in browser console
if (typeof window !== 'undefined') {
  (window as unknown as { __PRELOADING_SERVICE__: PreloadingService }).__PRELOADING_SERVICE__ =
    preloadingService;
}

// =============================================================================
// REACT HOOK
// =============================================================================

import { useEffect, useCallback, useSyncExternalStore } from 'react';

/**
 * Hook to access the PreloadingService in React components.
 */
export function usePreloadingService() {
  // Subscribe to service updates
  const subscribe = useCallback((callback: () => void) => {
    return preloadingService.subscribe(() => callback());
  }, []);

  const getSnapshot = useCallback(() => {
    return preloadingService.getDiagnostics();
  }, []);

  const diagnostics = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    service: preloadingService,
    diagnostics,
    preloadImages: preloadingService.preloadImages.bind(preloadingService),
    isImageLoaded: preloadingService.isImageLoaded.bind(preloadingService),
    markImageLoaded: preloadingService.markImageLoaded.bind(preloadingService),
    clearQueue: preloadingService.clearQueue.bind(preloadingService),
    pause: preloadingService.pause.bind(preloadingService),
    resume: preloadingService.resume.bind(preloadingService),
  };
}
