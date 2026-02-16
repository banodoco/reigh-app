import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock gifenc
vi.mock('gifenc', () => {
  const mockGif = {
    writeFrame: vi.fn(),
    finish: vi.fn(),
    bytes: vi.fn().mockReturnValue(new Uint8Array([71, 73, 70])),
  };
  return {
    GIFEncoder: vi.fn().mockReturnValue(mockGif),
    quantize: vi.fn().mockReturnValue([[0, 0, 0, 255]]),
    applyPalette: vi.fn().mockReturnValue(new Uint8Array([0])),
  };
});

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock URL.createObjectURL and revokeObjectURL
vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-image');
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

// Mock canvas
const mockCtx = {
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn().mockReturnValue({
    data: new Uint8ClampedArray([0, 0, 0, 255]),
  }),
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn().mockReturnValue(mockCtx),
};

// Mock Image
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 1920;
  height = 1080;
  private _src = '';

  get src() { return this._src; }
  set src(value: string) {
    this._src = value;
    setTimeout(() => this.onload?.(), 0);
  }
}
// @ts-expect-error Test replaces global Image with a lightweight mock.
globalThis.Image = MockImage;

vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'canvas') return mockCanvas as unknown;
  if (tag === 'a') {
    return {
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown;
  }
  return document.createElement(tag);
});

import { createLineageGif, downloadBlob } from '../createLineageGif';

describe('createLineageGif', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['image'], { type: 'image/png' })),
    });
  });

  it('throws for empty image list', async () => {
    await expect(createLineageGif([])).rejects.toThrow('No images provided');
  });

  it('creates a GIF from image URLs', async () => {
    const blob = await createLineageGif(['https://example.com/img1.jpg', 'https://example.com/img2.jpg']);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/gif');
  });

  it('reports progress during loading and encoding', async () => {
    const onProgress = vi.fn();

    await createLineageGif(
      ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      {},
      onProgress
    );

    // Should have loading and encoding progress
    const stages = onProgress.mock.calls.map((c: unknown[]) => c[0].stage);
    expect(stages).toContain('loading');
    expect(stages).toContain('encoding');
    expect(stages).toContain('complete');
  });

  it('accepts custom frame delay and width', async () => {
    const blob = await createLineageGif(
      ['https://example.com/img.jpg'],
      { frameDelay: 500, width: 256 }
    );

    expect(blob).toBeInstanceOf(Blob);
    expect(mockCanvas.width).toBe(256);
  });

  it('throws when all images fail to load', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    await expect(
      createLineageGif(['https://example.com/broken.jpg'])
    ).rejects.toThrow('No images could be loaded');
  });

  it('skips individual failed images', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['image'], { type: 'image/png' })),
      });
    });

    const blob = await createLineageGif([
      'https://example.com/broken.jpg',
      'https://example.com/good.jpg',
    ]);

    expect(blob).toBeInstanceOf(Blob);
  });
});

describe('downloadBlob', () => {
  it('creates and clicks a download link', () => {
    const mockAnchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown);

    const blob = new Blob(['test'], { type: 'image/gif' });
    downloadBlob(blob, 'test.gif');

    expect(mockAnchor.download).toBe('test.gif');
    expect(mockAnchor.click).toHaveBeenCalled();
  });
});
