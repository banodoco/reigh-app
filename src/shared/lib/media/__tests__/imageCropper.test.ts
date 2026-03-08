import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock errorHandler
// We need to mock FileReader, Image, document.createElement, URL.createObjectURL
let imageInstances: unknown[] = [];

beforeEach(() => {
  imageInstances = [];

  // Mock FileReader - triggers onload synchronously for predictability
  vi.stubGlobal('FileReader', class MockFileReader {
    onload: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    result: string | null = null;

    readAsDataURL(_file: File) {
      this.result = 'data:image/png;base64,mockdata';
      // Use queueMicrotask for more predictable ordering
      queueMicrotask(() => {
        this.onload?.({ target: { result: this.result } });
      });
    }
  });

  // Mock Image - does NOT auto-trigger, tests control when onload fires
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

  // Mock canvas
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag === 'canvas') {
        const ctx = {
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'low',
          drawImage: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
          toBlob: vi.fn((callback: (blob: Blob | null) => void, mime: string, _quality: number) => {
            const blob = new Blob(['cropped-data'], { type: mime });
            callback(blob);
          }),
          toDataURL: vi.fn().mockReturnValue('data:image/png;base64,fallback'),
        };
      }
      return {};
    }),
  });

  // Mock URL.createObjectURL
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/mock-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { cropImageToProjectAspectRatio } from '../imageCropper';

// Helper: trigger the image load after FileReader completes
async function waitForImageInstance(): Promise<unknown> {
  // Wait for FileReader microtask to fire, which sets img.src
  await new Promise(resolve => queueMicrotask(resolve));
  await new Promise(resolve => queueMicrotask(resolve));
  // Now image instance should exist
  return imageInstances[imageInstances.length - 1];
}

describe('imageCropper', () => {
  describe('cropImageToProjectAspectRatio', () => {
    it('returns null for non-image file type', async () => {
      const file = new File(['data'], 'document.pdf', { type: 'application/pdf' });
      const result = await cropImageToProjectAspectRatio(file, 16 / 9);
      expect(result).toBeNull();
    });

    it('returns null for NaN aspect ratio', async () => {
      const file = new File(['data'], 'image.png', { type: 'image/png' });
      const result = await cropImageToProjectAspectRatio(file, NaN);
      expect(result).toBeNull();
    });

    it('returns null for zero aspect ratio', async () => {
      const file = new File(['data'], 'image.png', { type: 'image/png' });
      const result = await cropImageToProjectAspectRatio(file, 0);
      expect(result).toBeNull();
    });

    it('returns null for negative aspect ratio', async () => {
      const file = new File(['data'], 'image.png', { type: 'image/png' });
      const result = await cropImageToProjectAspectRatio(file, -1);
      expect(result).toBeNull();
    });

    it('accepts image by MIME type and crops', async () => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const promise = cropImageToProjectAspectRatio(file, 16 / 9);

      const img = await waitForImageInstance();
      img.width = 1920;
      img.height = 1080;
      img.onload?.();

      const result = await promise;
      expect(result).not.toBeNull();
      expect(result?.croppedFile).toBeInstanceOf(File);
      expect(result?.croppedImageUrl).toBe('blob:http://localhost/mock-url');
    });

    it('accepts image by file extension for unknown MIME', async () => {
      // HEIC files may not have a proper MIME type on mobile
      const file = new File(['data'], 'photo.heic', { type: '' });
      const promise = cropImageToProjectAspectRatio(file, 1);

      const img = await waitForImageInstance();
      img.width = 500;
      img.height = 500;
      img.onload?.();

      const result = await promise;
      expect(result).not.toBeNull();
      expect(result?.croppedFile).toBeDefined();
    });

    it('skips re-encoding when aspect ratio already matches', async () => {
      const file = new File(['data'], 'perfect.png', { type: 'image/png' });
      const promise = cropImageToProjectAspectRatio(file, 1.0);

      const img = await waitForImageInstance();
      img.width = 500;
      img.height = 500; // exactly 1:1
      img.onload?.();

      const result = await promise;
      expect(result).not.toBeNull();
      // When aspect ratio matches, it should return the original file
      expect(result?.croppedFile).toBe(file);
    });

    it('crops wider image to narrower target', async () => {
      const file = new File(['data'], 'wide.jpg', { type: 'image/jpeg' });
      // Image is 2000x1000 (2:1), target is 16:9 (1.777:1)
      const promise = cropImageToProjectAspectRatio(file, 16 / 9);

      const img = await waitForImageInstance();
      img.width = 2000;
      img.height = 1000;
      img.onload?.();

      const result = await promise;
      expect(result).not.toBeNull();
      expect(result?.croppedFile).toBeInstanceOf(File);
    });

    it('crops taller image to wider target', async () => {
      const file = new File(['data'], 'tall.png', { type: 'image/png' });
      // Image is 500x1000 (0.5:1), target is 1:1
      const promise = cropImageToProjectAspectRatio(file, 1.0);

      const img = await waitForImageInstance();
      img.width = 500;
      img.height = 1000;
      img.onload?.();

      const result = await promise;
      expect(result).not.toBeNull();
    });

    it('preserves PNG output format for PNG input', async () => {
      const file = new File(['data'], 'input.png', { type: 'image/png' });
      const promise = cropImageToProjectAspectRatio(file, 16 / 9);

      const img = await waitForImageInstance();
      img.width = 800;
      img.height = 600;
      img.onload?.();

      const result = await promise;
      expect(result?.croppedFile.type).toBe('image/png');
      expect(result?.croppedFile.name).toMatch(/\.png$/);
    });

    it('falls back to JPEG for unsupported MIME types', async () => {
      // BMP is not in the supported list for output
      const file = new File(['data'], 'input.bmp', { type: 'image/bmp' });
      const promise = cropImageToProjectAspectRatio(file, 16 / 9);

      const img = await waitForImageInstance();
      img.width = 800;
      img.height = 600;
      img.onload?.();

      const result = await promise;
      expect(result?.croppedFile.type).toBe('image/jpeg');
      expect(result?.croppedFile.name).toMatch(/\.jpg$/);
    });

    it('rejects when image fails to load', async () => {
      const file = new File(['data'], 'bad.png', { type: 'image/png' });
      const promise = cropImageToProjectAspectRatio(file, 1.0);

      const img = await waitForImageInstance();
      img.onerror?.('Failed to decode');

      await expect(promise).rejects.toThrow('Failed to load image');
    });

    it('rejects when canvas context is unavailable', async () => {
      vi.stubGlobal('document', {
        createElement: vi.fn(() => ({
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(null),
        })),
      });

      const file = new File(['data'], 'nocanvas.png', { type: 'image/png' });
      const promise = cropImageToProjectAspectRatio(file, 16 / 9);

      const img = await waitForImageInstance();
      img.width = 800;
      img.height = 600;
      img.onload?.();

      await expect(promise).rejects.toThrow('Failed to get canvas context');
    });

    it('preserves WebP output format for WebP input', async () => {
      const file = new File(['data'], 'input.webp', { type: 'image/webp' });
      const promise = cropImageToProjectAspectRatio(file, 16 / 9);

      const img = await waitForImageInstance();
      img.width = 800;
      img.height = 600;
      img.onload?.();

      const result = await promise;
      expect(result?.croppedFile.type).toBe('image/webp');
      expect(result?.croppedFile.name).toMatch(/\.webp$/);
    });
  });
});
