import { describe, it, expect } from 'vitest';
import { sanitizeSettings, deepEqual, deepMerge } from '@/shared/lib/utils/deepEqual';

describe('sanitizeSettings', () => {
  it('returns primitives unchanged', () => {
    expect(sanitizeSettings(42)).toBe(42);
    expect(sanitizeSettings('hello')).toBe('hello');
    expect(sanitizeSettings(null)).toBe(null);
    expect(sanitizeSettings(true)).toBe(true);
  });

  it('strips undefined values from objects', () => {
    expect(sanitizeSettings({ a: 1, b: undefined, c: 3 })).toEqual({ a: 1, c: 3 });
  });

  it('strips undefined values recursively', () => {
    expect(sanitizeSettings({ a: { b: undefined, c: 2 }, d: undefined })).toEqual({ a: { c: 2 } });
  });

  it('preserves arrays and sanitizes their elements', () => {
    expect(sanitizeSettings([{ a: 1, b: undefined }, { c: undefined }])).toEqual([{ a: 1 }, {}]);
  });

  it('preserves null values (only strips undefined)', () => {
    expect(sanitizeSettings({ a: null, b: undefined })).toEqual({ a: null });
  });

  it('handles empty objects and arrays', () => {
    expect(sanitizeSettings({})).toEqual({});
    expect(sanitizeSettings([])).toEqual([]);
  });
});

describe('deepEqual', () => {
  it('returns true for identical primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
  });

  it('returns false for different primitives', () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'b')).toBe(false);
  });

  it('returns true for same objects', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('returns false for different objects', () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('treats undefined values as absent (sanitized away)', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('returns false for circular references (JSON.stringify throws)', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(deepEqual(obj, obj)).toBe(false);
  });

  it('handles nested objects', () => {
    expect(deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })).toBe(true);
    expect(deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(false);
  });

  it('handles arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
});

describe('deepMerge', () => {
  it('returns target when no sources', () => {
    const target = { a: 1 };
    expect(deepMerge(target)).toEqual({ a: 1 });
  });

  it('merges simple properties', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('overwrites with source values', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it('replaces arrays entirely (does not merge)', () => {
    expect(deepMerge({ arr: [1, 2] }, { arr: [3, 4, 5] })).toEqual({ arr: [3, 4, 5] });
  });

  it('deep clones arrays to prevent reference sharing', () => {
    const source = { arr: [{ nested: true }] };
    const result = deepMerge({}, source);
    expect(result.arr).toEqual([{ nested: true }]);
    expect(result.arr).not.toBe(source.arr);
  });

  it('merges objects recursively', () => {
    expect(deepMerge(
      { nested: { a: 1, b: 2 } },
      { nested: { b: 3, c: 4 } },
    )).toEqual({ nested: { a: 1, b: 3, c: 4 } });
  });

  it('handles multiple sources', () => {
    expect(deepMerge(
      { a: 1 },
      { b: 2 },
      { c: 3 },
    )).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('skips null/undefined sources', () => {
    expect(deepMerge({ a: 1 }, null, undefined, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('skips undefined values in source (does not overwrite)', () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: undefined, b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('creates nested objects when target has none', () => {
    expect(deepMerge({}, { nested: { a: 1 } })).toEqual({ nested: { a: 1 } });
  });
});
