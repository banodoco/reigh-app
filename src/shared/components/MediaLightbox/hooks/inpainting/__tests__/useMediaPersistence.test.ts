import { describe, it, expect } from 'vitest';
import { useMediaPersistence } from '../useMediaPersistence';

describe('useMediaPersistence', () => {
  it('exports expected members', () => {
    expect(useMediaPersistence).toBeDefined();
  });

  it('useMediaPersistence is a callable function', () => {
    expect(typeof useMediaPersistence).toBe('function');
    expect(useMediaPersistence.name).toBeDefined();
  });
});
