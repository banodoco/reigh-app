import { describe, expect, it } from 'vitest';
import { toShortPrompt } from './utils';

describe('promptManagement utils', () => {
  it('creates truncated short prompt strings', () => {
    expect(toShortPrompt('short prompt')).toBe('short prompt');
    expect(toShortPrompt('abcdefghijklmnopqrstuvwxyz123456')).toBe('abcdefghijklmnopqrstuvwxyz1234...');
  });
});
