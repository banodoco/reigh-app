import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePaneLockPolicyState } from './usePaneLockPolicyState';

const useUserUIStateSpy = vi.fn();
const useIsMobileSpy = vi.fn();
const useIsTabletSpy = vi.fn();

vi.mock('@/shared/hooks/useUserUIState', () => ({
  useUserUIState: (...args: unknown[]) => useUserUIStateSpy(...args),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => useIsMobileSpy(),
  useIsTablet: () => useIsTabletSpy(),
}));

describe('usePaneLockPolicyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates persisted locks and updates lock state on desktop', () => {
    const savePaneLocks = vi.fn();
    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(false);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: false, tasks: true, gens: false },
      update: savePaneLocks,
      isLoading: false,
    });

    const { result } = renderHook(() => usePaneLockPolicyState());

    expect(result.current.locks).toEqual({ shots: false, tasks: true, gens: false });
    expect(result.current.isTasksPaneOpenState).toBe(true);

    act(() => {
      result.current.setIsShotsPaneLocked(true);
    });
    expect(result.current.locks.shots).toBe(true);
    expect(savePaneLocks).toHaveBeenCalledWith({ shots: true });

    act(() => {
      result.current.resetAllPaneLocks();
    });
    expect(result.current.locks).toEqual({ shots: false, tasks: false, gens: false });
    expect(savePaneLocks).toHaveBeenCalledWith({ shots: false, tasks: false, gens: false });
  });

  it('enforces exclusive locks on tablet/mobile and keeps small mobile unlocked', () => {
    const savePaneLocks = vi.fn();

    useIsMobileSpy.mockReturnValue(true);
    useIsTabletSpy.mockReturnValue(false);
    useUserUIStateSpy.mockReturnValue({
      value: { shots: true, tasks: true, gens: false },
      update: savePaneLocks,
      isLoading: false,
    });

    const { result, rerender } = renderHook(() => usePaneLockPolicyState());
    expect(result.current.locks).toEqual({ shots: false, tasks: false, gens: false });

    useIsMobileSpy.mockReturnValue(false);
    useIsTabletSpy.mockReturnValue(true);
    rerender();

    act(() => {
      result.current.setIsTasksPaneLocked(true);
    });

    expect(result.current.locks).toEqual({ shots: false, tasks: true, gens: false });
    expect(savePaneLocks).toHaveBeenCalledWith({ shots: false, tasks: true, gens: false });
  });
});
