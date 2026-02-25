import { useCallback } from 'react';
import type { GetTaskParams, UseFormSubmissionProps } from './types';
import type { RunIncomingTask } from './useIncomingTaskRunner';
import { sanitizePrompts, truncateLabel } from './promptSubmissionTransforms';
import type { SubmissionRuntimeContext } from './submissionContext';
import { useAutomatedPromptSubmission } from './useAutomatedPromptSubmission';
import { usePromptQueueSubmission } from './usePromptQueueSubmission';

interface SubmissionOrchestratorEffects {
  automatedSubmitButton: UseFormSubmissionProps['automatedSubmitButton'];
  aiGeneratePrompts: UseFormSubmissionProps['aiGeneratePrompts'];
  onGenerate: UseFormSubmissionProps['onGenerate'];
  setPrompts: UseFormSubmissionProps['setPrompts'];
  getTaskParams: GetTaskParams;
  runIncomingTask: RunIncomingTask;
}

interface UseSubmissionOrchestratorInput {
  context: SubmissionRuntimeContext;
  effects: SubmissionOrchestratorEffects;
}

export interface SubmissionOrchestratorCommands {
  submitManaged: () => void;
  submitAutomated: () => void;
  queueExisting: () => void;
  queueLikeExisting: () => void;
  generateAndSubmit: (updatedPrompts: UseFormSubmissionProps['prompts']) => void;
}

export function useSubmissionOrchestrator(
  input: UseSubmissionOrchestratorInput,
): SubmissionOrchestratorCommands {
  const { context, effects } = input;
  const {
    prompts,
    actionablePromptsCount,
    formStateRef,
  } = context;
  const {
    automatedSubmitButton,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    getTaskParams,
    runIncomingTask,
  } = effects;

  const queueIncomingTask = useCallback((options: Parameters<RunIncomingTask>[0]) => {
    automatedSubmitButton.trigger();
    runIncomingTask(options);
  }, [automatedSubmitButton, runIncomingTask]);

  const generateAndSubmit = useCallback((updatedPrompts: UseFormSubmissionProps['prompts']) => {
    const sanitizedPrompts = sanitizePrompts(updatedPrompts);
    setPrompts(sanitizedPrompts);

    const taskParams = getTaskParams(sanitizedPrompts);
    if (!taskParams) {
      return;
    }

    void onGenerate(taskParams);
  }, [getTaskParams, onGenerate, setPrompts]);

  const submitManaged = useCallback(() => {
    const state = formStateRef.current;
    if (!state) {
      return;
    }

    const taskParams = getTaskParams(prompts);
    if (!taskParams) {
      return;
    }

    const firstPrompt = prompts.find((prompt) => prompt.fullPrompt.trim())?.fullPrompt || 'Generating...';

    queueIncomingTask({
      label: truncateLabel(firstPrompt),
      expectedCount: actionablePromptsCount * state.imagesPerPrompt,
      context: 'useFormSubmission.submitManaged',
      toastTitle: 'Failed to create tasks. Please try again.',
      execute: async () => {
        const result = await onGenerate(taskParams);
        return result || undefined;
      },
    });
  }, [
    actionablePromptsCount,
    formStateRef,
    getTaskParams,
    onGenerate,
    prompts,
    queueIncomingTask,
  ]);

  const submitAutomated = useAutomatedPromptSubmission({
    context,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    queueIncomingTask,
  });

  const {
    queueExisting,
    queueLikeExisting,
  } = usePromptQueueSubmission({
    context,
    getTaskParams,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    queueIncomingTask,
  });

  return {
    submitManaged,
    submitAutomated,
    queueExisting,
    queueLikeExisting,
    generateAndSubmit,
  };
}
