import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAutomatedPromptSubmission } from './useAutomatedPromptSubmission';
import { toast } from '@/shared/components/ui/runtime/sonner';

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('useAutomatedPromptSubmission', () => {
  it('shows an error when master prompt is empty', () => {
    const queueIncomingTask = vi.fn();

    const { result } = renderHook(() =>
      useAutomatedPromptSubmission({
        context: {
          generationSourceRef: { current: 'standard' },
          selectedTextModelRef: { current: 'gpt-5-mini' },
          formStateRef: {
            current: {
              masterPromptText: '   ',
              imagesPerPrompt: 1,
              promptMultiplier: 1,
              styleReferenceImageGeneration: null,
            },
          },
        } as never,
        aiGeneratePrompts: vi.fn(),
        onGenerate: vi.fn(),
        setPrompts: vi.fn(),
        queueIncomingTask,
      }),
    );

    act(() => {
      result.current();
    });

    expect(toast.error).toHaveBeenCalledWith('Please enter a master prompt.');
    expect(queueIncomingTask).not.toHaveBeenCalled();
  });

  it('queues automated prompt generation when form state is valid', () => {
    const queueIncomingTask = vi.fn();

    const { result } = renderHook(() =>
      useAutomatedPromptSubmission({
        context: {
          generationSourceRef: { current: 'standard' },
          selectedTextModelRef: { current: 'gpt-5-mini' },
          formStateRef: {
            current: {
              masterPromptText: 'cinematic landscape',
              imagesPerPrompt: 2,
              promptMultiplier: 3,
              styleReferenceImageGeneration: null,
              selectedProjectId: 'project-1',
              associatedShotId: null,
              beforePromptText: '',
              afterPromptText: '',
              styleBoostTerms: [],
              isLocalGenerationEnabled: false,
              hiresFixConfig: null,
              styleReferenceStrength: 0.5,
              subjectStrength: 0.5,
              effectiveSubjectDescription: '',
              inThisScene: false,
              inThisSceneStrength: 0.5,
              referenceMode: 'none',
            },
          },
        } as never,
        aiGeneratePrompts: vi.fn(),
        onGenerate: vi.fn(),
        setPrompts: vi.fn(),
        queueIncomingTask,
      }),
    );

    act(() => {
      result.current();
    });

    expect(queueIncomingTask).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'useFormSubmission.submitAutomated',
        expectedCount: 6,
      }),
    );
  });
});
