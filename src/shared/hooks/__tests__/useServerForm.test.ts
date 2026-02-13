import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useServerForm } from '../useServerForm';

describe('useServerForm', () => {
  const mockSave = vi.fn();
  const mockToLocal = vi.fn((server: { name: string }) => ({ name: server.name }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns transformed server data when no local edits', () => {
    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Server Name' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
      })
    );

    expect(result.current.data).toEqual({ name: 'Server Name' });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasLocalEdits).toBe(false);
    expect(result.current.localData).toBeNull();
  });

  it('returns empty object when server data is undefined', () => {
    const { result } = renderHook(() =>
      useServerForm({
        serverData: undefined,
        isLoading: true,
        toLocal: mockToLocal,
        save: mockSave,
      })
    );

    expect(result.current.data).toEqual({});
    expect(result.current.isLoading).toBe(true);
  });

  it('update sets local edits and marks dirty', () => {
    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Original' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
      })
    );

    act(() => {
      result.current.update({ name: 'Edited' });
    });

    expect(result.current.data).toEqual({ name: 'Edited' });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.hasLocalEdits).toBe(true);
  });

  it('reset clears local edits and reverts to server data', () => {
    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Original' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
      })
    );

    act(() => {
      result.current.update({ name: 'Edited' });
    });

    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toEqual({ name: 'Original' });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasLocalEdits).toBe(false);
  });

  it('save calls save function with local data', async () => {
    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Original' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
      })
    );

    act(() => {
      result.current.update({ name: 'Edited' });
    });

    let saveResult: boolean;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult!).toBe(true);
    expect(mockSave).toHaveBeenCalledWith({ name: 'Edited' });
    expect(result.current.isDirty).toBe(false);
  });

  it('save returns true and does nothing when no local data', async () => {
    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Original' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
      })
    );

    let saveResult: boolean;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult!).toBe(true);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('saveData calls save with provided data directly', async () => {
    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Original' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
      })
    );

    await act(async () => {
      await result.current.saveData({ name: 'Direct Data' });
    });

    expect(mockSave).toHaveBeenCalledWith({ name: 'Direct Data' });
  });

  it('context key change resets local state', () => {
    const { result, rerender } = renderHook(
      ({ contextKey }) =>
        useServerForm({
          serverData: { name: 'Original' },
          isLoading: false,
          toLocal: mockToLocal,
          save: mockSave,
          contextKey,
        }),
      { initialProps: { contextKey: 'item-1' } }
    );

    act(() => {
      result.current.update({ name: 'Edited' });
    });

    expect(result.current.isDirty).toBe(true);

    rerender({ contextKey: 'item-2' });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasLocalEdits).toBe(false);
  });

  it('validate transforms updates before applying', () => {
    const validate = vi.fn((updates: Partial<{ name: string }>) => ({
      name: updates.name?.toUpperCase(),
    }));

    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Original' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
        validate,
      })
    );

    act(() => {
      result.current.update({ name: 'hello' });
    });

    expect(result.current.data.name).toBe('HELLO');
  });

  it('onDirtyChange is called when dirty state changes', () => {
    const onDirtyChange = vi.fn();

    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Original' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
        onDirtyChange,
      })
    );

    act(() => {
      result.current.update({ name: 'Edited' });
    });

    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it('auto-save triggers after debounce', async () => {
    const { result } = renderHook(() =>
      useServerForm({
        serverData: { name: 'Original' },
        isLoading: false,
        toLocal: mockToLocal,
        save: mockSave,
        autoSaveMs: 200,
      })
    );

    act(() => {
      result.current.update({ name: 'Edited' });
    });

    expect(mockSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(mockSave).toHaveBeenCalledWith({ name: 'Edited' });
  });
});
