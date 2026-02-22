import { describe, it, expect } from 'vitest';
import { useRenderLogger } from '../useRenderLogger';

describe('useRenderLogger', () => {
  it('exports expected members', () => {
    expect(useRenderLogger).toBeDefined();
  });

  it('useRenderLogger is a callable function', () => {
    expect(typeof useRenderLogger).toBe('function');
    expect(useRenderLogger.name).toBeDefined();
  });
});
