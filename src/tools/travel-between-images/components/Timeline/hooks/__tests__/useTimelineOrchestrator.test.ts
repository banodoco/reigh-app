import { describe, it, expect } from 'vitest';
import { useTimelineOrchestrator } from '../useTimelineOrchestrator';

describe('useTimelineOrchestrator', () => {
  it('exports expected members', () => {
    expect(useTimelineOrchestrator).toBeDefined();
  });

  it('useTimelineOrchestrator is a callable function', () => {
    expect(typeof useTimelineOrchestrator).toBe('function');
    expect(useTimelineOrchestrator.name).toBeDefined();
  });
});
