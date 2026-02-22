import { describe, it, expect } from 'vitest';
import { useTimelineSelection } from '../useTimelineSelection';

describe('useTimelineSelection', () => {
  it('exports expected members', () => {
    expect(useTimelineSelection).toBeDefined();
  });

  it('useTimelineSelection is a callable function', () => {
    expect(typeof useTimelineSelection).toBe('function');
    expect(useTimelineSelection.name).toBeDefined();
  });
});
