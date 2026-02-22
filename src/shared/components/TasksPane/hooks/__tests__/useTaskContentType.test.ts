import { describe, it, expect } from 'vitest';
import { useTaskContentType } from '../useTaskContentType';

describe('useTaskContentType', () => {
  it('exports expected members', () => {
    expect(useTaskContentType).toBeDefined();
  });

  it('useTaskContentType is a callable function', () => {
    expect(typeof useTaskContentType).toBe('function');
    expect(useTaskContentType.name).toBeDefined();
  });
});
