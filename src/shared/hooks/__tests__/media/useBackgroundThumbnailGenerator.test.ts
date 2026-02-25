import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '@/test/test-utils';

vi.mock('@/shared/lib/videoThumbnailGenerator', () => ({
  generateAndUploadThumbnail: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

import { useBackgroundThumbnailGenerator } from '@/shared/hooks/media/useBackgroundThumbnailGenerator';

describe('useBackgroundThumbnailGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with no videos', () => {
    const { result } = renderHookWithProviders(() =>
      useBackgroundThumbnailGenerator({
        videos: [],
        projectId: 'proj-1',
        enabled: true,
      })
    );

    expect(result.current.statuses).toEqual({});
    expect(result.current.queueLength).toBe(0);
    expect(result.current.isProcessing).toBe(false);
  });

  it('returns initial state when disabled', () => {
    const { result } = renderHookWithProviders(() =>
      useBackgroundThumbnailGenerator({
        videos: [
          {
            id: 'v-1',
            location: 'test.mp4',
            isVideo: true,
          } as unknown,
        ],
        projectId: 'proj-1',
        enabled: false,
      })
    );

    expect(result.current.statuses).toEqual({});
    expect(result.current.queueLength).toBe(0);
  });

  it('returns initial state when projectId is null', () => {
    const { result } = renderHookWithProviders(() =>
      useBackgroundThumbnailGenerator({
        videos: [
          {
            id: 'v-1',
            location: 'test.mp4',
            isVideo: true,
          } as unknown,
        ],
        projectId: null,
        enabled: true,
      })
    );

    expect(result.current.statuses).toEqual({});
  });

  it('skips videos that already have image thumbnails', () => {
    const { result } = renderHookWithProviders(() =>
      useBackgroundThumbnailGenerator({
        videos: [
          {
            id: 'v-1',
            location: 'test.mp4',
            thumbUrl: 'thumb.jpg',
            isVideo: true,
          } as unknown,
        ],
        projectId: 'proj-1',
        enabled: true,
      })
    );

    expect(result.current.queueLength).toBe(0);
  });

  it('skips non-video items', () => {
    const { result } = renderHookWithProviders(() =>
      useBackgroundThumbnailGenerator({
        videos: [
          {
            id: 'img-1',
            location: 'test.jpg',
            isVideo: false,
          } as unknown,
        ],
        projectId: 'proj-1',
        enabled: true,
      })
    );

    expect(result.current.queueLength).toBe(0);
  });
});
