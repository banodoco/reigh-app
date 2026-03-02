import { describe, it, expect } from 'vitest';
import { useJoinSegmentsSetup } from '../../actions/useJoinSegmentsSetup';

describe('useJoinSegmentsSetup', () => {
  it('exports expected members', () => {
    expect(useJoinSegmentsSetup).toBeDefined();
  });

  it('useJoinSegmentsSetup is a callable function', () => {
    expect(typeof useJoinSegmentsSetup).toBe('function');
    expect(useJoinSegmentsSetup.name).toBeDefined();
  });
});
