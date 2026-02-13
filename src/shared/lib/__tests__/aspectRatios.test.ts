import { describe, it, expect } from 'vitest';
import { parseRatio, findClosestAspectRatio, getPreviewDimensions } from '../aspectRatios';

describe('parseRatio', () => {
  it('returns NaN for null/undefined', () => {
    expect(parseRatio(null)).toBeNaN();
    expect(parseRatio(undefined)).toBeNaN();
  });

  it('parses "16:9"', () => {
    expect(parseRatio('16:9')).toBeCloseTo(16 / 9);
  });

  it('parses "1:1"', () => {
    expect(parseRatio('1:1')).toBe(1);
  });

  it('parses "9:16"', () => {
    expect(parseRatio('9:16')).toBeCloseTo(9 / 16);
  });

  it('returns 1 for "Square"', () => {
    expect(parseRatio('Square')).toBe(1);
  });

  it('returns NaN for invalid format', () => {
    expect(parseRatio('invalid')).toBeNaN();
    expect(parseRatio('16')).toBeNaN();
    expect(parseRatio('')).toBeNaN();
  });

  it('returns NaN for divide by zero', () => {
    expect(parseRatio('16:0')).toBeNaN();
  });

  it('returns NaN for non-numeric parts', () => {
    expect(parseRatio('a:b')).toBeNaN();
  });
});

describe('findClosestAspectRatio', () => {
  it('finds exact match for 16:9', () => {
    expect(findClosestAspectRatio(16 / 9)).toBe('16:9');
  });

  it('finds exact match for 1:1', () => {
    expect(findClosestAspectRatio(1)).toBe('1:1');
  });

  it('finds closest for in-between values', () => {
    // Between 16:9 (1.78) and 21:9 (2.33) — should pick 16:9 or 21:9
    const result = findClosestAspectRatio(2.0);
    expect(['16:9', '21:9']).toContain(result);
  });

  it('finds closest for extreme landscape', () => {
    const result = findClosestAspectRatio(3.0);
    expect(result).toBe('21:9');
  });

  it('finds closest for extreme portrait', () => {
    const result = findClosestAspectRatio(0.3);
    expect(result).toBe('9:21');
  });
});

describe('getPreviewDimensions', () => {
  it('returns 16:9 default for null/undefined', () => {
    const dims = getPreviewDimensions(null);
    expect(dims.height).toBe(200);
    expect(dims.width).toBe(Math.round(200 * 16 / 9));
  });

  it('calculates dimensions from valid ratio', () => {
    const dims = getPreviewDimensions('16:9');
    expect(dims.height).toBe(200);
    expect(dims.width).toBe(Math.round(200 * 16 / 9));
  });

  it('uses custom maxHeight', () => {
    const dims = getPreviewDimensions('1:1', 100);
    expect(dims.height).toBe(100);
    expect(dims.width).toBe(100);
  });

  it('handles portrait ratio', () => {
    const dims = getPreviewDimensions('9:16');
    expect(dims.height).toBe(200);
    expect(dims.width).toBe(Math.round(200 * 9 / 16));
  });

  it('returns default for invalid ratio string', () => {
    const dims = getPreviewDimensions('invalid');
    expect(dims.height).toBe(200);
    expect(dims.width).toBe(Math.round(200 * 16 / 9));
  });
});
