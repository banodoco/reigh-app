import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ITEMS_PER_PAGE,
  GRID_COLUMN_CLASSES,
  SKELETON_COLUMNS,
} from '../mediaGallery-constants';
import { calculateGalleryLayout } from '../mediaGallery-layout';

describe('constants', () => {
  it('DEFAULT_ITEMS_PER_PAGE has mobile and desktop values', () => {
    expect(DEFAULT_ITEMS_PER_PAGE.MOBILE).toBe(20);
    expect(DEFAULT_ITEMS_PER_PAGE.DESKTOP).toBe(45);
  });

  it('GRID_COLUMN_CLASSES has entries for 2-12 columns', () => {
    for (let i = 2; i <= 12; i++) {
      expect(GRID_COLUMN_CLASSES[i as keyof typeof GRID_COLUMN_CLASSES]).toBeDefined();
    }
  });

  it('SKELETON_COLUMNS has matching entries for all GRID_COLUMN_CLASSES keys', () => {
    for (const key of Object.keys(GRID_COLUMN_CLASSES)) {
      expect(SKELETON_COLUMNS[Number(key) as keyof typeof SKELETON_COLUMNS]).toBeDefined();
    }
  });

  it('SKELETON_COLUMNS 2xl value matches the column count key', () => {
    for (const [key, value] of Object.entries(SKELETON_COLUMNS)) {
      expect(value['2xl']).toBe(Number(key));
    }
  });
});

describe('calculateGalleryLayout', () => {
  describe('basic behavior', () => {
    it('returns columns, rows, itemsPerPage, skeletonColumns, and gridColumnClasses', () => {
      const result = calculateGalleryLayout('16:9', false);
      expect(result).toHaveProperty('columns');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('itemsPerPage');
      expect(result).toHaveProperty('skeletonColumns');
      expect(result).toHaveProperty('gridColumnClasses');
    });

    it('itemsPerPage equals columns * rows', () => {
      const result = calculateGalleryLayout('16:9', false);
      expect(result.itemsPerPage).toBe(result.columns * result.rows);
    });
  });

  describe('aspect ratio variations (no container width)', () => {
    it('returns fewer columns for wide (landscape) images', () => {
      const landscape = calculateGalleryLayout('21:9', false);
      const portrait = calculateGalleryLayout('9:21', false);
      expect(landscape.columns).toBeLessThanOrEqual(portrait.columns);
    });

    it('returns more columns for tall (portrait) images', () => {
      const portrait = calculateGalleryLayout('9:16', false);
      const square = calculateGalleryLayout('1:1', false);
      expect(portrait.columns).toBeGreaterThanOrEqual(square.columns);
    });

    it('defaults to 16:9 ratio for null aspectRatioStr', () => {
      const result = calculateGalleryLayout(null, false);
      const explicit16by9 = calculateGalleryLayout('16:9', false);
      expect(result.columns).toBe(explicit16by9.columns);
    });

    it('defaults to 16:9 ratio for undefined aspectRatioStr', () => {
      const result = calculateGalleryLayout(undefined, false);
      const explicit16by9 = calculateGalleryLayout('16:9', false);
      expect(result.columns).toBe(explicit16by9.columns);
    });
  });

  describe('mobile vs desktop', () => {
    it('uses mobile default rows when isMobile=true without container dimensions', () => {
      const mobileResult = calculateGalleryLayout('16:9', true);
      const desktopResult = calculateGalleryLayout('16:9', false);
      // Mobile default is 5, desktop default is 6
      expect(mobileResult.rows).toBe(5);
      expect(desktopResult.rows).toBe(6);
    });

    it('mobile always uses fixed rows even with container dimensions', () => {
      const result = calculateGalleryLayout('16:9', true, 1200, 800);
      expect(result.rows).toBe(5);
    });
  });

  describe('dynamic column calculation with container width', () => {
    it('calculates more columns for wider containers', () => {
      const narrow = calculateGalleryLayout('16:9', false, 400);
      const wide = calculateGalleryLayout('16:9', false, 1600);
      expect(wide.columns).toBeGreaterThan(narrow.columns);
    });

    it('clamps columns to minimum of 2', () => {
      const result = calculateGalleryLayout('16:9', false, 50);
      expect(result.columns).toBeGreaterThanOrEqual(2);
    });

    it('clamps columns to maximum of 24', () => {
      const result = calculateGalleryLayout('16:9', false, 100000);
      expect(result.columns).toBeLessThanOrEqual(24);
    });

    it('falls back to static calculation when containerWidth is 0', () => {
      const withZero = calculateGalleryLayout('16:9', false, 0);
      const withoutWidth = calculateGalleryLayout('16:9', false);
      expect(withZero.columns).toBe(withoutWidth.columns);
    });
  });

  describe('dynamic row calculation with container height', () => {
    it('calculates rows based on container height on desktop', () => {
      const short = calculateGalleryLayout('16:9', false, 1200, 400);
      const tall = calculateGalleryLayout('16:9', false, 1200, 1200);
      expect(tall.rows).toBeGreaterThanOrEqual(short.rows);
    });

    it('clamps rows to minimum of 2', () => {
      const result = calculateGalleryLayout('16:9', false, 1200, 50);
      expect(result.rows).toBeGreaterThanOrEqual(2);
    });

    it('clamps rows to maximum of 12', () => {
      const result = calculateGalleryLayout('16:9', false, 1200, 100000);
      expect(result.rows).toBeLessThanOrEqual(12);
    });

    it('uses desktop default rows when only width is provided', () => {
      const result = calculateGalleryLayout('16:9', false, 1200);
      expect(result.rows).toBe(6);
    });
  });

  describe('gridColumnClasses and skeletonColumns', () => {
    it('returns valid grid column classes for clamped column count', () => {
      const result = calculateGalleryLayout('16:9', false, 800);
      expect(result.gridColumnClasses).toBeDefined();
      expect(typeof result.gridColumnClasses).toBe('string');
      expect(result.gridColumnClasses).toContain('grid-cols');
    });

    it('returns valid skeleton columns object', () => {
      const result = calculateGalleryLayout('16:9', false, 800);
      expect(result.skeletonColumns).toBeDefined();
      expect(result.skeletonColumns).toHaveProperty('base');
    });
  });

  describe('reducedSpacing parameter', () => {
    it('uses different gap with reducedSpacing on small screens', () => {
      // With jsdom default (window.innerWidth probably 0 or some default < 640)
      // reducedSpacing=true should use 8px gap, which means more columns
      const normal = calculateGalleryLayout('16:9', false, 1000, 800, false);
      const reduced = calculateGalleryLayout('16:9', false, 1000, 800, true);
      // With smaller gap, more columns can fit
      expect(reduced.columns).toBeGreaterThanOrEqual(normal.columns);
    });
  });

  describe('invalid aspect ratio strings', () => {
    it('handles invalid format gracefully', () => {
      const result = calculateGalleryLayout('invalid', false);
      // Should default to 16:9
      expect(result.columns).toBeGreaterThan(0);
      expect(result.rows).toBeGreaterThan(0);
    });

    it('handles single number', () => {
      const result = calculateGalleryLayout('16', false);
      expect(result.columns).toBeGreaterThan(0);
    });

    it('handles zero height in ratio', () => {
      const result = calculateGalleryLayout('16:0', false);
      // Should default to 16:9
      const defaultResult = calculateGalleryLayout(null, false);
      expect(result.columns).toBe(defaultResult.columns);
    });
  });
});
