import { describe, expect, it } from 'vitest';
import * as VariantSelectorIndex from './index';

describe('VariantSelector index direct coverage', () => {
  it('exports index module directly', () => {
    expect(VariantSelectorIndex).toBeDefined();
  });
});
