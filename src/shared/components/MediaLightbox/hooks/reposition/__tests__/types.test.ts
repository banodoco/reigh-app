import { describe, it, expect } from 'vitest';
import { DEFAULT_TRANSFORM } from '../types';

describe('types', () => {
  it('exports expected members', () => {
    expect(DEFAULT_TRANSFORM).toBeDefined();
  });
});
