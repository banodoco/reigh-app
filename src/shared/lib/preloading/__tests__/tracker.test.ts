import { describe, it, expect, beforeEach } from 'vitest';
import {
  setImageLoadStatus,
  hasLoadedImage,
  markImageLoaded,
  clearLoadedImages,
  clearAllLoadedImages,
  getLoadTrackerStats,
  getImageElement,
} from '../tracker';

describe('Image Load Tracker', () => {
  beforeEach(() => {
    // Clear all state before each test
    clearAllLoadedImages('test reset');
  });

  describe('setImageLoadStatus', () => {
    it('marks an image as loaded', () => {
      const image = { id: 'img-1' };
      setImageLoadStatus(image, true);
      expect(hasLoadedImage(image)).toBe(true);
    });

    it('marks an image as not loaded', () => {
      const image = { id: 'img-1' };
      setImageLoadStatus(image, true);
      setImageLoadStatus(image, false);
      expect(hasLoadedImage(image)).toBe(false);
    });

    it('sets __memoryCached on the image object', () => {
      const image = { id: 'img-1' } as unknown;
      setImageLoadStatus(image, true);
      expect(image.__memoryCached).toBe(true);
    });

    it('does nothing for images without id', () => {
      const image = { id: '' } as unknown;
      setImageLoadStatus(image, true);
      expect(hasLoadedImage(image)).toBe(false);
    });
  });

  describe('hasLoadedImage', () => {
    it('returns false for unknown image object', () => {
      expect(hasLoadedImage({ id: 'unknown' })).toBe(false);
    });

    it('returns true for loaded image object', () => {
      const image = { id: 'img-1' };
      setImageLoadStatus(image, true);
      expect(hasLoadedImage(image)).toBe(true);
    });

    it('checks by URL string', () => {
      markImageLoaded('https://example.com/img.jpg');
      expect(hasLoadedImage('https://example.com/img.jpg')).toBe(true);
    });

    it('returns false for unknown URL', () => {
      expect(hasLoadedImage('https://example.com/unknown.jpg')).toBe(false);
    });

    it('returns false for image with no id', () => {
      expect(hasLoadedImage({ id: '' })).toBe(false);
    });
  });

  describe('markImageLoaded', () => {
    it('marks a URL as loaded', () => {
      markImageLoaded('https://example.com/img.jpg');
      expect(hasLoadedImage('https://example.com/img.jpg')).toBe(true);
    });

    it('marks an image object as loaded', () => {
      const image = { id: 'img-1' };
      markImageLoaded(image);
      expect(hasLoadedImage(image)).toBe(true);
    });

    it('stores metadata with URL', () => {
      const element = {} as HTMLImageElement;
      markImageLoaded('https://example.com/img.jpg', { width: 100, height: 200, element });
      expect(getImageElement('https://example.com/img.jpg')).toBe(element);
    });
  });

  describe('clearLoadedImages', () => {
    it('removes specified images from tracker', () => {
      const img1 = { id: 'img-1' };
      const img2 = { id: 'img-2' };
      setImageLoadStatus(img1, true);
      setImageLoadStatus(img2, true);

      const removed = clearLoadedImages([{ id: 'img-1' }]);
      expect(removed).toBe(1);
      expect(hasLoadedImage(img1)).toBe(false);
      expect(hasLoadedImage(img2)).toBe(true);
    });

    it('returns 0 when no matching images found', () => {
      const removed = clearLoadedImages([{ id: 'nonexistent' }]);
      expect(removed).toBe(0);
    });
  });

  describe('clearAllLoadedImages', () => {
    it('clears all tracked images', () => {
      setImageLoadStatus({ id: 'img-1' }, true);
      setImageLoadStatus({ id: 'img-2' }, true);
      markImageLoaded('https://example.com/img.jpg');

      const count = clearAllLoadedImages('test');
      expect(count).toBe(2); // Only counts by-id
      expect(hasLoadedImage({ id: 'img-1' })).toBe(false);
      expect(hasLoadedImage('https://example.com/img.jpg')).toBe(false);
    });
  });

  describe('getLoadTrackerStats', () => {
    it('returns current counts', () => {
      setImageLoadStatus({ id: 'img-1' }, true);
      markImageLoaded('https://example.com/img.jpg');

      const stats = getLoadTrackerStats();
      expect(stats.byId).toBe(1);
      expect(stats.byUrl).toBe(1);
      expect(stats.limits).toBeDefined();
      expect(stats.limits.maxImages).toBeGreaterThan(0);
      expect(stats.limits.maxUrls).toBeGreaterThan(0);
    });
  });

  describe('getImageElement', () => {
    it('returns undefined for unknown URL', () => {
      expect(getImageElement('https://unknown.com/img.jpg')).toBeUndefined();
    });

    it('returns element when stored', () => {
      const element = {} as HTMLImageElement;
      markImageLoaded('https://example.com/img.jpg', { element });
      expect(getImageElement('https://example.com/img.jpg')).toBe(element);
    });
  });
});
