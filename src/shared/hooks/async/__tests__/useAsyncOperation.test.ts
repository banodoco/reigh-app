import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useAsyncOperation,
  useAsyncOperationMap,
} from '@/shared/hooks/async/useAsyncOperation';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

describe('useAsyncOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with isLoading false and no error', () => {
    const { result } = renderHook(() => useAsyncOperation());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading during operation execution', async () => {
    const { result } = renderHook(() => useAsyncOperation<string>());

    let resolveOp: (value: string) => void;
    const promise = new Promise<string>(resolve => { resolveOp = resolve; });

    let execPromise: Promise<string | undefined>;
    act(() => {
      execPromise = result.current.execute(() => promise);
    });

    // After act flushes state updates, isLoading should be true
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveOp!('done');
      await execPromise!;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('returns the result of the operation', async () => {
    const { result } = renderHook(() => useAsyncOperation<string>());

    let returnValue: string | undefined;
    await act(async () => {
      returnValue = await result.current.execute(async () => 'hello');
    });

    expect(returnValue).toBe('hello');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('captures error on operation failure', async () => {
    const { result } = renderHook(() => useAsyncOperation<string>());

    await act(async () => {
      await result.current.execute(async () => {
        throw new Error('test error');
      });
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('test error');
  });

  it('returns undefined on failure', async () => {
    const { result } = renderHook(() => useAsyncOperation<string>());

    let returnValue: string | undefined;
    await act(async () => {
      returnValue = await result.current.execute(async () => {
        throw new Error('fail');
      });
    });

    expect(returnValue).toBeUndefined();
  });

  it('clears error via clearError', async () => {
    const { result } = renderHook(() => useAsyncOperation<string>());

    await act(async () => {
      await result.current.execute(async () => {
        throw new Error('err');
      });
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it('clears previous error when starting new operation', async () => {
    const { result } = renderHook(() => useAsyncOperation<string>());

    await act(async () => {
      await result.current.execute(async () => {
        throw new Error('first error');
      });
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.execute(async () => 'success');
    });
    expect(result.current.error).toBeNull();
  });

  it('converts non-Error throws to Error objects', async () => {
    const { result } = renderHook(() => useAsyncOperation<string>());

    await act(async () => {
      await result.current.execute(async () => {
        throw 'string error';
      });
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('string error');
  });

  it('passes options to normalizeAndPresentError', async () => {
    const { normalizeAndPresentError } = await import('@/shared/lib/errorHandling/runtimeError');
    const { result } = renderHook(() => useAsyncOperation());

    await act(async () => {
      await result.current.execute(
        async () => { throw new Error('fail'); },
        { context: 'TestContext', toastTitle: 'Test Failed', showToast: false }
      );
    });

    expect(normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      { context: 'TestContext', showToast: false, toastTitle: 'Test Failed' }
    );
  });
});

describe('useAsyncOperationMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with no loading keys', () => {
    const { result } = renderHook(() => useAsyncOperationMap());
    expect(result.current.isLoading('key1')).toBe(false);
  });

  it('tracks loading state per key', async () => {
    const { result } = renderHook(() => useAsyncOperationMap<string>());

    let resolveOp: (value: string) => void;
    const promise = new Promise<string>(resolve => { resolveOp = resolve; });

    let execPromise: Promise<string | undefined>;
    act(() => {
      execPromise = result.current.execute('key1', () => promise);
    });

    // After act flushes the state update, isLoading reads from the updated ref
    expect(result.current.isLoading('key1')).toBe(true);
    expect(result.current.isLoading('key2')).toBe(false);

    await act(async () => {
      resolveOp!('done');
      await execPromise!;
    });

    expect(result.current.isLoading('key1')).toBe(false);
  });

  it('tracks errors per key', async () => {
    const { result } = renderHook(() => useAsyncOperationMap<string>());

    await act(async () => {
      await result.current.execute('key1', async () => {
        throw new Error('key1 error');
      });
    });

    expect(result.current.getError('key1')).toBeInstanceOf(Error);
    expect(result.current.getError('key1')!.message).toBe('key1 error');
    expect(result.current.getError('key2')).toBeNull();
  });

  it('clears error for a specific key', async () => {
    const { result } = renderHook(() => useAsyncOperationMap<string>());

    await act(async () => {
      await result.current.execute('key1', async () => {
        throw new Error('err');
      });
    });
    expect(result.current.getError('key1')).not.toBeNull();

    act(() => {
      result.current.clearError('key1');
    });
    expect(result.current.getError('key1')).toBeNull();
  });

  it('handles concurrent operations on different keys', async () => {
    const { result } = renderHook(() => useAsyncOperationMap<string>());

    let resolveA: (v: string) => void;
    let resolveB: (v: string) => void;
    const promiseA = new Promise<string>(r => { resolveA = r; });
    const promiseB = new Promise<string>(r => { resolveB = r; });

    let execA: Promise<string | undefined>;
    let execB: Promise<string | undefined>;
    act(() => {
      execA = result.current.execute('a', () => promiseA);
      execB = result.current.execute('b', () => promiseB);
    });

    // After act, both should be loading
    expect(result.current.isLoading('a')).toBe(true);
    expect(result.current.isLoading('b')).toBe(true);

    // Resolve A
    await act(async () => {
      resolveA!('doneA');
      await execA!;
    });
    expect(result.current.isLoading('a')).toBe(false);

    // B still pending
    expect(result.current.isLoading('b')).toBe(true);

    // Resolve B
    await act(async () => {
      resolveB!('doneB');
      await execB!;
    });
    expect(result.current.isLoading('b')).toBe(false);
  });
});
