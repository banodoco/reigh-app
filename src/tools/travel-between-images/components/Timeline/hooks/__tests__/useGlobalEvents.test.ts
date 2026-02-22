import { describe, it, expect } from 'vitest';
import { useGlobalEvents } from '../useGlobalEvents';

describe('useGlobalEvents', () => {
  it('exports expected members', () => {
    expect(useGlobalEvents).toBeDefined();
  });

  it('useGlobalEvents is a callable function', () => {
    expect(typeof useGlobalEvents).toBe('function');
    expect(useGlobalEvents.name).toBeDefined();
  });
});
