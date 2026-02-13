import { describe, it, expect } from 'vitest';
import { getImageAspectRatioStyle } from '../imageAspectRatio';

describe('getImageAspectRatioStyle', () => {
  it('uses image metadata width/height (priority 1)', () => {
    const result = getImageAspectRatioStyle({
      metadata: { width: 1920, height: 1080 },
    });
    expect(result.aspectRatio).toBe(`${1920 / 1080}`);
  });

  it('extracts resolution from originalParams (priority 2)', () => {
    const result = getImageAspectRatioStyle({
      metadata: {
        originalParams: {
          orchestrator_details: { resolution: '1920x1080' },
        },
      },
    });
    expect(result.aspectRatio).toBe(`${1920 / 1080}`);
  });

  it('uses project aspect ratio (priority 3)', () => {
    const result = getImageAspectRatioStyle({}, '16:9');
    expect(result.aspectRatio).toBe(`${16 / 9}`);
  });

  it('defaults to square (priority 4)', () => {
    const result = getImageAspectRatioStyle({});
    expect(result.aspectRatio).toBe('1');
  });

  it('prefers metadata over project ratio', () => {
    const result = getImageAspectRatioStyle(
      { metadata: { width: 100, height: 200 } },
      '16:9',
    );
    expect(result.aspectRatio).toBe(`${100 / 200}`);
  });

  it('handles portrait dimensions', () => {
    const result = getImageAspectRatioStyle({
      metadata: { width: 768, height: 1024 },
    });
    expect(parseFloat(result.aspectRatio)).toBeLessThan(1);
  });

  it('handles invalid resolution string', () => {
    const result = getImageAspectRatioStyle({
      metadata: {
        originalParams: {
          orchestrator_details: { resolution: 'invalid' },
        },
      },
    });
    // Should fall through to default
    expect(result.aspectRatio).toBe('1');
  });

  it('handles invalid project aspect ratio', () => {
    const result = getImageAspectRatioStyle({}, 'not:valid:ratio');
    expect(result.aspectRatio).toBe('1');
  });
});
