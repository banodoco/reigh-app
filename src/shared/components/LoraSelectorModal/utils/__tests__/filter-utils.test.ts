import { describe, it, expect } from 'vitest';
import { getFilterCategory, getDefaultSubFilter, getSubFilterOptions, matchesFilters } from '../filter-utils';

describe('getFilterCategory', () => {
  it('returns "all" for undefined loraType', () => {
    expect(getFilterCategory(undefined)).toBe('all');
  });

  it('returns "qwen" for qwen-containing types', () => {
    expect(getFilterCategory('Qwen Image')).toBe('qwen');
    expect(getFilterCategory('Qwen Edit')).toBe('qwen');
    expect(getFilterCategory('qwen_something')).toBe('qwen');
  });

  it('returns "wan" for wan-containing types', () => {
    expect(getFilterCategory('Wan 2.1 T2V 14B')).toBe('wan');
    expect(getFilterCategory('Wan 2.2 I2V')).toBe('wan');
  });

  it('returns "z-image" for z-image types', () => {
    expect(getFilterCategory('Z-Image')).toBe('z-image');
    expect(getFilterCategory('z-image')).toBe('z-image');
  });

  it('returns "all" for unrecognized types', () => {
    expect(getFilterCategory('SomeOtherModel')).toBe('all');
    expect(getFilterCategory('')).toBe('all');
  });

  it('is case insensitive', () => {
    expect(getFilterCategory('QWEN IMAGE')).toBe('qwen');
    expect(getFilterCategory('WAN 2.1')).toBe('wan');
    expect(getFilterCategory('Z-IMAGE')).toBe('z-image');
  });
});

describe('getSubFilterOptions', () => {
  it('returns qwen options for "qwen" category', () => {
    const options = getSubFilterOptions('qwen');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toEqual({ value: 'all', label: 'All' });
    expect(options.some(o => o.value === 'Qwen Image')).toBe(true);
  });

  it('returns wan options for "wan" category', () => {
    const options = getSubFilterOptions('wan');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toEqual({ value: 'all', label: 'All' });
    expect(options.some(o => o.value === 'Wan 2.1 T2V 14B')).toBe(true);
  });

  it('returns z-image options for "z-image" category', () => {
    const options = getSubFilterOptions('z-image');
    expect(options.length).toBeGreaterThan(0);
    expect(options.some(o => o.value === 'Z-Image')).toBe(true);
  });

  it('returns empty array for "all" category', () => {
    expect(getSubFilterOptions('all')).toEqual([]);
  });
});

describe('getDefaultSubFilter', () => {
  it('returns "all" for undefined loraType', () => {
    expect(getDefaultSubFilter(undefined)).toBe('all');
  });

  it('returns the loraType if it matches a sub-filter option', () => {
    expect(getDefaultSubFilter('Qwen Image')).toBe('Qwen Image');
    expect(getDefaultSubFilter('Wan 2.1 T2V 14B')).toBe('Wan 2.1 T2V 14B');
    expect(getDefaultSubFilter('Z-Image')).toBe('Z-Image');
  });

  it('returns "all" for types that do not match any sub-filter option', () => {
    expect(getDefaultSubFilter('SomeUnknownModel')).toBe('all');
  });
});

describe('matchesFilters', () => {
  it('matches everything when category is "all"', () => {
    expect(matchesFilters('Qwen Image', 'all', 'all')).toBe(true);
    expect(matchesFilters(undefined, 'all', 'all')).toBe(true);
    expect(matchesFilters('anything', 'all', 'all')).toBe(true);
  });

  it('matches qwen types against qwen category', () => {
    expect(matchesFilters('Qwen Image', 'qwen', 'all')).toBe(true);
    expect(matchesFilters('Wan 2.1', 'qwen', 'all')).toBe(false);
  });

  it('filters by sub-filter when not "all"', () => {
    expect(matchesFilters('Qwen Image', 'qwen', 'Qwen Image')).toBe(true);
    expect(matchesFilters('Qwen Edit', 'qwen', 'Qwen Image')).toBe(false);
  });

  it('rejects undefined loraType for non-all categories', () => {
    expect(matchesFilters(undefined, 'qwen', 'all')).toBe(false);
    expect(matchesFilters(undefined, 'wan', 'all')).toBe(false);
  });

  it('matches wan types correctly', () => {
    expect(matchesFilters('Wan 2.1 T2V 14B', 'wan', 'all')).toBe(true);
    expect(matchesFilters('Wan 2.1 T2V 14B', 'wan', 'Wan 2.1 T2V 14B')).toBe(true);
    expect(matchesFilters('Wan 2.1 T2V 14B', 'wan', 'Wan 2.2 T2V')).toBe(false);
  });

  it('matches z-image types correctly', () => {
    expect(matchesFilters('Z-Image', 'z-image', 'all')).toBe(true);
    expect(matchesFilters('Z-Image', 'z-image', 'Z-Image')).toBe(true);
  });
});
