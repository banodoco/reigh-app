import { describe, it, expect } from 'vitest';
import { SortableShotItem } from '../VideoGallery/SortableShotItem';

describe('SortableShotItem', () => {
  it('exports expected members', () => {
    expect(SortableShotItem).toBeDefined();
    expect(typeof SortableShotItem).toBe('function');
  });
});
