import { describe, it, expect } from 'vitest';
import { getVariantConfig } from '../taskDetailsTypes';

describe('taskDetailsTypes', () => {
  it('exports expected members', () => {
    expect(getVariantConfig).toBeDefined();
  });
});
