import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock Image and document.createElement for canvas operations
let imageInstances: any[] = [];

beforeEach(() => {
  imageInstances = [];

  // Mock Image - does NOT auto-trigger, tests control callbacks manually
  vi.stubGlobal('Image', class MockImage {
    width = 0;
    height = 0;
    onload: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    private _src = '';

    constructor() {
      imageInstances.push(this);
    }

    get src() { return this._src; }
    set src(val: string) {
      this._src = val;
      // Don't auto-trigger - tests will trigger manually
    }
  });

  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag === 'canvas') {
        const ctx = {
          clearRect: vi.fn(),
          drawImage: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
          toDataURL: vi.fn().mockReturnValue('data:image/png;base64,processed'),
        };
      }
      return {};
    }),
  });
});

import { processStyleReferenceForAspectRatioString } from '../styleReferenceProcessor';

describe('styleReferenceProcessor', () => {
  describe('processStyleReferenceForAspectRatioString', () => {
    it('returns null for invalid aspect ratio string', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await processStyleReferenceForAspectRatioString(
        'data:image/png;base64,abc',
        'not-a-ratio'
      );
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null for empty aspect ratio string', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await processStyleReferenceForAspectRatioString(
        'data:image/png;base64,abc',
        ''
      );
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null for non-numeric aspect ratio', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await processStyleReferenceForAspectRatioString(
        'data:image/png;base64,abc',
        'abc:def'
      );
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('processes a valid image with 16:9 aspect ratio', async () => {
      const promise = processStyleReferenceForAspectRatioString(
        'data:image/png;base64,testdata',
        '16:9'
      );

      // Wait for the Image to be created via the src setter
      await new Promise(resolve => queueMicrotask(resolve));

      // The first image is the main image being processed
      const img = imageInstances[0];
      expect(img).toBeDefined();
      img.width = 800;
      img.height = 600;
      img.onload?.();

      // A second Image is created internally as a debug check
      // Let it also complete
      await new Promise(resolve => queueMicrotask(resolve));
      if (imageInstances.length > 1) {
        imageInstances[1].onload?.();
      }

      const result = await promise;
      expect(result).toBe('data:image/png;base64,processed');
    });

    it('processes a valid image with 1:1 aspect ratio', async () => {
      const promise = processStyleReferenceForAspectRatioString(
        'data:image/png;base64,squaredata',
        '1:1'
      );

      await new Promise(resolve => queueMicrotask(resolve));

      const img = imageInstances[0];
      img.width = 500;
      img.height = 500;
      img.onload?.();

      await new Promise(resolve => queueMicrotask(resolve));
      if (imageInstances.length > 1) {
        imageInstances[1].onload?.();
      }

      const result = await promise;
      // When aspect ratios match AND targetDimensions are available, it still processes
      expect(result).toBe('data:image/png;base64,processed');
    });

    it('processes wider image (crops width)', async () => {
      const promise = processStyleReferenceForAspectRatioString(
        'data:image/png;base64,wide',
        '1:1' // Target is square, image is wide
      );

      await new Promise(resolve => queueMicrotask(resolve));

      const img = imageInstances[0];
      img.width = 1000;
      img.height = 500; // 2:1 ratio, wider than 1:1
      img.onload?.();

      await new Promise(resolve => queueMicrotask(resolve));
      if (imageInstances.length > 1) {
        imageInstances[1].onload?.();
      }

      const result = await promise;
      expect(result).toBe('data:image/png;base64,processed');
    });

    it('processes taller image (crops height)', async () => {
      const promise = processStyleReferenceForAspectRatioString(
        'data:image/png;base64,tall',
        '16:9' // Target is wide, image is tall
      );

      await new Promise(resolve => queueMicrotask(resolve));

      const img = imageInstances[0];
      img.width = 500;
      img.height = 1000; // 0.5:1 ratio, taller than 16:9
      img.onload?.();

      await new Promise(resolve => queueMicrotask(resolve));
      if (imageInstances.length > 1) {
        imageInstances[1].onload?.();
      }

      const result = await promise;
      expect(result).toBe('data:image/png;base64,processed');
    });

    it('rejects when image fails to load', async () => {
      const promise = processStyleReferenceForAspectRatioString(
        'data:image/png;base64,bad',
        '16:9'
      );

      await new Promise(resolve => queueMicrotask(resolve));

      const img = imageInstances[0];
      img.onerror?.();

      await expect(promise).rejects.toThrow('Failed to load image from data URL');
    });

    it('rejects when canvas context is unavailable', async () => {
      // Override document.createElement to return canvas with null context
      vi.stubGlobal('document', {
        createElement: vi.fn((tag: string) => {
          if (tag === 'canvas') {
            return {
              width: 0,
              height: 0,
              getContext: vi.fn().mockReturnValue(null),
            };
          }
          return {};
        }),
      });

      const promise = processStyleReferenceForAspectRatioString(
        'data:image/png;base64,nocontext',
        '16:9'
      );

      await new Promise(resolve => queueMicrotask(resolve));

      const img = imageInstances[0];
      img.width = 800;
      img.height = 600;
      img.onload?.();

      await expect(promise).rejects.toThrow('Failed to get canvas context');
    });

    it('handles 9:16 (portrait) aspect ratio', async () => {
      const promise = processStyleReferenceForAspectRatioString(
        'data:image/png;base64,portrait',
        '9:16'
      );

      await new Promise(resolve => queueMicrotask(resolve));

      const img = imageInstances[0];
      img.width = 800;
      img.height = 600;
      img.onload?.();

      await new Promise(resolve => queueMicrotask(resolve));
      if (imageInstances.length > 1) {
        imageInstances[1].onload?.();
      }

      const result = await promise;
      expect(result).toBe('data:image/png;base64,processed');
    });
  });
});
