import { describe, it, expect } from 'vitest';
import { useLoraSync } from '../../editor-state/useLoraSync';

describe('useLoraSync', () => {
  it('exports expected members', () => {
    expect(useLoraSync).toBeDefined();
  });

  it('useLoraSync is a callable function', () => {
    expect(typeof useLoraSync).toBe('function');
    expect(useLoraSync.name).toBeDefined();
  });
});
