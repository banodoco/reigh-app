import { describe, it, expect } from 'vitest';
import { useJoinSegmentsSettings } from '../useJoinSegmentsSettings';

describe('useJoinSegmentsSettings', () => {
  it('exports expected members', () => {
    expect(useJoinSegmentsSettings).toBeDefined();
  });

  it('useJoinSegmentsSettings is a callable function', () => {
    expect(typeof useJoinSegmentsSettings).toBe('function');
    expect(useJoinSegmentsSettings.name).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(useJoinSegmentsSettings).not.toBeNull();
  });
});
