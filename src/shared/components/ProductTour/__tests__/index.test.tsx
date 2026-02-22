import { describe, it, expect } from 'vitest';
import { ProductTour } from '../index';

describe('ProductTour', () => {
  it('exports a component function', () => {
    expect(ProductTour).toBeDefined();
    expect(typeof ProductTour).toBe('function');
    expect(ProductTour.name).toBe('ProductTour');
  });
});
