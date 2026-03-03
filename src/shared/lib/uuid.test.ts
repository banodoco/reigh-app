import { describe, expect, it } from 'vitest';
import { filterUuidStrings, isUuid } from './uuid';

describe('uuid helpers', () => {
  it('validates UUID v1-v5 strings', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('550e8400-e29b-61d4-a716-446655440000')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it('filters, validates, and de-duplicates UUID values', () => {
    const values = [
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440000',
      'aa0e8400-e29b-41d4-a716-446655440001',
      'invalid',
    ];

    expect(filterUuidStrings(values)).toEqual([
      '550e8400-e29b-41d4-a716-446655440000',
      'aa0e8400-e29b-41d4-a716-446655440001',
    ]);
  });
});
