import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import type { FormStateSnapshot, GetTaskParams, UseFormSubmissionProps } from './types';
import type { RunIncomingTask } from './useIncomingTaskRunner';
import { sanitizePrompts, toPromptEntries, truncateLabel } from './utils';

interface UsePromptQueueHandlersInput {
  prompts: UseFormSubmissionProps['prompts'];
  promptMultiplier: UseFormSubmissionProps['promptMultiplier'];
  imagesPerPrompt: UseFormSubmissionProps['imagesPerPrompt'];
  actionablePromptsCount: UseFormSubmissionProps['actionablePromptsCount'];
  styleReferenceImageGeneration: UseFormSubmissionProps['styleReferenceImageGeneration'];
  generationSourceRef: UseFormSubmissionProps['generationSourceRef'];
  automatedSubmitButton: UseFormSubmissionProps['automatedSubmitButton'];
  aiGeneratePrompts: UseFormSubmissionProps['aiGeneratePrompts'];
  onGenerate: UseFormSubmissionProps['onGenerate'];
  setPrompts: UseFormSubmissionProps['setPrompts'];
  getTaskParams: GetTaskParams;
  formStateRef: MutableRefObject<FormStateSnapshot | undefined>;
  runIncomingTask: RunIncomingTask;
}

interface PromptQueueHandlers {
  handleGenerateAndQueue: (updatedPrompts: UseFormSubmissionProps['prompts']) => void;
  handleUseExistingPrompts: () => Promise<void>;
  handleNewPromptsLikeExisting: () => Promise<void>;
}

export function usePromptQueueHandlers(input: UsePromptQueueHandlersInput): PromptQueueHandlers {
  const {
    prompts,
    promptMultiplier,
    imagesPerPrompt,
    actionablePromptsCount,
    styleReferenceImageGeneration,
    generationSourceRef,
    automatedSubmitButton,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    getTaskParams,
    formStateRef,
    runIncomingTask,
  } = input;

  const handleGenerateAndQueue = useCallback((updatedPrompts: UseFormSubmissionProps['prompts']) => {
    const sanitizedPrompts = sanitizePrompts(updatedPrompts);
    setPrompts(sanitizedPrompts);

    const taskParams = getTaskParams(updatedPrompts);
    if (!taskParams) {
      return;
    }

    onGenerate(taskParams);
  }, [getTaskParams, onGenerate, setPrompts]);

  const handleUseExistingPrompts = useCallback(async () => {
    const taskParams = getTaskParams(prompts, { imagesPerPromptOverride: promptMultiplier });
    if (!taskParams) {
      return;
    }

    automatedSubmitButton.trigger();

    const firstPrompt = prompts.find((prompt) => prompt.fullPrompt.trim())?.fullPrompt || 'Generating...';

    runIncomingTask({
      label: truncateLabel(firstPrompt),
      expectedCount: actionablePromptsCount * promptMultiplier,
      projectIdForCounts: formStateRef.current?.selectedProjectId,
      context: 'useFormSubmission.handleUseExistingPrompts',
      toastTitle: 'Failed to create tasks. Please try again.',
      execute: async () => {
        await onGenerate(taskParams);
      },
    });
  }, [
    actionablePromptsCount,
    automatedSubmitButton,
    formStateRef,
    getTaskParams,
    onGenerate,
    promptMultiplier,
    prompts,
    runIncomingTask,
  ]);

  const handleNewPromptsLikeExisting = useCallback(async () => {
    const activePrompts = prompts.filter((prompt) => prompt.fullPrompt.trim() !== '');
    if (activePrompts.length === 0) {
      toast.error('No prompts available. Please add prompts first.');
      return;
    }

    if (generationSourceRef.current === 'by-reference' && !styleReferenceImageGeneration) {
      toast.error('Please upload a style reference image for by-reference mode.');
      return;
    }

    automatedSubmitButton.trigger();

    runIncomingTask({
      label: 'More like existing...',
      expectedCount: imagesPerPrompt * promptMultiplier,
      projectIdForCounts: formStateRef.current?.selectedProjectId,
      context: 'useFormSubmission.handleNewPromptsLikeExisting',
      toastTitle: 'Failed to generate prompts. Please try again.',
      execute: async () => {
        const rawResults = await aiGeneratePrompts({
          overallPromptText: 'Make me more prompts like this.',
          numberToGenerate: imagesPerPrompt,
          existingPrompts: activePrompts.map((prompt) => ({
            id: prompt.id,
            text: prompt.fullPrompt,
            shortText: prompt.shortPrompt,
            hidden: false,
          })),
          addSummaryForNewPrompts: true,
          replaceCurrentPrompts: true,
          temperature: 0.8,
          rulesToRememberText: '',
        });

        const newPrompts = toPromptEntries(rawResults);
        setPrompts(newPrompts);

        const taskParams = getTaskParams(newPrompts, { imagesPerPromptOverride: promptMultiplier });
        if (!taskParams) {
          return;
        }

        await onGenerate(taskParams);
      },
    });
  }, [
    aiGeneratePrompts,
    automatedSubmitButton,
    formStateRef,
    generationSourceRef,
    getTaskParams,
    imagesPerPrompt,
    onGenerate,
    promptMultiplier,
    prompts,
    runIncomingTask,
    setPrompts,
    styleReferenceImageGeneration,
  ]);

  return {
    handleGenerateAndQueue,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
  };
}
