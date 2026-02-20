import { describe, expect, it } from 'vitest';
import { exampleStyles } from './constants';

describe('home constants', () => {
  it('exports example styles', () => {
    expect(exampleStyles).toBeDefined();
    expect(Object.keys(exampleStyles).length).toBeGreaterThan(0);
  });
});
