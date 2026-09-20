import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingSteps } from './useOnboardingSteps';

const STEP_COUNT = 4;
const EXPECTED_TITLES = ['Welcome', 'Community', 'Theme', 'Complete'];

afterEach(() => {
  vi.useRealTimers();
});

describe('useOnboardingSteps', () => {
  it('starts at step 1 with titles and first step definition', () => {
    const { result } = renderHook(() => useOnboardingSteps(true));

    expect(result.current.currentStep).toBe(1);
    expect(result.current.currentStepDefinition.id).toBe(1);
    expect(result.current.stepTitles).toEqual(EXPECTED_TITLES);
  });

  it('moves forward and backward within valid bounds', () => {
    const { result } = renderHook(() => useOnboardingSteps(true));

    act(() => {
      result.current.handleBack();
    });
    expect(result.current.currentStep).toBe(1);

    for (let i = 0; i < STEP_COUNT + 2; i += 1) {
      act(() => {
        result.current.handleNext();
      });
    }
    expect(result.current.currentStep).toBe(STEP_COUNT);

    act(() => {
      result.current.handleBack();
    });
    expect(result.current.currentStep).toBe(STEP_COUNT - 1);
  });

  it('resets to step 1 when modal opens', () => {
    const { result, rerender } = renderHook(({ isOpen }) => useOnboardingSteps(isOpen), {
      initialProps: { isOpen: false },
    });

    act(() => {
      result.current.handleNext();
    });
    expect(result.current.currentStep).toBe(2);

    rerender({ isOpen: true });
    expect(result.current.currentStep).toBe(1);
  });

  it('toggles shake state and clears it after timeout', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOnboardingSteps(true));

    act(() => {
      result.current.handleShake();
    });
    expect(result.current.isShaking).toBe(true);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.isShaking).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isShaking).toBe(false);
  });
});
