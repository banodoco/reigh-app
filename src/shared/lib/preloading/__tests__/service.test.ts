import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('@/shared/realtime/DataFreshnessManager', () => ({
  dataFreshnessManager: {
    getDiagnostics: vi.fn().mockReturnValue({ realtimeStatus: 'connected' }),
    subscribe: vi.fn(),
  },
}));

vi.mock('../config', () => ({
  getPreloadConfig: vi.fn().mockReturnValue({
    maxConcurrent: 3,
    debounceMs: 150,
    maxImagesPerPage: 10,
    preloadThumbnailsOnly: false,
  }),
}));

vi.mock('../queue', () => {
  // Must be a proper constructor (class) for `new PreloadQueue(...)` to work
  class MockPreloadQueue {
    add = vi.fn().mockResolvedValue({});
    clear = vi.fn();
    get size() { return 0; }
    get activeCount() { return 0; }
  }
  return { PreloadQueue: MockPreloadQueue };
});

vi.mock('../preloader', () => ({
  preloadImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../tracker', () => ({
  clearAllLoadedImages: vi.fn().mockReturnValue(0),
  clearLoadedImages: vi.fn().mockReturnValue(0),
  hasLoadedImage: vi.fn().mockReturnValue(false),
  setImageLoadStatus: vi.fn(),
  getLoadTrackerStats: vi.fn().mockReturnValue({ byId: 0, byUrl: 0, limits: { maxImages: 300, maxUrls: 500 } }),
}));

// Reset module cache to get fresh singleton
beforeEach(() => {
  vi.resetModules();
});

describe('PreloadingService', () => {
  it('exports a singleton service', async () => {
    const { preloadingService } = await import('../service');
    expect(preloadingService).toBeDefined();
  });

  it('tracks current project ID', async () => {
    const { preloadingService } = await import('../service');
    expect(preloadingService.getDiagnostics().state.currentProjectId).toBeNull();

    preloadingService.onProjectChange('project-1');
    expect(preloadingService.getDiagnostics().state.currentProjectId).toBe('project-1');
  });

  it('clears queue on project change', async () => {
    const { preloadingService } = await import('../service');
    const { clearAllLoadedImages } = await import('../tracker');

    preloadingService.onProjectChange('project-1');
    preloadingService.onProjectChange('project-2');

    expect(clearAllLoadedImages).toHaveBeenCalledWith('project switch');
  });

  it('does not clear when project ID is unchanged', async () => {
    const { preloadingService } = await import('../service');
    const { clearAllLoadedImages } = await import('../tracker');

    vi.mocked(clearAllLoadedImages).mockClear();

    preloadingService.onProjectChange('project-1');
    const callCount = vi.mocked(clearAllLoadedImages).mock.calls.length;

    preloadingService.onProjectChange('project-1');
    expect(vi.mocked(clearAllLoadedImages).mock.calls.length).toBe(callCount);
  });

  it('handles generation deletions', async () => {
    const { preloadingService } = await import('../service');
    const { clearLoadedImages } = await import('../tracker');

    preloadingService.onGenerationsDeleted(['gen-1', 'gen-2']);

    expect(clearLoadedImages).toHaveBeenCalledWith([{ id: 'gen-1' }, { id: 'gen-2' }]);
  });

  it('does nothing for empty deletion list', async () => {
    const { preloadingService } = await import('../service');
    const { clearLoadedImages } = await import('../tracker');

    vi.mocked(clearLoadedImages).mockClear();
    preloadingService.onGenerationsDeleted([]);
    expect(clearLoadedImages).not.toHaveBeenCalled();
  });

  it('supports pause and resume', async () => {
    const { preloadingService } = await import('../service');

    expect(preloadingService.getDiagnostics().state.isPaused).toBe(false);

    preloadingService.pause();
    expect(preloadingService.getDiagnostics().state.isPaused).toBe(true);

    preloadingService.resume();
    expect(preloadingService.getDiagnostics().state.isPaused).toBe(false);
  });

  it('does not preload when paused', async () => {
    const { preloadingService } = await import('../service');
    const { preloadImages } = await import('../preloader');

    preloadingService.pause();
    await preloadingService.preloadImages([{ id: 'img-1', url: 'test.jpg' }]);

    expect(preloadImages).not.toHaveBeenCalled();
    preloadingService.resume();
  });

  it('handles connection status changes', async () => {
    const { preloadingService } = await import('../service');

    preloadingService.onConnectionStatusChange(false);
    expect(preloadingService.getDiagnostics().state.isConnected).toBe(false);

    preloadingService.onConnectionStatusChange(true);
    expect(preloadingService.getDiagnostics().state.isConnected).toBe(true);
  });

  it('supports subscribers', async () => {
    const { preloadingService } = await import('../service');
    const callback = vi.fn();

    const unsubscribe = preloadingService.subscribe(callback);

    preloadingService.onProjectChange('project-new');
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'project-changed' })
    );

    unsubscribe();
    callback.mockClear();

    preloadingService.onProjectChange('project-another');
    // After unsubscribe, callback should not be called for future events
  });

  it('returns diagnostics', async () => {
    const { preloadingService } = await import('../service');

    const diagnostics = preloadingService.getDiagnostics();
    expect(diagnostics).toHaveProperty('state');
    expect(diagnostics).toHaveProperty('queue');
    expect(diagnostics).toHaveProperty('tracker');
    expect(diagnostics.queue).toHaveProperty('size');
    expect(diagnostics.queue).toHaveProperty('active');
  });

});
