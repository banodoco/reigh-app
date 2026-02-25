import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSubmissionOrchestrator } from '../useSubmissionOrchestrator';
import type { PromptEntry } from '../../../types';

const queueButton = {
  trigger: vi.fn(),
  isSubmitting: false,
  isSuccess: false,
};

function buildPrompt(id: string, fullPrompt: string, shortPrompt = ''): PromptEntry {
  return {
    id,
    fullPrompt,
    shortPrompt,
  };
}

describe('useSubmissionOrchestrator', () => {
  it('builds task params from sanitized prompts in generateAndSubmit', () => {
    const getTaskParams = vi.fn().mockReturnValue({ task: true });
    const setPrompts = vi.fn();
    const onGenerate = vi.fn();

    const { result } = renderHook(() => useSubmissionOrchestrator({
      context: {
        prompts: [],
        promptMultiplier: 1,
        imagesPerPrompt: 1,
        actionablePromptsCount: 1,
        styleReferenceImageGeneration: null,
        generationSourceRef: { current: 'just-text' },
        selectedTextModelRef: { current: 'qwen-image' },
        formStateRef: { current: undefined },
      },
      effects: {
        automatedSubmitButton: queueButton,
        aiGeneratePrompts: vi.fn(),
        onGenerate,
        setPrompts,
        getTaskParams,
        runIncomingTask: vi.fn(),
      },
    }));

    const rawPrompts = [buildPrompt('prompt-1', 'A cinematic shot', '')];
    result.current.generateAndSubmit(rawPrompts);

    const sanitizedPrompts = getTaskParams.mock.calls[0][0] as PromptEntry[];
    expect(sanitizedPrompts).toHaveLength(1);
    expect(sanitizedPrompts[0].id).toBe('prompt-1');
    expect(sanitizedPrompts[0].shortPrompt).toBeTruthy();
    expect(setPrompts).toHaveBeenCalledWith(sanitizedPrompts);
    expect(onGenerate).toHaveBeenCalledWith({ task: true });
  });
});
