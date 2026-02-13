import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processImageUrl } from '../urlToFile';

describe('urlToFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('processImageUrl', () => {
    it('throws on empty URL', async () => {
      await expect(processImageUrl('')).rejects.toThrow('Please enter a valid image URL');
    });

    it('throws on whitespace-only URL', async () => {
      await expect(processImageUrl('   ')).rejects.toThrow('Please enter a valid image URL');
    });

    it('throws on non-HTTP URL', async () => {
      await expect(processImageUrl('ftp://example.com/image.png')).rejects.toThrow(
        'Please enter a valid HTTP or HTTPS image URL'
      );
    });

    it('throws on malformed URL', async () => {
      await expect(processImageUrl('not-a-url')).rejects.toThrow(
        'Please enter a valid HTTP or HTTPS image URL'
      );
    });

    it('throws on javascript: protocol URL', async () => {
      await expect(processImageUrl('javascript:alert(1)')).rejects.toThrow(
        'Please enter a valid HTTP or HTTPS image URL'
      );
    });

    it('fetches and returns a File for valid image URL', async () => {
      const fakeBlob = new Blob(['fake-image-data'], { type: 'image/png' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(fakeBlob),
        })
      );

      const file = await processImageUrl('https://example.com/photo.png');

      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe('image/png');
      expect(file.name).toBe('photo.png');
    });

    it('trims whitespace from URL before processing', async () => {
      const fakeBlob = new Blob(['data'], { type: 'image/jpeg' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(fakeBlob),
      });
      vi.stubGlobal('fetch', mockFetch);

      await processImageUrl('  https://example.com/img.jpg  ');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/img.jpg',
        expect.any(Object)
      );
    });

    it('throws when fetch response is not ok', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        })
      );

      await expect(
        processImageUrl('https://example.com/missing.png')
      ).rejects.toThrow('Failed to fetch image: 404 Not Found');
    });

    it('throws when response is not an image', async () => {
      const htmlBlob = new Blob(['<html></html>'], { type: 'text/html' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(htmlBlob),
        })
      );

      await expect(
        processImageUrl('https://example.com/page')
      ).rejects.toThrow('Unable to load image from URL');
    });

    it('throws when file exceeds 10MB', async () => {
      // Create a blob larger than 10MB
      const largeData = new Uint8Array(11 * 1024 * 1024);
      const largeBlob = new Blob([largeData], { type: 'image/png' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(largeBlob),
        })
      );

      await expect(
        processImageUrl('https://example.com/huge.png')
      ).rejects.toThrow('Image is too large');
    });

    it('wraps network TypeError with user-friendly message', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Network request failed'))
      );

      await expect(
        processImageUrl('https://example.com/image.png')
      ).rejects.toThrow('Unable to load image from URL');
    });

    it('generates filename from URL path', async () => {
      const fakeBlob = new Blob(['data'], { type: 'image/webp' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(fakeBlob),
        })
      );

      const file = await processImageUrl('https://cdn.example.com/assets/hero-banner.webp');
      expect(file.name).toBe('hero-banner.webp');
    });

    it('generates fallback filename when URL has no file extension', async () => {
      const fakeBlob = new Blob(['data'], { type: 'image/jpeg' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(fakeBlob),
        })
      );

      const file = await processImageUrl('https://example.com/images/12345');
      expect(file.name).toMatch(/^image-from-url-\d+\.jpg$/);
    });

    it('uses provided filename when given', async () => {
      const fakeBlob = new Blob(['data'], { type: 'image/png' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(fakeBlob),
        })
      );

      const file = await processImageUrl('https://example.com/img.png', 'my-custom-name.png');
      expect(file.name).toBe('my-custom-name.png');
    });

    it('accepts https URLs', async () => {
      const fakeBlob = new Blob(['data'], { type: 'image/gif' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(fakeBlob),
        })
      );

      const file = await processImageUrl('https://example.com/animation.gif');
      expect(file.type).toBe('image/gif');
    });

    it('accepts http URLs', async () => {
      const fakeBlob = new Blob(['data'], { type: 'image/jpeg' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(fakeBlob),
        })
      );

      const file = await processImageUrl('http://example.com/old-image.jpg');
      expect(file.type).toBe('image/jpeg');
    });
  });
});
