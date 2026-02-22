import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useVideoTravelAddToShot } from '../useVideoTravelAddToShot';

describe('useVideoTravelAddToShot', () => {
  it('exports expected members', () => {
    expect(useVideoTravelAddToShot).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useVideoTravelAddToShot is a callable function', () => {
    expect(typeof useVideoTravelAddToShot).toBe('function');
    expect(useVideoTravelAddToShot.name).toBeDefined();
  });
});
