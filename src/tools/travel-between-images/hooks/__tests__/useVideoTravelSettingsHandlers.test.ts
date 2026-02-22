import { describe, it, expect } from 'vitest';
import { useVideoTravelSettingsHandlers } from '../useVideoTravelSettingsHandlers';

describe('useVideoTravelSettingsHandlers', () => {
  it('exports expected members', () => {
    expect(useVideoTravelSettingsHandlers).toBeDefined();
  });

  it('useVideoTravelSettingsHandlers is a callable function', () => {
    expect(typeof useVideoTravelSettingsHandlers).toBe('function');
    expect(useVideoTravelSettingsHandlers.name).toBeDefined();
  });
});
