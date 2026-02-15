import {
  describe,
  it,
  expect,
  vi,
  afterEach
} from 'vitest';
import { getPreloadConfig } from '../config';

describe('getPreloadConfig', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true });
    // Clean up navigator mocks
    vi.restoreAllMocks();
  });

  it('returns desktop config for wide screens', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });

    const config = getPreloadConfig();
    expect(config.maxConcurrent).toBe(3);
    expect(config.debounceMs).toBe(150);
    expect(config.maxImagesPerPage).toBe(10);
    expect(config.preloadThumbnailsOnly).toBe(false);
  });

  it('returns mobile config for narrow screens', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });

    const config = getPreloadConfig();
    expect(config.maxConcurrent).toBe(2);
    expect(config.debounceMs).toBe(200);
    expect(config.maxImagesPerPage).toBe(6);
    expect(config.preloadThumbnailsOnly).toBe(true);
  });

  it('returns mobile config at boundary (768px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true });

    const config = getPreloadConfig();
    expect(config.maxConcurrent).toBe(2);
    expect(config.preloadThumbnailsOnly).toBe(true);
  });

  it('returns slow connection config when effectiveType is 2g', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '2g' },
      configurable: true,
    });

    const config = getPreloadConfig();
    expect(config.maxConcurrent).toBe(1);
    expect(config.debounceMs).toBe(300);
    expect(config.maxImagesPerPage).toBe(3);
    expect(config.preloadThumbnailsOnly).toBe(true);

    // Cleanup
    Object.defineProperty(navigator, 'connection', {
      value: undefined,
      configurable: true,
    });
  });

  it('returns low memory config when deviceMemory is low', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(navigator, 'deviceMemory', {
      value: 2,
      configurable: true,
    });

    const config = getPreloadConfig();
    expect(config.maxConcurrent).toBe(2);
    expect(config.preloadThumbnailsOnly).toBe(true);

    // Cleanup
    Object.defineProperty(navigator, 'deviceMemory', {
      value: undefined,
      configurable: true,
    });
  });
});
