import { describe, expect, it } from 'vitest';
import {
  asObjectRecord,
  asObjectOrEmpty,
  asString,
  parseNonNegativeIntCandidate,
} from './payloadNormalization.ts';

describe('_shared/payloadNormalization', () => {
  it('parses non-negative integers from number and string inputs', () => {
    expect(parseNonNegativeIntCandidate(7)).toEqual({ value: 7, invalid: false });
    expect(parseNonNegativeIntCandidate('12')).toEqual({ value: 12, invalid: false });
    expect(parseNonNegativeIntCandidate('001')).toEqual({ value: 1, invalid: false });
    expect(parseNonNegativeIntCandidate(null)).toEqual({ value: null, invalid: false });
    expect(parseNonNegativeIntCandidate(undefined)).toEqual({ value: null, invalid: false });
  });

  it('rejects decimal, negative, and invalid integer candidates', () => {
    expect(parseNonNegativeIntCandidate(1.5)).toEqual({ value: null, invalid: true });
    expect(parseNonNegativeIntCandidate('2.4')).toEqual({ value: null, invalid: true });
    expect(parseNonNegativeIntCandidate(-1)).toEqual({ value: null, invalid: true });
    expect(parseNonNegativeIntCandidate('')).toEqual({ value: null, invalid: true });
    expect(parseNonNegativeIntCandidate('abc')).toEqual({ value: null, invalid: true });
  });

  it('normalizes record and string helpers consistently', () => {
    expect(asObjectRecord({ ok: true })).toEqual({ ok: true });
    expect(asObjectRecord([])).toBeNull();
    expect(asObjectOrEmpty(undefined)).toEqual({});
    expect(asString('value')).toBe('value');
    expect(asString(123)).toBeNull();
  });
});
