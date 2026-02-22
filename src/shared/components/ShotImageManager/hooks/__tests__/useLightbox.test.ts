import { describe, it, expect } from 'vitest';
import { useLightbox } from '../useLightbox';

describe('useLightbox', () => {
  it('exports expected members', () => {
    expect(useLightbox).toBeDefined();
  });

  it('useLightbox is a callable function', () => {
    expect(typeof useLightbox).toBe('function');
    expect(useLightbox.name).toBeDefined();
  });
});
