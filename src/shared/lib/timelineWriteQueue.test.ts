import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isTimelineWriteTimeoutError,
  isTimelineWriteActive,
  runSerializedTimelineWrite,
  runTimelineWriteWithTimeout,
} from './timelineWriteQueue';

describe('timelineWriteQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('times out stalled writes and wraps the abort as a timeline timeout error', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();

    const stalledWrite = runTimelineWriteWithTimeout(
      'save-frames',
      (signal) =>
        new Promise<void>((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
      }),
      { timeoutMs: 10, onTimeout },
    );
    const assertion = expect(stalledWrite).rejects.toSatisfy((error: unknown) => {
      if (!isTimelineWriteTimeoutError(error)) {
        return false;
      }
      return error instanceof Error && error.message.includes('save-frames');
    });

    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('isTimelineWriteActive returns true while a write is active and false after it completes', async () => {
    let releaseWrite!: () => void;
    const gate = new Promise<void>((resolve) => { releaseWrite = resolve; });

    expect(isTimelineWriteActive('shot-a')).toBe(false);

    const writePromise = runSerializedTimelineWrite('shot-a', 'test-op', async () => {
      await gate;
    });

    await vi.waitFor(() => {
      expect(isTimelineWriteActive('shot-a')).toBe(true);
    });

    releaseWrite();
    await writePromise;

    expect(isTimelineWriteActive('shot-a')).toBe(false);
  });

  it('serializes writes per shot so later writes wait for the previous write', async () => {
    const order: string[] = [];
    const onEvent = vi.fn();

    let releaseFirstWrite!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });

    const first = runSerializedTimelineWrite('shot-1', 'first', async () => {
      order.push('first-start');
      await firstGate;
      order.push('first-end');
      return 'first-result';
    }, onEvent);

    const second = runSerializedTimelineWrite('shot-1', 'second', async () => {
      order.push('second-start');
      order.push('second-end');
      return 'second-result';
    }, onEvent);

    await vi.waitFor(() => {
      expect(order).toContain('first-start');
    });
    expect(order).toEqual(['first-start']);

    releaseFirstWrite();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe('first-result');
    expect(secondResult).toBe('second-result');
    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    expect(onEvent).toHaveBeenCalled();
  });
});
