// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  resetRenderBudgetTelemetryForTests,
  subscribeRenderBudgetTelemetry,
  useRenderBudget,
} from './useRenderBudget.ts';

const renderTelemetryGlobal = globalThis as typeof globalThis & {
  __REIGH_FORCE_RENDER_TELEMETRY__?: boolean;
};
let previousForcedValue: boolean | undefined;

describe('useRenderBudget telemetry notifications', () => {
  beforeEach(() => {
    previousForcedValue = renderTelemetryGlobal.__REIGH_FORCE_RENDER_TELEMETRY__;
    renderTelemetryGlobal.__REIGH_FORCE_RENDER_TELEMETRY__ = true;
    resetRenderBudgetTelemetryForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    renderTelemetryGlobal.__REIGH_FORCE_RENDER_TELEMETRY__ = previousForcedValue;
    resetRenderBudgetTelemetryForTests();
    vi.restoreAllMocks();
  });

  it('keeps ordinary component renders from notifying overlay subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRenderBudgetTelemetry(listener);
    const hook = renderHook(() => useRenderBudget('TestComponent', 10));

    hook.rerender();
    hook.rerender();

    expect(listener).not.toHaveBeenCalled();
    hook.unmount();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
