import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUpdate = vi.fn();
vi.mock('@/shared/hooks/useUserUIState', () => ({
  useUserUIState: vi.fn((_key: string, fallback: unknown) => ({
    value: fallback,
    update: mockUpdate,
    isLoading: false,
  })),
}));

import { useProductTour } from '../useProductTour';

describe('useProductTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with isRunning false', () => {
    const { result } = renderHook(() => useProductTour());
    expect(result.current.isRunning).toBe(false);
  });

  it('startTour sets isRunning to true when not completed or skipped', () => {
    const { result } = renderHook(() => useProductTour());
    act(() => {
      result.current.startTour();
    });
    expect(result.current.isRunning).toBe(true);
  });

  it('completeTour stops running and saves completed state', () => {
    const { result } = renderHook(() => useProductTour());
    act(() => {
      result.current.startTour();
    });
    act(() => {
      result.current.completeTour();
    });
    expect(result.current.isRunning).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith({ completed: true, skipped: false });
  });

  it('skipTour stops running and saves skipped state', () => {
    const { result } = renderHook(() => useProductTour());
    act(() => {
      result.current.startTour();
    });
    act(() => {
      result.current.skipTour();
    });
    expect(result.current.isRunning).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith({ completed: false, skipped: true });
  });

  it('restartTour resets state and starts running', () => {
    const { result } = renderHook(() => useProductTour());
    act(() => {
      result.current.restartTour();
    });
    expect(result.current.isRunning).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ completed: false, skipped: false });
  });
});
