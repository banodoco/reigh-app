import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTooltipInteractionPolicy } from './useTooltipInteractionPolicy';

describe('useTooltipInteractionPolicy', () => {
  it('toggles mobile tooltip state on tap', () => {
    const { result } = renderHook(() =>
      useTooltipInteractionPolicy({ isMobile: true }),
    );

    expect(result.current.open).toBe(false);
    expect(result.current.disabled).toBe(false);

    act(() => {
      result.current.handleTriggerClick();
    });
    expect(result.current.open).toBe(true);
    expect(result.current.disabled).toBe(true);

    act(() => {
      result.current.handleTriggerClick();
    });
    expect(result.current.open).toBe(false);
    expect(result.current.disabled).toBe(false);
  });

  it('enables hover policy on desktop pointer enter/leave', () => {
    const { result } = renderHook(() =>
      useTooltipInteractionPolicy({ isMobile: false }),
    );

    act(() => {
      result.current.handleTooltipPointerEnter();
    });
    expect(result.current.open).toBe(true);
    expect(result.current.disabled).toBe(true);

    act(() => {
      result.current.handleTooltipPointerLeave();
    });
    expect(result.current.open).toBe(false);
    expect(result.current.disabled).toBe(false);
  });
});
