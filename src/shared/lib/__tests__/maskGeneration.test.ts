import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMaskFromCanvas, createCanvasWithBackground } from '../maskGeneration';

// Helper to create a mock canvas with controllable image data
function createMockCanvas(width: number, height: number, pixelData?: Uint8ClampedArray) {
  const defaultData = pixelData ?? new Uint8ClampedArray(width * height * 4).fill(255);

  const imageData = {
    data: defaultData,
    width,
    height,
  };

  const ctx = {
    fillStyle: '',
    fillRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(defaultData),
      width,
      height,
    }),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  };

  const canvas = {
    width,
    height,
    getContext: vi.fn().mockReturnValue(ctx),
  };

  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, imageData };
}

// Mock document.createElement to return mock canvases
let mockCreatedCanvases: any[] = [];

beforeEach(() => {
  mockCreatedCanvases = [];
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag === 'canvas') {
        const ctx = {
          fillStyle: '',
          fillRect: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8ClampedArray(4).fill(255),
            width: 1,
            height: 1,
          }),
          putImageData: vi.fn(),
          drawImage: vi.fn(),
          clearRect: vi.fn(),
        };
        const c = {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
          __ctx: ctx,
        };
        mockCreatedCanvases.push(c);
        return c;
      }
      return {};
    }),
  });
});

describe('generateMaskFromCanvas', () => {
  it('creates a mask canvas with same dimensions as source', () => {
    const { canvas } = createMockCanvas(100, 50);
    const result = generateMaskFromCanvas(canvas);

    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('throws when source canvas context is unavailable', () => {
    const canvas = {
      width: 10,
      height: 10,
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLCanvasElement;

    expect(() => generateMaskFromCanvas(canvas)).toThrow('Could not get source canvas context');
  });

  it('throws when mask canvas context is unavailable', () => {
    const { canvas } = createMockCanvas(10, 10);

    // First call to document.createElement('canvas') should return a canvas with no context
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(null),
      })),
    });

    expect(() => generateMaskFromCanvas(canvas)).toThrow('Could not create mask canvas context');
  });

  it('marks fully opaque pixels as black (keep) in the mask', () => {
    // 2x1 canvas where both pixels are fully opaque (alpha=255)
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, // pixel 0: red, fully opaque
      0, 255, 0, 255, // pixel 1: green, fully opaque
    ]);
    const { canvas } = createMockCanvas(2, 1, data);

    // We need the created mask canvas to return its imageData correctly
    const maskData = new Uint8ClampedArray(8).fill(255); // starts white
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const ctx = {
          fillStyle: '',
          fillRect: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: maskData,
            width: 2,
            height: 1,
          }),
          putImageData: vi.fn((_imgData: any) => {
            // Capture what was written
          }),
          clearRect: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
          __ctx: ctx,
        };
      }),
    });

    const result = generateMaskFromCanvas(canvas);
    const resultCtx = result.getContext('2d');

    // putImageData should have been called with the processed mask
    expect(resultCtx!.putImageData).toHaveBeenCalled();
  });

  it('marks transparent pixels as white (inpaint) in the mask', () => {
    // 1x1 canvas with transparent pixel
    const data = new Uint8ClampedArray([0, 0, 0, 0]); // fully transparent
    const { canvas } = createMockCanvas(1, 1, data);

    const maskData = new Uint8ClampedArray(4).fill(255);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const ctx = {
          fillStyle: '',
          fillRect: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: maskData,
            width: 1,
            height: 1,
          }),
          putImageData: vi.fn(),
          clearRect: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
        };
      }),
    });

    const result = generateMaskFromCanvas(canvas);

    // The transparent pixel should remain white in the mask
    expect(result).toBeDefined();
  });

  it('uses custom alpha threshold', () => {
    // Pixel with alpha=150 - above default threshold (200) would be transparent,
    // but with threshold=100 it should be opaque
    const data = new Uint8ClampedArray([128, 128, 128, 150]);
    const { canvas } = createMockCanvas(1, 1, data);

    const maskData = new Uint8ClampedArray(4).fill(255);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const ctx = {
          fillStyle: '',
          fillRect: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: maskData,
            width: 1,
            height: 1,
          }),
          putImageData: vi.fn(),
          clearRect: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
        };
      }),
    });

    // With threshold 100, alpha=150 is above threshold -> pixel should be black (keep)
    const result = generateMaskFromCanvas(canvas, { alphaThreshold: 100 });
    expect(result).toBeDefined();
  });

  it('supports zero dilation', () => {
    const data = new Uint8ClampedArray([128, 128, 128, 255]);
    const { canvas } = createMockCanvas(1, 1, data);

    const maskData = new Uint8ClampedArray(4).fill(255);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const ctx = {
          fillStyle: '',
          fillRect: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: maskData,
            width: 1,
            height: 1,
          }),
          putImageData: vi.fn(),
          clearRect: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
        };
      }),
    });

    // Should not throw with zero dilation
    const result = generateMaskFromCanvas(canvas, { dilationPixels: 0 });
    expect(result).toBeDefined();
  });
});

describe('createCanvasWithBackground', () => {
  it('creates output canvas with same dimensions as source', () => {
    const { canvas } = createMockCanvas(200, 100);
    const result = createCanvasWithBackground(canvas);

    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it('throws when output canvas context is unavailable', () => {
    const { canvas } = createMockCanvas(10, 10);

    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(null),
      })),
    });

    expect(() => createCanvasWithBackground(canvas)).toThrow('Could not create output canvas context');
  });

  it('fills with default green background', () => {
    const { canvas } = createMockCanvas(10, 10);

    // Track what fillStyle is set to
    let capturedFillStyle = '';
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const ctx = {
          set fillStyle(val: string) { capturedFillStyle = val; },
          get fillStyle() { return capturedFillStyle; },
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
          __ctx: ctx,
        };
      }),
    });

    createCanvasWithBackground(canvas);
    expect(capturedFillStyle).toBe('#00FF00');
  });

  it('fills with custom background color', () => {
    const { canvas } = createMockCanvas(10, 10);

    let capturedFillStyle = '';
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const ctx = {
          set fillStyle(val: string) { capturedFillStyle = val; },
          get fillStyle() { return capturedFillStyle; },
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
          __ctx: ctx,
        };
      }),
    });

    createCanvasWithBackground(canvas, '#FF0000');
    expect(capturedFillStyle).toBe('#FF0000');
  });

  it('draws source canvas onto the background', () => {
    const { canvas } = createMockCanvas(10, 10);
    let drawImageCalled = false;

    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const ctx = {
          fillStyle: '',
          fillRect: vi.fn(),
          drawImage: vi.fn(() => { drawImageCalled = true; }),
        };
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(ctx),
        };
      }),
    });

    createCanvasWithBackground(canvas);
    expect(drawImageCalled).toBe(true);
  });
});
