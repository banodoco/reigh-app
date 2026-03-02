import { describe, it, expect } from 'vitest';
import { useGenerationActions } from '../../actions/useGenerationActions';

describe('useGenerationActions', () => {
  it('exports expected members', () => {
    expect(useGenerationActions).toBeDefined();
  });

  it('useGenerationActions is a callable function', () => {
    expect(typeof useGenerationActions).toBe('function');
    expect(useGenerationActions.name).toBeDefined();
  });
});
