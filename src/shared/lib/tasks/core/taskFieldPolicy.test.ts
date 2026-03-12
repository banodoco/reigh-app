import { describe, expect, it } from 'vitest';
import { composeOptionalFields, isNonEmptyString } from './taskFieldPolicy';

describe('taskFieldPolicy helpers', () => {
  it('composes optional payload fields with include predicates', () => {
    const payload = composeOptionalFields([
      { key: 'a', value: 1 },
      { key: 'b', value: undefined },
      { key: 'c', value: '', include: (value) => typeof value === 'string' && value.length > 0 },
      { key: 'd', value: 'ok', include: isNonEmptyString },
    ]);

    expect(payload).toEqual({
      a: 1,
      d: 'ok',
    });
  });

  it('validates non-empty strings', () => {
    expect(isNonEmptyString(' test ')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });
});
