import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePromptsSectionController } from './usePromptsSectionController';

const mocks = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
  useFormUIContext: vi.fn(),
  useFormCoreContext: vi.fn(),
  useFormPromptsContext: vi.fn(),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: (...args: unknown[]) => mocks.useIsMobile(...args),
}));

vi.mock('../../ImageGenerationFormContext', () => ({
  useFormUIContext: (...args: unknown[]) => mocks.useFormUIContext(...args),
  useFormCoreContext: (...args: unknown[]) => mocks.useFormCoreContext(...args),
  useFormPromptsContext: (...args: unknown[]) => mocks.useFormPromptsContext(...args),
}));

describe('usePromptsSectionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useIsMobile.mockReturnValue(false);
    mocks.useFormUIContext.mockReturnValue({
      uiActions: {
        setPromptModalOpen: vi.fn(),
        openMagicPrompt: vi.fn(),
      },
    });
    mocks.useFormCoreContext.mockReturnValue({
      isGenerating: true,
      ready: true,
    });
    mocks.useFormPromptsContext.mockReturnValue({
      prompts: [{ id: 'p1', fullPrompt: 'Prompt one' }],
      masterPromptText: 'Master text',
      effectivePromptMode: 'automated',
      actionablePromptsCount: 1,
      currentBeforePromptText: 'Before text',
      currentAfterPromptText: 'After text',
      setMasterPromptText: vi.fn(),
      setCurrentBeforePromptText: vi.fn(),
      setCurrentAfterPromptText: vi.fn(),
      handleDeleteAllPrompts: vi.fn(),
      markAsInteracted: vi.fn(),
    });
  });

  it('clears text fields and marks interaction on clear handlers', () => {
    const { result } = renderHook(() => usePromptsSectionController());
    const promptsContext = mocks.useFormPromptsContext.mock.results[0].value;

    act(() => {
      result.current.onClearMasterPromptText();
      result.current.onClearBeforeEachPromptText();
      result.current.onClearAfterEachPromptText();
    });

    expect(promptsContext.setMasterPromptText).toHaveBeenCalledWith('');
    expect(promptsContext.setCurrentBeforePromptText).toHaveBeenCalledWith('');
    expect(promptsContext.setCurrentAfterPromptText).toHaveBeenCalledWith('');
    expect(promptsContext.markAsInteracted).toHaveBeenCalledTimes(3);
  });

  it('extracts voice result text from prompt or transcription field', () => {
    const { result } = renderHook(() => usePromptsSectionController());
    const promptsContext = mocks.useFormPromptsContext.mock.results[0].value;

    act(() => {
      result.current.onMasterVoiceResult({ prompt: 'Voice master' });
      result.current.onBeforeVoiceResult({ transcription: 'Voice before' });
      result.current.onAfterVoiceResult({});
    });

    expect(promptsContext.setMasterPromptText).toHaveBeenCalledWith('Voice master');
    expect(promptsContext.setCurrentBeforePromptText).toHaveBeenCalledWith('Voice before');
    expect(promptsContext.setCurrentAfterPromptText).toHaveBeenCalledWith('');
  });

  it('normalizes unknown prompt mode values to automated while preserving managed mode', () => {
    const basePromptsContext = {
      prompts: [{ id: 'p1', fullPrompt: 'Prompt one' }],
      masterPromptText: 'Master text',
      effectivePromptMode: 'automated',
      actionablePromptsCount: 1,
      currentBeforePromptText: 'Before text',
      currentAfterPromptText: 'After text',
      setMasterPromptText: vi.fn(),
      setCurrentBeforePromptText: vi.fn(),
      setCurrentAfterPromptText: vi.fn(),
      handleDeleteAllPrompts: vi.fn(),
      markAsInteracted: vi.fn(),
    };

    mocks.useFormPromptsContext.mockReturnValueOnce({
      ...basePromptsContext,
      effectivePromptMode: 'managed',
    });
    const managed = renderHook(() => usePromptsSectionController());
    expect(managed.result.current.normalizedPromptMode).toBe('managed');

    mocks.useFormPromptsContext.mockReturnValueOnce({
      ...basePromptsContext,
      effectivePromptMode: 'legacy',
    });
    const fallback = renderHook(() => usePromptsSectionController());
    expect(fallback.result.current.normalizedPromptMode).toBe('automated');
  });
});
