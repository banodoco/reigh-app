import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the browser extension type
vi.mock('@/types/browser-extensions', () => ({}));

// We need to mock navigator and window for device capability detection
beforeEach(() => {
  vi.stubGlobal('window', {
    innerWidth: 1920, // Desktop by default
  });
  vi.stubGlobal('navigator', {
    hardwareConcurrency: 8,
  });
});

import { getImageLoadingStrategy } from '../imageLoadingPriority';

describe('imageLoadingPriority', () => {
  describe('getImageLoadingStrategy', () => {
    const desktopConfig = { isMobile: false, totalImages: 20, isPreloaded: false };
    const mobileConfig = { isMobile: true, totalImages: 20, isPreloaded: false };

    describe('desktop behavior', () => {
      it('first image loads immediately (delay=0)', () => {
        const strategy = getImageLoadingStrategy(0, desktopConfig);

        expect(strategy.progressiveDelay).toBe(0);
        expect(strategy.shouldLoadInInitialBatch).toBe(true);
        expect(strategy.batchGroup).toBe(0);
      });

      it('initial batch items have minimal stagger delays', () => {
        // Desktop initialBatchSize is 4
        const s1 = getImageLoadingStrategy(1, desktopConfig);
        const s2 = getImageLoadingStrategy(2, desktopConfig);
        const s3 = getImageLoadingStrategy(3, desktopConfig);

        expect(s1.shouldLoadInInitialBatch).toBe(true);
        expect(s2.shouldLoadInInitialBatch).toBe(true);
        expect(s3.shouldLoadInInitialBatch).toBe(true);

        // Delays should be small multiples of 8ms
        expect(s1.progressiveDelay).toBe(8);
        expect(s2.progressiveDelay).toBe(16);
        expect(s3.progressiveDelay).toBe(24);
      });

      it('items beyond initial batch have larger progressive delays', () => {
        const s4 = getImageLoadingStrategy(4, desktopConfig);
        const s5 = getImageLoadingStrategy(5, desktopConfig);

        expect(s4.shouldLoadInInitialBatch).toBe(false);
        expect(s5.shouldLoadInInitialBatch).toBe(false);

        // These should use staggerDelay * (staggerIndex + 1)
        expect(s4.progressiveDelay).toBeGreaterThan(0);
        expect(s5.progressiveDelay).toBeGreaterThan(s4.progressiveDelay);
      });

      it('delays are capped at maxStaggerDelay', () => {
        // Even very high indices should not exceed maxStaggerDelay
        const sHigh = getImageLoadingStrategy(100, desktopConfig);

        // Desktop maxStaggerDelay is 100
        expect(sHigh.progressiveDelay).toBeLessThanOrEqual(100);
      });

      it('batch groups increment correctly', () => {
        // Desktop initialBatchSize is 4
        expect(getImageLoadingStrategy(0, desktopConfig).batchGroup).toBe(0);
        expect(getImageLoadingStrategy(3, desktopConfig).batchGroup).toBe(0);
        expect(getImageLoadingStrategy(4, desktopConfig).batchGroup).toBe(1);
        expect(getImageLoadingStrategy(7, desktopConfig).batchGroup).toBe(1);
        expect(getImageLoadingStrategy(8, desktopConfig).batchGroup).toBe(2);
      });
    });

    describe('mobile behavior', () => {
      it('first image loads immediately on mobile', () => {
        const strategy = getImageLoadingStrategy(0, mobileConfig);
        expect(strategy.progressiveDelay).toBe(0);
        expect(strategy.shouldLoadInInitialBatch).toBe(true);
      });

      it('mobile has smaller initial batch size', () => {
        // Mobile initialBatchSize should be 3 (for normal hardware)
        const s2 = getImageLoadingStrategy(2, mobileConfig);
        const s3 = getImageLoadingStrategy(3, mobileConfig);

        expect(s2.shouldLoadInInitialBatch).toBe(true);
        expect(s3.shouldLoadInInitialBatch).toBe(false);
      });

      it('mobile has higher stagger delays than desktop', () => {
        // Index 5 on both platforms
        const desktopDelay = getImageLoadingStrategy(5, desktopConfig).progressiveDelay;
        const mobileDelay = getImageLoadingStrategy(5, mobileConfig).progressiveDelay;

        expect(mobileDelay).toBeGreaterThanOrEqual(desktopDelay);
      });
    });

    describe('preloaded images', () => {
      it('preloaded images always have zero delay', () => {
        const preloadedConfig = { isMobile: false, totalImages: 20, isPreloaded: true };

        const s0 = getImageLoadingStrategy(0, preloadedConfig);
        const s5 = getImageLoadingStrategy(5, preloadedConfig);
        const s15 = getImageLoadingStrategy(15, preloadedConfig);

        expect(s0.progressiveDelay).toBe(0);
        expect(s5.progressiveDelay).toBe(0);
        expect(s15.progressiveDelay).toBe(0);
      });
    });

    describe('edge cases', () => {
      it('handles index 0 with single image', () => {
        const config = { isMobile: false, totalImages: 1, isPreloaded: false };
        const strategy = getImageLoadingStrategy(0, config);

        expect(strategy.progressiveDelay).toBe(0);
        expect(strategy.shouldLoadInInitialBatch).toBe(true);
      });

      it('handles very large index', () => {
        const strategy = getImageLoadingStrategy(1000, desktopConfig);

        expect(strategy.progressiveDelay).toBeLessThanOrEqual(100);
        expect(strategy.shouldLoadInInitialBatch).toBe(false);
      });
    });
  });
});
