import { describe, it, expect } from 'vitest';
import { useVideoTravelData } from '../../workflow/useVideoTravelData';

describe('useVideoTravelData', () => {
  it('exports expected members', () => {
    expect(useVideoTravelData).toBeDefined();
  });

  it('useVideoTravelData is a callable function', () => {
    expect(typeof useVideoTravelData).toBe('function');
    expect(useVideoTravelData.name).toBeDefined();
  });
});
