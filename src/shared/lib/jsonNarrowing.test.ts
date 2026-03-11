import { describe, expect, it } from 'vitest';
import { asRecord, asString, asStringArray, firstString } from './jsonNarrowing';

describe('jsonNarrowing', () => {
  it('narrows records and rejects arrays or nullish values', () => {
    expect(asRecord({ id: 'value' })).toEqual({ id: 'value' });
    expect(asRecord(['nope'])).toBeNull();
    expect(asRecord(null)).toBeNull();
  });

  it('narrows strings and string arrays', () => {
    expect(asString('hello')).toBe('hello');
    expect(asString(42)).toBeNull();
    expect(asStringArray(['a', 'b', 3, null])).toEqual(['a', 'b']);
    expect(asStringArray('not-an-array')).toBeNull();
  });

  it('returns the first non-empty string candidate', () => {
    expect(firstString(undefined, '', null, 'value', 'later')).toBe('value');
    expect(firstString(undefined, null, false)).toBeNull();
  });
});
