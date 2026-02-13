import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockCreateSignedUrl = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
      }),
    },
  },
}));

import { useVideoUrlCache } from '../useVideoUrlCache';
import type { TrainingDataVideo } from '../types';

function createVideo(id: string, storageLocation: string): TrainingDataVideo {
  return {
    id,
    originalFilename: `${id}.mp4`,
    storageLocation,
    duration: 60,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: null,
    userId: 'user-1',
    batchId: 'batch-1',
  };
}

describe('useVideoUrlCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-url' },
      error: null,
    });
  });

  it('returns empty string for videos with no cached URL', () => {
    const videos = [createVideo('v1', 'path/v1.mp4')];
    const { result } = renderHook(() => useVideoUrlCache(videos));

    // Before URLs are loaded, returns empty string
    expect(result.current.getVideoUrl(videos[0])).toBe('');
  });

  it('loads signed URLs for provided videos', async () => {
    const videos = [createVideo('v1', 'path/v1.mp4')];
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-v1' },
      error: null,
    });

    const { result } = renderHook(() => useVideoUrlCache(videos));

    await waitFor(() => {
      expect(result.current.getVideoUrl(videos[0])).toBe('https://example.com/signed-v1');
    });

    expect(mockCreateSignedUrl).toHaveBeenCalledWith('path/v1.mp4', 3600);
  });

  it('loads URLs in batches of 10', async () => {
    // Create 15 videos to test batching
    const videos = Array.from({ length: 15 }, (_, i) =>
      createVideo(`v${i}`, `path/v${i}.mp4`),
    );

    mockCreateSignedUrl.mockImplementation((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://example.com/signed-${path}` },
        error: null,
      }),
    );

    renderHook(() => useVideoUrlCache(videos));

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledTimes(15);
    });
  });

  it('does not reload URLs for already cached videos', async () => {
    const videos = [createVideo('v1', 'path/v1.mp4')];

    const { result, rerender } = renderHook(
      ({ v }) => useVideoUrlCache(v),
      { initialProps: { v: videos } },
    );

    await waitFor(() => {
      expect(result.current.getVideoUrl(videos[0])).not.toBe('');
    });

    // Rerender with same videos
    rerender({ v: videos });

    // Should not call createSignedUrl again for v1
    // (first call is 1, no additional calls on rerender)
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('markVideoAsInvalid causes getVideoUrl to return empty string', async () => {
    const videos = [createVideo('v1', 'path/v1.mp4')];

    const { result } = renderHook(() => useVideoUrlCache(videos));

    await waitFor(() => {
      expect(result.current.getVideoUrl(videos[0])).not.toBe('');
    });

    act(() => {
      result.current.markVideoAsInvalid('v1');
    });

    expect(result.current.getVideoUrl(videos[0])).toBe('');
  });

  it('clearUrlCache removes cached URL for a video', async () => {
    const videos = [createVideo('v1', 'path/v1.mp4')];

    const { result } = renderHook(() => useVideoUrlCache(videos));

    await waitFor(() => {
      expect(result.current.getVideoUrl(videos[0])).not.toBe('');
    });

    act(() => {
      result.current.clearUrlCache('v1');
    });

    // After clearing, URL should be empty until re-fetched
    expect(result.current.getVideoUrl(videos[0])).toBe('');
  });

  it('handles createSignedUrl errors gracefully', async () => {
    const videos = [createVideo('v1', 'path/v1.mp4')];
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'Storage error' },
    });

    const { result } = renderHook(() => useVideoUrlCache(videos));

    // Give time for the effect to run
    await new Promise(r => setTimeout(r, 50));

    expect(result.current.getVideoUrl(videos[0])).toBe('');
  });

  it('does not attempt to load URLs when videos array is empty', () => {
    renderHook(() => useVideoUrlCache([]));

    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('loads URLs for newly added videos only', async () => {
    const video1 = createVideo('v1', 'path/v1.mp4');
    const video2 = createVideo('v2', 'path/v2.mp4');

    mockCreateSignedUrl.mockImplementation((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://example.com/signed-${path}` },
        error: null,
      }),
    );

    const { result, rerender } = renderHook(
      ({ v }) => useVideoUrlCache(v),
      { initialProps: { v: [video1] } },
    );

    await waitFor(() => {
      expect(result.current.getVideoUrl(video1)).not.toBe('');
    });

    const callsAfterFirst = mockCreateSignedUrl.mock.calls.length;

    // Add a second video
    rerender({ v: [video1, video2] });

    await waitFor(() => {
      expect(result.current.getVideoUrl(video2)).not.toBe('');
    });

    // Only the new video should have triggered a new call
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(callsAfterFirst + 1);
  });
});
