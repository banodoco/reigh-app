import { describe, expect, it } from 'vitest';
import * as ProductTourIndex from './index';

describe('ProductTour index direct coverage', () => {
  it('exports index module directly', () => {
    expect(ProductTourIndex).toBeDefined();
  });
});
