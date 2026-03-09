// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIInputTextPopover } from './useAIInputTextPopover';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  getErrorMessage: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
}));

vi.mock('../../../integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    functions: {
      invoke: (...args: unknown[]) => mocks.invoke(...args),
    },
  }),
}));

vi.mock('../../lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) =>
    mocks.normalizeAndPresentError(...args),
}));

vi.mock('../../lib/errorHandling/errorUtils', () => ({
  getErrorMessage: (...args: unknown[]) => mocks.getErrorMessage(...args),
}));

describe('useAIInputTextPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('opens the popover and clears stale draft input', () => {
    const { result } = renderHook(() =>
      useAIInputTextPopover({
        context: 'prompt context',
        existingValue: 'existing prompt',
        onResult: vi.fn(),
      }),
    );

    act(() => {
      result.current.setInputValue('stale draft');
      result.current.handlePopoverOpenChange(true);
    });

    expect(result.current.isPopoverOpen).toBe(true);
    expect(result.current.textState).toBe('open');
    expect(result.current.inputValue).toBe('');
  });

  it('submits text instructions and closes after a successful response', async () => {
    mocks.invoke.mockResolvedValue({
      data: { transcription: 'make it cinematic', prompt: 'cinematic prompt' },
      error: null,
    });
    const onResult = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAIInputTextPopover({
        context: 'prompt context',
        example: 'cinematic example',
        existingValue: 'existing prompt',
        onResult,
        onError,
      }),
    );

    act(() => {
      result.current.handlePopoverOpenChange(true);
      result.current.setInputValue('  make it cinematic  ');
    });

    await act(async () => {
      await result.current.handleTextSubmit();
    });

    expect(mocks.invoke).toHaveBeenCalledWith('ai-voice-prompt', {
      body: {
        textInstructions: 'make it cinematic',
        task: 'transcribe_and_write',
        context: 'prompt context',
        example: 'cinematic example',
        existingValue: 'existing prompt',
      },
    });
    expect(onResult).toHaveBeenCalledWith({
      transcription: 'make it cinematic',
      prompt: 'cinematic prompt',
    });
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.textState).toBe('success');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isPopoverOpen).toBe(false);
    expect(result.current.textState).toBe('idle');
    expect(result.current.inputValue).toBe('');
  });

  it('reports service errors and keeps the popover open', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: 'service unavailable' },
    });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAIInputTextPopover({
        onResult: vi.fn(),
        onError,
      }),
    );

    act(() => {
      result.current.handlePopoverOpenChange(true);
      result.current.setInputValue('retry me');
    });

    await act(async () => {
      await result.current.handleTextSubmit();
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'service unavailable' }),
      expect.objectContaining({
        context: 'AIInputButton',
        showToast: false,
      }),
    );
    expect(onError).toHaveBeenCalledWith('service unavailable');
    expect(result.current.textState).toBe('open');
    expect(result.current.isPopoverOpen).toBe(true);
  });
});
