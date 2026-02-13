import { describe, it, expect } from 'vitest';
import { safeAreaCalc } from '../safeArea';

describe('safeAreaCalc', () => {
  it('generates calc with top inset', () => {
    expect(safeAreaCalc('16px', 'top')).toBe('calc(16px + env(safe-area-inset-top, 0px))');
  });

  it('generates calc with bottom inset', () => {
    expect(safeAreaCalc('0px', 'bottom')).toBe('calc(0px + env(safe-area-inset-bottom, 0px))');
  });

  it('generates calc with left inset', () => {
    expect(safeAreaCalc('8px', 'left')).toBe('calc(8px + env(safe-area-inset-left, 0px))');
  });

  it('generates calc with right inset', () => {
    expect(safeAreaCalc('2rem', 'right')).toBe('calc(2rem + env(safe-area-inset-right, 0px))');
  });

  describe('maxHeight', () => {
    it('generates maxHeight calc with offset and fallback', () => {
      const result = safeAreaCalc.maxHeight('64px', '100vh');
      expect(result).toBe('calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 64px)');
    });
  });

  describe('verticalCenter', () => {
    it('generates vertical center calc', () => {
      const result = safeAreaCalc.verticalCenter();
      expect(result).toBe('calc(50% + env(safe-area-inset-top, 0px) / 2 - env(safe-area-inset-bottom, 0px) / 2)');
    });
  });

  describe('marginBottom', () => {
    it('generates margin bottom calc with rem offset', () => {
      const result = safeAreaCalc.marginBottom(1);
      expect(result).toBe('calc(1rem + env(safe-area-inset-bottom, 0px))');
    });

    it('handles zero offset', () => {
      const result = safeAreaCalc.marginBottom(0);
      expect(result).toBe('calc(0rem + env(safe-area-inset-bottom, 0px))');
    });
  });

  describe('paddingBottom', () => {
    it('generates padding bottom calc with base', () => {
      const result = safeAreaCalc.paddingBottom('1rem');
      expect(result).toBe('calc(1rem + env(safe-area-inset-bottom, 0px))');
    });
  });
});
