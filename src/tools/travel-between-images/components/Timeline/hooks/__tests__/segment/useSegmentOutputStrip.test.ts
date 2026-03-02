import { describe, it, expect } from 'vitest';
import { useSegmentOutputStrip } from '../../segment/useSegmentOutputStrip';

describe('useSegmentOutputStrip', () => {
  it('exports expected members', () => {
    expect(useSegmentOutputStrip).toBeDefined();
  });

  it('useSegmentOutputStrip is a callable function', () => {
    expect(typeof useSegmentOutputStrip).toBe('function');
    expect(useSegmentOutputStrip.name).toBeDefined();
  });
});
