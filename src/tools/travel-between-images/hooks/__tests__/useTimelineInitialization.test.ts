import { describe, it, expect } from 'vitest';
import { useTimelineInitialization } from '../useTimelineInitialization';

describe('useTimelineInitialization', () => {
  it('exports expected members', () => {
    expect(useTimelineInitialization).toBeDefined();
  });

  it('useTimelineInitialization is a callable function', () => {
    expect(typeof useTimelineInitialization).toBe('function');
    expect(useTimelineInitialization.name).toBeDefined();
  });
});
