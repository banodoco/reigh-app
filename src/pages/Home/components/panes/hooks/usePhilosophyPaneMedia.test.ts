import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhilosophyPaneMedia } from './usePhilosophyPaneMedia';
import { useTravelAutoAdvance } from '../../motion/useTravelAutoAdvance';

vi.mock('../../motion/useTravelAutoAdvance', () => ({
  useTravelAutoAdvance: vi.fn(),
}));

vi.mock('@/shared/lib/media/safePlay', () => ({
  safePlay: vi.fn(async () => ({ ok: true })),
}));

describe('usePhilosophyPaneMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTravelAutoAdvance).mockReturnValue({
      setVideoProgress: vi.fn(),
      handleVideoStarted: vi.fn(),
      handleVideoEnded: vi.fn(),
      handleVideoTimeUpdate: vi.fn(),
      handleManualSelect: vi.fn(),
      resetAll: vi.fn(),
    } as never);
  });

  it('tracks loaded media and delegates selection handlers to auto-advance controls', () => {
    const { result } = renderHook(() =>
      usePhilosophyPaneMedia({
        isOpen: false,
        isClosing: false,
        isOpening: false,
        currentExample: {
          prompt: 'example',
          image1: 'img-1',
          image2: 'img-2',
          video: 'video-1',
        },
        travelExamples: [
          { id: '1', label: 'One', images: ['a', 'b'], video: 'v1', poster: 'p1' },
          { id: '2', label: 'Two', images: ['c', 'd'], video: 'v2', poster: 'p2' },
        ],
      }),
    );

    act(() => {
      result.current.handleImageLoad('image-a');
      result.current.handleVideoLoad('video-a');
      result.current.handleSelectExample(1);
    });

    expect(result.current.loadedImages.has('image-a')).toBe(true);
    expect(result.current.loadedVideos.has('video-a')).toBe(true);
    expect(vi.mocked(useTravelAutoAdvance).mock.results[0]?.value.handleManualSelect).toHaveBeenCalledWith(1);
  });
});
