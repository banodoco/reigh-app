import { describe, it, expect } from 'vitest';
import { resolutionToDimensions, aspectRatioToDimensions, extractDimensionsFromMedia } from '../dimensions';

describe('resolutionToDimensions', () => {
  it('parses a valid resolution string', () => {
    expect(resolutionToDimensions('1920x1080')).toEqual({ width: 1920, height: 1080 });
  });

  it('parses square resolution', () => {
    expect(resolutionToDimensions('512x512')).toEqual({ width: 512, height: 512 });
  });

  it('returns null for empty string', () => {
    expect(resolutionToDimensions('')).toBeNull();
  });

  it('returns null for string without x separator', () => {
    expect(resolutionToDimensions('1920-1080')).toBeNull();
  });

  it('returns null for invalid numbers', () => {
    expect(resolutionToDimensions('abcxdef')).toBeNull();
  });

  it('returns null for zero dimensions', () => {
    expect(resolutionToDimensions('0x1080')).toBeNull();
    expect(resolutionToDimensions('1920x0')).toBeNull();
  });

  it('returns null for negative dimensions', () => {
    expect(resolutionToDimensions('-1x1080')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(resolutionToDimensions(undefined as unknown as string)).toBeNull();
    expect(resolutionToDimensions(null as unknown as string)).toBeNull();
  });
});

describe('aspectRatioToDimensions', () => {
  it('converts 16:9 to known resolution', () => {
    const result = aspectRatioToDimensions('16:9');
    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThan(result!.height);
  });

  it('converts 1:1 to known resolution', () => {
    const result = aspectRatioToDimensions('1:1');
    expect(result).not.toBeNull();
    expect(result!.width).toBe(result!.height);
  });

  it('converts 9:16 to known portrait resolution', () => {
    const result = aspectRatioToDimensions('9:16');
    expect(result).not.toBeNull();
    expect(result!.height).toBeGreaterThan(result!.width);
  });

  it('returns null for empty string', () => {
    expect(aspectRatioToDimensions('')).toBeNull();
  });

  it('finds closest ratio for non-exact matches', () => {
    // 15:9 is close to 16:9
    const result = aspectRatioToDimensions('15:9');
    expect(result).not.toBeNull();
  });
});

describe('extractDimensionsFromMedia', () => {
  it('returns null for null media', () => {
    expect(extractDimensionsFromMedia(null)).toBeNull();
  });

  it('returns null for undefined media', () => {
    expect(extractDimensionsFromMedia(undefined)).toBeNull();
  });

  it('extracts dimensions from metadata width/height', () => {
    const media = {
      metadata: { width: 1920, height: 1080 },
    };
    expect(extractDimensionsFromMedia(media)).toEqual({ width: 1920, height: 1080 });
  });

  it('extracts from params.resolution', () => {
    const media = {
      params: { resolution: '1920x1080' },
    };
    expect(extractDimensionsFromMedia(media)).toEqual({ width: 1920, height: 1080 });
  });

  it('extracts from metadata.resolution', () => {
    const media = {
      params: {},
      metadata: { resolution: '1280x720' },
    };
    expect(extractDimensionsFromMedia(media)).toEqual({ width: 1280, height: 720 });
  });

  it('extracts from params.aspect_ratio', () => {
    const media = {
      params: { aspect_ratio: '16:9' },
    };
    const result = extractDimensionsFromMedia(media);
    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThan(result!.height);
  });

  it('prefers metadata width/height over resolution', () => {
    const media = {
      params: { resolution: '640x480' },
      metadata: { width: 1920, height: 1080 },
    };
    expect(extractDimensionsFromMedia(media)).toEqual({ width: 1920, height: 1080 });
  });

  it('prefers resolution over aspect_ratio', () => {
    const media = {
      params: { resolution: '640x480', aspect_ratio: '16:9' },
    };
    expect(extractDimensionsFromMedia(media)).toEqual({ width: 640, height: 480 });
  });

  it('checks extended sources when extended=true', () => {
    const media = {
      params: {
        orchestrator_details: '1024x768',
      },
    };
    // Without extended, should not find it
    expect(extractDimensionsFromMedia(media, false)).toBeNull();
    // With extended, should find it
    expect(extractDimensionsFromMedia(media, true)).toEqual({ width: 1024, height: 768 });
  });

  it('checks custom_aspect_ratio in extended mode', () => {
    const media = {
      params: {
        custom_aspect_ratio: '4:3',
      },
    };
    expect(extractDimensionsFromMedia(media, false)).toBeNull();
    const result = extractDimensionsFromMedia(media, true);
    expect(result).not.toBeNull();
  });

  it('returns null when media has no dimension info', () => {
    const media = {
      params: { prompt: 'a cat' },
      metadata: { some_field: 'value' },
    };
    expect(extractDimensionsFromMedia(media)).toBeNull();
  });

  it('ignores non-number metadata width/height', () => {
    const media = {
      metadata: { width: '1920', height: '1080' },
    };
    // String values should not be treated as valid width/height
    expect(extractDimensionsFromMedia(media)).toBeNull();
  });
});
