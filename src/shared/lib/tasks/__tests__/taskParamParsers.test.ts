import { describe, expect, it } from 'vitest';
import {
  asBoolean,
  asNumber,
  asNumberArray,
  asRecord,
  asString,
  asStringArray,
  toRecordOrEmpty,
} from '../taskParamParsers';

describe('taskParamParsers', () => {
  it('parses records and falls back to empty record for non-objects', () => {
    expect(asRecord({ ok: true })).toEqual({ ok: true });
    expect(asRecord(null)).toBeUndefined();
    expect(asRecord([])).toBeUndefined();
    expect(toRecordOrEmpty(null)).toEqual({});
  });

  it('parses primitive helpers with strict type checks', () => {
    expect(asString('x')).toBe('x');
    expect(asString(1)).toBeUndefined();
    expect(asNumber(4)).toBe(4);
    expect(asNumber(Number.NaN)).toBeUndefined();
    expect(asBoolean(false)).toBe(false);
    expect(asBoolean('false')).toBeUndefined();
  });

  it('filters arrays to valid typed entries only', () => {
    expect(asStringArray(['a', 2, 'b', null])).toEqual(['a', 'b']);
    expect(asStringArray('nope')).toBeUndefined();
    expect(asNumberArray([1, Number.NaN, 2, '3', 4])).toEqual([1, 2, 4]);
    expect(asNumberArray({})).toBeUndefined();
  });
});
