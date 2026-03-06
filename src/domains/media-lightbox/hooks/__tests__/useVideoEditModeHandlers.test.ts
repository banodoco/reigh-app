import { describe, it, expect } from 'vitest';
import { useVideoEditModeHandlers } from '../useVideoEditModeHandlers';

describe('useVideoEditModeHandlers', () => {
  it('exports expected members', () => {
    expect(useVideoEditModeHandlers).toBeDefined();
  });

  it('useVideoEditModeHandlers is a callable function', () => {
    expect(typeof useVideoEditModeHandlers).toBe('function');
    expect(useVideoEditModeHandlers.name).toBeDefined();
  });
});
