/**
 * PreloadingService - Unified coordinator for all image preloading
 *
 * This is the single source of truth for:
 * 1. Preload queue management (network concurrency)
 * 2. Lifecycle coordination (project switch, deletions, connection changes)
 *
 * The tracker (tracker.ts) is the source of truth for what's been loaded.
 * This service coordinates preloading and lifecycle events.
 */

import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { PreloadQueue } from './queue';
import { getPreloadConfig } from './config';
import { preloadImages } from './preloader';
import {
  clearAllLoadedImages,
  clearLoadedImages,
  hasLoadedImage,
  setImageLoadStatus,
  getLoadTrackerStats,
} from './tracker';
import { PRIORITY } from './types';
import type {
  PreloadConfig,
  PreloadableImage,
  PreloadingServiceState,
  PreloadingEvent,
  PreloadingSubscriber,
} from './types';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

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

    // Clear queue
    this.queue.clear();

    // Clear load tracker (single source of truth for what's loaded)
    const clearedCount = clearAllLoadedImages('project switch');

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

    // Remove from load tracker (the source of truth)
    const clearedCount = clearLoadedImages(
      generationIds.map((id) => ({ id }))
    );

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
  }

  /**
   * Resume preloading.
   */
  resume(): void {
    if (!this.state.isPaused) return;
    this.state.isPaused = false;
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
    priority: number = PRIORITY.normal
  ): Promise<void> {
    if (this.state.isPaused || !this.state.isConnected) {
      return;
    }

    await preloadImages(images, this.queue, this.config, priority);

    this.emit({ type: 'queue-updated' });
  }

  /**
   * Check if an image has been loaded.
   * Delegates to the tracker (single source of truth).
   */
  isImageLoaded(image: PreloadableImage): boolean {
    if (!image.id) return false;
    return hasLoadedImage(image as { id: string });
  }

  /**
   * Mark an image as loaded (for images loaded by components, not preloader).
   * Delegates to the tracker.
   */
  markImageLoaded(image: PreloadableImage): void {
    if (image.id) {
      setImageLoadStatus(image as { id: string }, true);
    }
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
        normalizeAndPresentError(err, { context: 'PreloadingService.subscriber', showToast: false });
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
  } {
    return {
      state: { ...this.state },
      queue: {
        size: this.queue.size,
        active: this.queue.activeCount,
      },
      tracker: getLoadTrackerStats(),
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
