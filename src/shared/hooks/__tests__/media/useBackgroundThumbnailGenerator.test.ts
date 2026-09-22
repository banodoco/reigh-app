import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '@/test/test-utils';
import { waitFor } from '@testing-library/react';

const mockGenerateAndUploadThumbnail = vi.hoisted(() => vi.fn());
const mockIsDeferredCloudDataAuthority = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/shared/lib/media/videoThumbnailGenerator', () => ({
  generateAndUploadThumbnail: mockGenerateAndUploadThumbnail,
}));

vi.mock('@/app/runtime/dataAuthority', () => ({
  isDeferredCloudDataAuthority: mockIsDeferredCloudDataAuthority,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

import { useBackgroundThumbnailGenerator } from '@/shared/hooks/media/useBackgroundThumbnailGenerator';

describe('useBackgroundThumbnailGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDeferredCloudDataAuthority.mockReturnValue(false);
    mockGenerateAndUploadThumbnail.mockResolvedValue({ success: true, thumbnailUrl: 'thumb.jpg' });
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

  it('processes videos only under explicit deferred-cloud authority', async () => {
    mockIsDeferredCloudDataAuthority.mockReturnValue(true);

    const { result } = renderHookWithProviders(() =>
      useBackgroundThumbnailGenerator({
        videos: [{ id: 'v-1', location: 'test.mp4', isVideo: true } as unknown],
        projectId: 'proj-1',
        enabled: true,
      }),
    );

    await waitFor(() => expect(mockGenerateAndUploadThumbnail).toHaveBeenCalledTimes(1));
    expect(mockGenerateAndUploadThumbnail).toHaveBeenCalledWith(
      'test.mp4',
      'v-1',
      'proj-1',
      expect.any(Function),
    );
    await waitFor(() => expect(result.current.statuses['v-1']?.status).toBe('success'));
  });
});
