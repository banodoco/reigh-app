import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/imageUploader', () => ({
  uploadImageToStorage: vi.fn().mockResolvedValue('https://storage.com/image.jpg'),
  uploadBlobToStorage: vi.fn().mockResolvedValue('https://storage.com/thumbnail.jpg'),
}));

import { uploadImageWithThumbnail } from '../clientThumbnailGenerator';
import { uploadImageToStorage, uploadBlobToStorage } from '../imageUploader';

describe('uploadImageWithThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads both original and thumbnail', async () => {
    vi.mocked(uploadImageToStorage).mockResolvedValue('https://storage.com/original.jpg');
    vi.mocked(uploadBlobToStorage).mockResolvedValue('https://storage.com/thumb.jpg');

    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const thumbnailBlob = new Blob(['thumb'], { type: 'image/jpeg' });

    const result = await uploadImageWithThumbnail(file, thumbnailBlob, 'user-123');

    expect(result.imageUrl).toBe('https://storage.com/original.jpg');
    expect(result.thumbnailUrl).toBe('https://storage.com/thumb.jpg');
    expect(uploadImageToStorage).toHaveBeenCalled();
    expect(uploadBlobToStorage).toHaveBeenCalled();
  });

  it('falls back to original URL when thumbnail upload fails', async () => {
    vi.mocked(uploadImageToStorage).mockResolvedValue('https://storage.com/original.jpg');
    vi.mocked(uploadBlobToStorage).mockRejectedValue(new Error('Upload failed'));

    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const thumbnailBlob = new Blob(['thumb'], { type: 'image/jpeg' });

    const result = await uploadImageWithThumbnail(file, thumbnailBlob, 'user-123');

    expect(result.imageUrl).toBe('https://storage.com/original.jpg');
    expect(result.thumbnailUrl).toBe('https://storage.com/original.jpg');
  });

  it('reports progress via callback function', async () => {
    vi.mocked(uploadImageToStorage).mockResolvedValue('https://storage.com/original.jpg');
    vi.mocked(uploadBlobToStorage).mockResolvedValue('https://storage.com/thumb.jpg');

    const onProgress = vi.fn();
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const thumbnailBlob = new Blob(['thumb'], { type: 'image/jpeg' });

    await uploadImageWithThumbnail(file, thumbnailBlob, 'user-123', onProgress);

    // Should report 90% before thumbnail and 100% after
    expect(onProgress).toHaveBeenCalledWith(90);
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it('accepts options object instead of callback', async () => {
    vi.mocked(uploadImageToStorage).mockResolvedValue('https://storage.com/original.jpg');
    vi.mocked(uploadBlobToStorage).mockResolvedValue('https://storage.com/thumb.jpg');

    const onProgress = vi.fn();
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const thumbnailBlob = new Blob(['thumb'], { type: 'image/jpeg' });

    await uploadImageWithThumbnail(file, thumbnailBlob, 'user-123', { onProgress });

    expect(onProgress).toHaveBeenCalledWith(90);
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it('passes signal through to uploaders', async () => {
    vi.mocked(uploadImageToStorage).mockResolvedValue('https://storage.com/original.jpg');
    vi.mocked(uploadBlobToStorage).mockResolvedValue('https://storage.com/thumb.jpg');

    const controller = new AbortController();
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const thumbnailBlob = new Blob(['thumb'], { type: 'image/jpeg' });

    await uploadImageWithThumbnail(file, thumbnailBlob, 'user-123', {
      signal: controller.signal,
    });

    // Verify signal was passed to uploaders
    expect(uploadImageToStorage).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ signal: controller.signal })
    );
    expect(uploadBlobToStorage).toHaveBeenCalledWith(
      expect.any(Blob),
      'thumbnail.jpg',
      'image/jpeg',
      expect.objectContaining({ signal: controller.signal })
    );
  });
});
