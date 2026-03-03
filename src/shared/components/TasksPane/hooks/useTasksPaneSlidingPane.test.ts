import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useTasksPaneSlidingPane } from './useTasksPaneSlidingPane';

const useSlidingPaneSpy = vi.fn();

vi.mock('@/shared/hooks/useSlidingPane', () => ({
  useSlidingPane: (config: unknown) => useSlidingPaneSpy(config),
}));

describe('useTasksPaneSlidingPane', () => {
  it('wires sliding pane config and lock/open callbacks', () => {
    const setIsTasksPaneLocked = vi.fn();
    const setIsTasksPaneOpenProgrammatic = vi.fn();
    useSlidingPaneSpy.mockReturnValue({ pane: 'state' });

    const { result } = renderHook(() =>
      useTasksPaneSlidingPane({
        isTasksPaneLocked: false,
        setIsTasksPaneLocked,
        isTasksPaneOpenProgrammatic: true,
        setIsTasksPaneOpenProgrammatic,
      }),
    );

    expect(result.current).toEqual({ pane: 'state' });
    const config = useSlidingPaneSpy.mock.calls[0]?.[0] as {
      side: string;
      onToggleLock: () => void;
      onOpenChange: (open: boolean) => void;
    };

    expect(config.side).toBe('right');

    config.onToggleLock();
    expect(setIsTasksPaneLocked).toHaveBeenCalledWith(true);
    expect(setIsTasksPaneOpenProgrammatic).toHaveBeenCalledWith(true);

    config.onOpenChange(false);
    expect(setIsTasksPaneOpenProgrammatic).toHaveBeenCalledWith(false);
  });
});
