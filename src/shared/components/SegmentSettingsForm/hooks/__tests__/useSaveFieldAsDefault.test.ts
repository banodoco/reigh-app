/**
 * useSaveFieldAsDefault Tests
 *
 * Tests for the save-field-as-default hook used by SegmentSettingsForm.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSaveFieldAsDefault } from '../useSaveFieldAsDefault';

describe('useSaveFieldAsDefault', () => {
  const mockOnChange = vi.fn();
  const mockOnSaveFieldAsDefault = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with savingField as null', () => {
    const { result } = renderHook(() =>
      useSaveFieldAsDefault({
        onSaveFieldAsDefault: mockOnSaveFieldAsDefault,
        onChange: mockOnChange,
      })
    );

    expect(result.current.savingField).toBeNull();
  });

  it('does nothing when onSaveFieldAsDefault is undefined', async () => {
    const { result } = renderHook(() =>
      useSaveFieldAsDefault({
        onChange: mockOnChange,
      })
    );

    await act(async () => {
      await result.current.handleSaveFieldAsDefault('prompt' as never, 'test' as never);
    });

    expect(mockOnChange).not.toHaveBeenCalled();
    expect(result.current.savingField).toBeNull();
  });

  it('sets savingField during save operation', async () => {
    let resolvePromise: (value: boolean) => void = () => {};
    mockOnSaveFieldAsDefault.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolvePromise = resolve;
      })
    );

    const { result } = renderHook(() =>
      useSaveFieldAsDefault({
        onSaveFieldAsDefault: mockOnSaveFieldAsDefault,
        onChange: mockOnChange,
      })
    );

    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.handleSaveFieldAsDefault('prompt' as never, 'test value' as never);
    });

    // During save, savingField should be set
    expect(result.current.savingField).toBe('prompt');

    // Resolve the save
    await act(async () => {
      resolvePromise(true);
      await savePromise!;
    });

    // After save, savingField should be cleared
    expect(result.current.savingField).toBeNull();
  });

  it('calls onChange with undefined to clear the field on success', async () => {
    mockOnSaveFieldAsDefault.mockResolvedValue(true);

    const { result } = renderHook(() =>
      useSaveFieldAsDefault({
        onSaveFieldAsDefault: mockOnSaveFieldAsDefault,
        onChange: mockOnChange,
      })
    );

    await act(async () => {
      await result.current.handleSaveFieldAsDefault('prompt' as never, 'test value' as never);
    });

    expect(mockOnSaveFieldAsDefault).toHaveBeenCalledWith('prompt', 'test value');
    expect(mockOnChange).toHaveBeenCalledWith({ prompt: undefined });
  });

  it('does not call onChange on failure', async () => {
    mockOnSaveFieldAsDefault.mockResolvedValue(false);

    const { result } = renderHook(() =>
      useSaveFieldAsDefault({
        onSaveFieldAsDefault: mockOnSaveFieldAsDefault,
        onChange: mockOnChange,
      })
    );

    await act(async () => {
      await result.current.handleSaveFieldAsDefault('prompt' as never, 'test value' as never);
    });

    expect(mockOnSaveFieldAsDefault).toHaveBeenCalledWith('prompt', 'test value');
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('clears savingField even on error', async () => {
    mockOnSaveFieldAsDefault.mockRejectedValue(new Error('Save failed'));

    const { result } = renderHook(() =>
      useSaveFieldAsDefault({
        onSaveFieldAsDefault: mockOnSaveFieldAsDefault,
        onChange: mockOnChange,
      })
    );

    await act(async () => {
      try {
        await result.current.handleSaveFieldAsDefault('prompt' as never, 'test value' as never);
      } catch {
        // Expected
      }
    });

    // savingField should be cleared via finally block
    expect(result.current.savingField).toBeNull();
  });
});
