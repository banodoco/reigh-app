import { describe, it, expect } from 'vitest';
import * as typesModule from '../types';

describe('types', () => {
  it('exports expected members', () => {
    expect(typesModule).toBeDefined();
    expect(typeof typesModule).toBe('object');
  });
});
