import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/shared/lib/utils', () => ({
  getDisplayUrl: (url: string) => url,
}));

vi.mock('../tracker', () => ({
  setImageLoadStatus: vi.fn(),
  hasLoadedImage: vi.fn().mockReturnValue(false),
  markImageLoaded: vi.fn(),
}));

vi.mock('../queue', () => ({
  PreloadQueue: vi.fn(),
}));

import { preloadImages } from '../preloader';
import { hasLoadedImage, setImageLoadStatus, markImageLoaded } from '../tracker';
import type { PreloadConfig, PreloadableImage } from '../types';

describe('preloadImages', () => {
  const mockConfig: PreloadConfig = {
    maxConcurrent: 3,
    debounceMs: 100,
    maxImagesPerPage: 5,
    preloadThumbnailsOnly: false,
  };

  const mockElement = {} as HTMLImageElement;
  let mockQueue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue = { add: vi.fn().mockResolvedValue(mockElement) };
  });

  it('does nothing for empty image list', async () => {
    await preloadImages([], mockQueue as unknown, mockConfig);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('skips already-loaded images', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(true);

    const images: PreloadableImage[] = [{ id: 'img-1', url: 'https://example.com/img.jpg' }];
    await preloadImages(images, mockQueue as unknown, mockConfig);

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('preloads images via the queue', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(false);

    const images: PreloadableImage[] = [
      { id: 'img-1', url: 'https://example.com/img1.jpg' },
      { id: 'img-2', url: 'https://example.com/img2.jpg' },
    ];

    await preloadImages(images, mockQueue as unknown, mockConfig);

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
  });

  it('uses thumb URL when preloadThumbnailsOnly is true', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(false);

    const thumbnailConfig = { ...mockConfig, preloadThumbnailsOnly: true };
    const images: PreloadableImage[] = [
      { id: 'img-1', url: 'https://example.com/full.jpg', thumbUrl: 'https://example.com/thumb.jpg' },
    ];

    await preloadImages(images, mockQueue as unknown, thumbnailConfig);

    expect(mockQueue.add).toHaveBeenCalledWith('https://example.com/thumb.jpg', expect.any(Number));
  });

  it('falls back to full URL when no thumb URL and thumbnailsOnly', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(false);

    const thumbnailConfig = { ...mockConfig, preloadThumbnailsOnly: true };
    const images: PreloadableImage[] = [
      { id: 'img-1', url: 'https://example.com/full.jpg' },
    ];

    await preloadImages(images, mockQueue as unknown, thumbnailConfig);

    expect(mockQueue.add).toHaveBeenCalledWith('https://example.com/full.jpg', expect.any(Number));
  });

  it('limits images to maxImagesPerPage', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(false);

    const limitedConfig = { ...mockConfig, maxImagesPerPage: 2 };
    const images: PreloadableImage[] = [
      { id: 'img-1', url: 'https://example.com/1.jpg' },
      { id: 'img-2', url: 'https://example.com/2.jpg' },
      { id: 'img-3', url: 'https://example.com/3.jpg' },
    ];

    await preloadImages(images, mockQueue as unknown, limitedConfig);

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
  });

  it('marks image as loaded after successful preload', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(false);

    const images: PreloadableImage[] = [
      { id: 'img-1', url: 'https://example.com/img.jpg' },
    ];

    await preloadImages(images, mockQueue as unknown, mockConfig);

    expect(setImageLoadStatus).toHaveBeenCalled();
    expect(markImageLoaded).toHaveBeenCalled();
  });

  it('skips images without URLs', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(false);

    const images: PreloadableImage[] = [
      { id: 'img-1' }, // no url
    ];

    await preloadImages(images, mockQueue as unknown, mockConfig);

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('skips _joined_frame.jpg URLs', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(false);

    const images: PreloadableImage[] = [
      { id: 'img-1', url: 'https://example.com/output_joined_frame.jpg' },
    ];

    await preloadImages(images, mockQueue as unknown, mockConfig);

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('handles queue errors gracefully', async () => {
    vi.mocked(hasLoadedImage).mockReturnValue(false);
    mockQueue.add.mockRejectedValue(new Error('Network error'));

    const images: PreloadableImage[] = [
      { id: 'img-1', url: 'https://example.com/img.jpg' },
    ];

    // Should not throw
    await expect(preloadImages(images, mockQueue as unknown, mockConfig)).resolves.not.toThrow();
  });
});
