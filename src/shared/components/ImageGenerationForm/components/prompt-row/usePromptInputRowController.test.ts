import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent, PointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePromptInputRowController } from './usePromptInputRowController';

const mockState = vi.hoisted(() => ({
  isMobile: false,
  isDraggingRef: { current: false },
  handleTouchStart: vi.fn(),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => mockState.isMobile,
}));

vi.mock('@/shared/hooks/useTouchDragDetection', () => ({
  useTouchDragDetection: () => ({
    isDragging: mockState.isDraggingRef,
    handleTouchStart: mockState.handleTouchStart,
  }),
}));

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    autoEnterEditWhenActive: false,
    forceExpanded: false,
    index: 0,
    isActiveForFullView: false,
    onSetActiveForFullView: vi.fn(),
    onUpdate: vi.fn(),
    promptEntry: {
      id: 'prompt-1',
      fullPrompt: 'Initial prompt',
    },
    ...overrides,
  };
}

describe('usePromptInputRowController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'count').mockImplementation(() => {});
    mockState.isMobile = false;
    mockState.isDraggingRef.current = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('handles desktop editing flow, updates prompt text, and exposes prompt actions', () => {
    const props = makeProps({
      isActiveForFullView: true,
    });
    const { result } = renderHook((hookProps) => usePromptInputRowController(hookProps), {
      initialProps: props,
    });

    result.current.textareaRef.current = {
      style: { height: '' },
      scrollHeight: 88,
    } as unknown as HTMLTextAreaElement;

    act(() => {
      result.current.handleFocus();
    });
    expect(result.current.isEditingFullPrompt).toBe(true);
    expect(result.current.currentPlaceholder).toBe('Editing prompt #1...');
    expect(props.onSetActiveForFullView).toHaveBeenCalledWith('prompt-1');
    expect(result.current.textareaRef.current?.style.height).toBe('88px');

    act(() => {
      result.current.handleFullPromptChange({
        target: { value: 'Updated prompt' },
      } as ChangeEvent<HTMLTextAreaElement>);
    });
    expect(result.current.displayText).toBe('Updated prompt');
    expect(props.onUpdate).toHaveBeenCalledWith('prompt-1', 'fullPrompt', 'Updated prompt');

    act(() => {
      result.current.handleBlur();
    });
    expect(result.current.isEditingFullPrompt).toBe(false);
    expect(result.current.currentPlaceholder).toBe('Enter prompt #1...');
    expect(props.onUpdate).toHaveBeenCalledWith('prompt-1', 'fullPrompt', 'Updated prompt');

    act(() => {
      result.current.clearPrompt();
      result.current.handleVoiceResult({ transcription: 'Voice prompt' });
    });
    expect(props.onUpdate).toHaveBeenCalledWith('prompt-1', 'fullPrompt', '');
    expect(props.onUpdate).toHaveBeenCalledWith('prompt-1', 'fullPrompt', 'Voice prompt');
    expect(result.current.handleTouchStart).toBe(mockState.handleTouchStart);
  });

  it('enters mobile edit mode after row activation and handles focus/scroll timers', () => {
    vi.useFakeTimers();
    mockState.isMobile = true;
    const props = makeProps({
      isActiveForFullView: false,
    });
    const { result, rerender } = renderHook((hookProps) => usePromptInputRowController(hookProps), {
      initialProps: props,
    });

    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    result.current.textareaRef.current = {
      style: { height: '' },
      scrollHeight: 64,
      focus,
    } as unknown as HTMLTextAreaElement;
    result.current.promptContainerRef.current = {
      scrollIntoView,
    } as unknown as HTMLDivElement;

    act(() => {
      result.current.handlePromptRowClick();
    });
    expect(props.onSetActiveForFullView).toHaveBeenCalledWith('prompt-1');

    rerender({
      ...props,
      isActiveForFullView: true,
    });
    expect(result.current.isEditingFullPrompt).toBe(true);

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });

    const preventDefault = vi.fn();
    act(() => {
      result.current.handlePointerDown({
        isPrimary: true,
        pointerType: 'touch',
        preventDefault,
      } as unknown as PointerEvent);
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores mobile row click while dragging and syncs parent prompt updates while not editing', () => {
    mockState.isMobile = true;
    mockState.isDraggingRef.current = true;
    const props = makeProps({
      promptEntry: { id: 'prompt-1', fullPrompt: 'Original' },
    });
    const { result, rerender } = renderHook((hookProps) => usePromptInputRowController(hookProps), {
      initialProps: props,
    });

    act(() => {
      result.current.handlePromptRowClick();
    });
    expect(props.onSetActiveForFullView).not.toHaveBeenCalled();

    rerender({
      ...props,
      promptEntry: { id: 'prompt-1', fullPrompt: 'Parent updated text' },
    });
    expect(result.current.displayText).toBe('Parent updated text');

    rerender({
      ...props,
      isActiveForFullView: true,
      autoEnterEditWhenActive: true,
      promptEntry: { id: 'prompt-1', fullPrompt: 'Parent updated text' },
    });
    expect(result.current.isEditingFullPrompt).toBe(true);
  });
});
