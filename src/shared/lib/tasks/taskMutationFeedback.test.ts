import { describe, expect, it, vi } from 'vitest';
import {
  flashSuccessForDuration,
  invalidateTaskAndProjectQueries,
} from './taskMutationFeedback';

describe('taskMutationFeedback', () => {
  it('toggles success state for the requested duration', () => {
    vi.useFakeTimers();
    const setSuccess = vi.fn();

    flashSuccessForDuration(setSuccess, 1000);
    expect(setSuccess).toHaveBeenCalledWith(true);

    vi.advanceTimersByTime(1000);
    expect(setSuccess).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it('invalidates task and project query keys', () => {
    const invalidateQueries = vi.fn();
    invalidateTaskAndProjectQueries(
      { invalidateQueries } as never,
      'project-123',
    );

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
