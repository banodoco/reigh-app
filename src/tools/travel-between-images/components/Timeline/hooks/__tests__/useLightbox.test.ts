import { describe, it, expect } from 'vitest';
import { useLightbox } from '../useLightbox';

describe('useLightbox', () => {
  it('exports a hook function', () => {
    expect(useLightbox).toBeDefined();
    expect(typeof useLightbox).toBe('function');
    expect(useLightbox.name).toBe('useLightbox');
  });
});
