import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const mockNormalizeAndPresentError = vi.fn();

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockNormalizeAndPresentError(...args),
}));

import { usePromptEditing } from './usePromptEditing';

function buildInitialPrompts() {
  return [
    { id: 'p1', fullPrompt: 'first prompt', shortPrompt: 'first short' },
    { id: 'p2', fullPrompt: 'second prompt', shortPrompt: '' },
  ];
}

function createScrollRef() {
  return {
    current: {
      scrollTop: 100,
      scrollHeight: 900,
      scrollTo: vi.fn(),
    },
  } as never;
}

function buildProps(overrides: Record<string, unknown> = {}) {
  let promptCounter = 0;

  return {
    isOpen: true,
    initialPrompts: buildInitialPrompts(),
    onSave: vi.fn(),
    onClose: vi.fn(),
    scrollRef: createScrollRef(),
    selectedProjectId: 'project-1',
    generatePromptId: vi.fn(() => {
      promptCounter += 1;
      return `generated-${promptCounter}`;
    }),
    onGenerateAndQueue: vi.fn(),
    aiGeneratePrompts: vi.fn(async () => [
      { id: 'new-1', text: 'generated prompt 1', shortText: 'short 1' },
      { id: 'new-2', text: 'generated prompt 2' },
    ]),
    aiEditPrompt: vi.fn(async ({ originalPromptText }: { originalPromptText: string }) => ({
      success: true,
      newText: `${originalPromptText} (edited)`,
      newShortText: 'edited short',
    })),
    aiGenerateSummary: vi.fn(async () => 'summary'),
    ...overrides,
  };
}

beforeEach(() => {
  mockNormalizeAndPresentError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePromptEditing', () => {
  it('supports local prompt edits/add/remove, remove-all, and final save-close', async () => {
    vi.useFakeTimers();
    const props = buildProps();

    const { result } = renderHook(() => usePromptEditing(props as never));

    act(() => {
      result.current.handlePromptFieldUpdate('p1', 'fullPrompt', 'updated prompt');
    });
    expect(result.current.internalPrompts[0].fullPrompt).toBe('updated prompt');

    act(() => {
      result.current.handleInternalRemovePrompt('p2');
    });
    expect(result.current.internalPrompts.map((prompt) => prompt.id)).toEqual(['p1']);

    act(() => {
      result.current.handleInternalAddBlankPrompt();
    });
    expect(result.current.internalPrompts).toHaveLength(2);
    expect(result.current.internalPrompts[1]).toEqual({ id: 'generated-1', fullPrompt: '', shortPrompt: '' });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(props.scrollRef.current.scrollTo).toHaveBeenCalledWith({
      top: props.scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });

    act(() => {
      result.current.handleRemoveAllPrompts();
    });
    expect(result.current.internalPrompts).toEqual([{ id: 'generated-2', fullPrompt: '', shortPrompt: '' }]);

    act(() => {
      result.current.handleFinalSaveAndClose();
    });
    expect(props.onSave).toHaveBeenCalledWith([{ id: 'generated-2', fullPrompt: '', shortPrompt: '' }]);
    expect(props.scrollRef.current.scrollTop).toBe(0);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('autosaves changed prompts every 3s and normalizes save errors', () => {
    vi.useFakeTimers();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('save failed');
      })
      .mockImplementationOnce(() => undefined);

    const props = buildProps({ onSave });
    const { result } = renderHook(() => usePromptEditing(props as never));

    act(() => {
      result.current.handlePromptFieldUpdate('p1', 'fullPrompt', 'changed once');
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(mockNormalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'PromptEditorModal', showToast: false }),
    );

    act(() => {
      result.current.handlePromptFieldUpdate('p1', 'fullPrompt', 'changed twice');
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('generates prompts, replaces empty list, and can queue generated output', async () => {
    vi.useFakeTimers();
    const onGenerateAndQueue = vi.fn();
    const props = buildProps({
      initialPrompts: [{ id: 'empty-1', fullPrompt: '', shortPrompt: '' }],
      onGenerateAndQueue,
    });

    const { result } = renderHook(() => usePromptEditing(props as never));

    await act(async () => {
      await result.current.handleGenerateAndAddPrompts({
        overallPromptText: 'Generate me',
        numberToGenerate: 2,
        includeExistingContext: true,
        addSummaryForNewPrompts: true,
        replaceCurrentPrompts: false,
        temperature: 0.8,
        rulesToRememberText: '',
      } as never);
    });

    expect(result.current.internalPrompts.map((prompt) => prompt.id)).toEqual(['new-1', 'new-2']);
    expect(props.aiGenerateSummary).not.toHaveBeenCalled();

    await act(async () => {
      const queuePromise = result.current.handleGenerateAndQueue({
        overallPromptText: 'Queue too',
        numberToGenerate: 1,
        includeExistingContext: true,
        addSummaryForNewPrompts: false,
        replaceCurrentPrompts: false,
        temperature: 0.8,
        rulesToRememberText: '',
      } as never);
      await vi.advanceTimersByTimeAsync(100);
      await queuePromise;
    });

    expect(onGenerateAndQueue).toHaveBeenCalledTimes(1);
    const queuedPrompts = onGenerateAndQueue.mock.calls[0][0] as Array<{ id: string }>;
    expect(Array.isArray(queuedPrompts)).toBe(true);
    expect(queuedPrompts.some((prompt) => prompt.id === 'new-1')).toBe(true);
  });

  it('bulk-edits prompts sequentially and reports per-prompt edit failures', async () => {
    const aiEditPrompt = vi
      .fn()
      .mockResolvedValueOnce({ success: true, newText: 'edited first', newShortText: 'short first' })
      .mockRejectedValueOnce(new Error('edit failed'));

    const props = buildProps({ aiEditPrompt });
    const { result } = renderHook(() => usePromptEditing(props as never));

    await act(async () => {
      await result.current.handleBulkEditPrompts({
        editInstructions: 'Make cinematic',
        modelType: 'smart',
      });
    });

    expect(result.current.internalPrompts[0].fullPrompt).toBe('edited first');
    expect(result.current.internalPrompts[0].shortPrompt).toBe('short first');
    expect(mockNormalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'PromptEditorModal',
        toastTitle: 'Error editing prompt p2...',
      }),
    );
  });
});
