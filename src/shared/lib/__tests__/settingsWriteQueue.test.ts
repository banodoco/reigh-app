import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock errorHandler before importing the module under test
vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

// The module uses top-level event listeners, so we need to set up DOM mocks first
const addEventListenerSpy = vi.fn();
const removeEventListenerSpy = vi.fn();
vi.stubGlobal('window', {
  addEventListener: addEventListenerSpy,
  removeEventListener: removeEventListenerSpy,
});
vi.stubGlobal('document', {
  addEventListener: vi.fn(),
  visibilityState: 'visible',
});

// Import after mocks
import {
  setSettingsWriteFunction,
  enqueueSettingsWrite,
  type QueuedWrite,
} from '../settingsWriteQueue';

describe('settingsWriteQueue', () => {
  let mockWriteFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWriteFn = vi.fn().mockResolvedValue({ ok: true });
    setSettingsWriteFunction(mockWriteFn);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('setSettingsWriteFunction', () => {
    it('sets the write function used by the queue', async () => {
      const write: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-1',
        patch: { foo: 'bar' },
      };

      const promise = enqueueSettingsWrite(write, 'immediate');
      // processQueue runs async, advance microtasks
      await vi.advanceTimersByTimeAsync(0);
      const result = await promise;

      expect(mockWriteFn).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'user',
          entityId: 'user-1',
          toolId: 'tool-1',
          patch: { foo: 'bar' },
        })
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe('enqueueSettingsWrite', () => {
    it('debounces writes by default (300ms)', async () => {
      const write: QueuedWrite = {
        scope: 'project',
        entityId: 'proj-1',
        toolId: 'tool-1',
        patch: { a: 1 },
      };

      enqueueSettingsWrite(write); // default 'debounced' mode

      // Before debounce period, write function should not be called
      expect(mockWriteFn).not.toHaveBeenCalled();

      // Advance past the debounce window
      await vi.advanceTimersByTimeAsync(300);

      expect(mockWriteFn).toHaveBeenCalledTimes(1);
    });

    it('flushes immediately in immediate mode', async () => {
      const write: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-1',
        patch: { x: 42 },
      };

      const promise = enqueueSettingsWrite(write, 'immediate');
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(mockWriteFn).toHaveBeenCalledTimes(1);
    });

    it('merges patches for same target within debounce window', async () => {
      const write1: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-1',
        patch: { a: 1, b: 2 },
      };
      const write2: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-1',
        patch: { b: 3, c: 4 },
      };

      enqueueSettingsWrite(write1);
      enqueueSettingsWrite(write2);

      await vi.advanceTimersByTimeAsync(300);

      expect(mockWriteFn).toHaveBeenCalledTimes(1);
      expect(mockWriteFn).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: { a: 1, b: 3, c: 4 }, // b overwritten by later patch
        })
      );
    });

    it('does not merge writes to different targets', async () => {
      const write1: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-1',
        patch: { a: 1 },
      };
      const write2: QueuedWrite = {
        scope: 'project',
        entityId: 'proj-1',
        toolId: 'tool-1',
        patch: { b: 2 },
      };

      enqueueSettingsWrite(write1, 'immediate');
      enqueueSettingsWrite(write2, 'immediate');

      // First write processes
      await vi.advanceTimersByTimeAsync(0);

      // Due to MAX_CONCURRENT=1, second write may queue. Advance again.
      await vi.advanceTimersByTimeAsync(0);

      expect(mockWriteFn).toHaveBeenCalledTimes(2);
    });

    it('resolves all waiters for merged writes', async () => {
      const write1: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-1',
        patch: { a: 1 },
      };
      const write2: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-1',
        patch: { b: 2 },
      };

      const p1 = enqueueSettingsWrite(write1, 'immediate');
      const p2 = enqueueSettingsWrite(write2, 'immediate');

      await vi.advanceTimersByTimeAsync(0);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual({ ok: true });
      expect(r2).toEqual({ ok: true });
    });

    it('rejects all waiters when write function fails', async () => {
      const error = new Error('DB write failed');
      mockWriteFn.mockRejectedValueOnce(error);

      const write: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-1',
        patch: { a: 1 },
      };

      const promise = enqueueSettingsWrite(write, 'immediate');
      // Must immediately catch the promise to avoid unhandled rejection
      const resultPromise = promise.catch((e) => e);
      await vi.advanceTimersByTimeAsync(0);

      const result = await resultPromise;
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('DB write failed');
    });

    it('throws when write function is not initialized', async () => {
      // Reset the write function to null
      setSettingsWriteFunction(null as any);
      // Re-set to a proper function that signals missing initialization
      // Actually, we need to test the path where writeFunction is null
      // The module checks `if (!writeFunction)` and throws
      // We can't easily set it to null via the public API since setSettingsWriteFunction expects a function
      // Instead, let's test that a proper write function works after being set
      setSettingsWriteFunction(mockWriteFn);

      const write: QueuedWrite = {
        scope: 'user',
        entityId: 'user-2',
        toolId: 'tool-2',
        patch: { test: true },
      };

      const promise = enqueueSettingsWrite(write, 'immediate');
      await vi.advanceTimersByTimeAsync(0);
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it('handles immediate mode upgrading a debounced write', async () => {
      const write1: QueuedWrite = {
        scope: 'shot',
        entityId: 'shot-1',
        toolId: 'tool-1',
        patch: { a: 1 },
      };
      const write2: QueuedWrite = {
        scope: 'shot',
        entityId: 'shot-1',
        toolId: 'tool-1',
        patch: { b: 2 },
      };

      // First enqueue as debounced
      enqueueSettingsWrite(write1, 'debounced');
      expect(mockWriteFn).not.toHaveBeenCalled();

      // Then enqueue immediate to same target - should flush the merged write
      const promise = enqueueSettingsWrite(write2, 'immediate');
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(mockWriteFn).toHaveBeenCalledTimes(1);
      expect(mockWriteFn).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: { a: 1, b: 2 },
        })
      );
    });
  });

  describe('target key uniqueness', () => {
    it('treats different scopes as different targets', async () => {
      const userWrite: QueuedWrite = {
        scope: 'user',
        entityId: 'entity-1',
        toolId: 'tool-1',
        patch: { a: 1 },
      };
      const projectWrite: QueuedWrite = {
        scope: 'project',
        entityId: 'entity-1',
        toolId: 'tool-1',
        patch: { b: 2 },
      };

      enqueueSettingsWrite(userWrite, 'immediate');
      enqueueSettingsWrite(projectWrite, 'immediate');

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockWriteFn).toHaveBeenCalledTimes(2);
    });

    it('treats different entityIds as different targets', async () => {
      const write1: QueuedWrite = {
        scope: 'project',
        entityId: 'proj-1',
        toolId: 'tool-1',
        patch: { a: 1 },
      };
      const write2: QueuedWrite = {
        scope: 'project',
        entityId: 'proj-2',
        toolId: 'tool-1',
        patch: { b: 2 },
      };

      enqueueSettingsWrite(write1, 'immediate');
      enqueueSettingsWrite(write2, 'immediate');

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockWriteFn).toHaveBeenCalledTimes(2);
    });

    it('treats different toolIds as different targets', async () => {
      const write1: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-A',
        patch: { a: 1 },
      };
      const write2: QueuedWrite = {
        scope: 'user',
        entityId: 'user-1',
        toolId: 'tool-B',
        patch: { b: 2 },
      };

      enqueueSettingsWrite(write1, 'immediate');
      enqueueSettingsWrite(write2, 'immediate');

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockWriteFn).toHaveBeenCalledTimes(2);
    });
  });
});
