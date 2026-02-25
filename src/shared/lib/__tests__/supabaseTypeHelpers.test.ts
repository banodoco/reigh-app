import { describe, expect, it } from 'vitest';
import { isJsonValue, toJson } from '../supabaseTypeHelpers';

describe('toJson', () => {
  it('returns the same object reference', () => {
    const payload = { nested: { value: 1 }, list: ['a', 'b'] };
    const result = toJson(payload);

    expect(result).toBe(payload);
  });

  it('supports primitive values', () => {
    expect(toJson('text')).toBe('text');
    expect(toJson(42)).toBe(42);
    expect(toJson(true)).toBe(true);
    expect(toJson(null)).toBe(null);
  });

  it('supports arrays', () => {
    const payload = [{ id: 1 }, { id: 2 }];
    const result = toJson(payload);

    expect(result).toEqual(payload);
  });

  it('sanitizes non-json runtime values', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const payload = { when: now, keep: 'yes', skip: undefined };
    const result = toJson(payload) as Record<string, unknown>;

    expect(result).toEqual({
      when: now.toISOString(),
      keep: 'yes',
    });
    expect(isJsonValue(result)).toBe(true);
  });

  it('returns null for circular objects', () => {
    const payload: Record<string, unknown> = {};
    payload.self = payload;
    expect(toJson(payload)).toBeNull();
  });
});
