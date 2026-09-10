import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: toastError },
}));

import { useGenerateBatch } from './useGenerateBatch';

describe('useGenerateBatch legacy boundary', () => {
  it('rejects a valid travel request without creating placeholder state', () => {
    const { result } = renderHook(() => useGenerateBatch({
      core: {
        projectId: 'project-1',
        selectedShotId: 'shot-1',
        selectedShot: { id: 'shot-1' } as never,
      } as never,
      request: {} as never,
      clearAllEnhancedPrompts: vi.fn(),
    }));

    act(() => {
      result.current.handleGenerateBatch('Variant A');
    });

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Legacy task family travel_between_images is unsupported'));
    expect(result.current.isSteerableMotionEnqueuing).toBe(false);
    expect(result.current.steerableMotionJustQueued).toBe(false);
    expect(result.current.enhancementProgress).toBeNull();
  });
});
