import type { FormStateSnapshot, GetTaskParams, UseFormSubmissionProps, UseFormSubmissionReturn } from './types';
import type { IncomingTask } from '@/shared/contexts/IncomingTasksContext';
import type { MutableRefObject } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useIncomingTaskRunner } from './useIncomingTaskRunner';
import { usePromptQueueHandlers } from './usePromptQueueHandlers';
import { useSubmitHandler } from './useSubmitHandler';

interface UseSubmissionHandlersProps {
  effectivePromptMode: UseFormSubmissionProps['effectivePromptMode'];
  prompts: UseFormSubmissionProps['prompts'];
  promptMultiplier: UseFormSubmissionProps['promptMultiplier'];
  imagesPerPrompt: UseFormSubmissionProps['imagesPerPrompt'];
  actionablePromptsCount: UseFormSubmissionProps['actionablePromptsCount'];
  styleReferenceImageGeneration: UseFormSubmissionProps['styleReferenceImageGeneration'];
  generationSourceRef: UseFormSubmissionProps['generationSourceRef'];
  selectedTextModelRef: UseFormSubmissionProps['selectedTextModelRef'];
  automatedSubmitButton: UseFormSubmissionProps['automatedSubmitButton'];
  aiGeneratePrompts: UseFormSubmissionProps['aiGeneratePrompts'];
  onGenerate: UseFormSubmissionProps['onGenerate'];
  setPrompts: UseFormSubmissionProps['setPrompts'];
  addIncomingTask: (task: Omit<IncomingTask, 'id' | 'startedAt'>) => string;
  completeIncomingTask: (id: string, newBaseline: number) => void;
  queryClient: QueryClient;
  getTaskParams: GetTaskParams;
  formStateRef: MutableRefObject<FormStateSnapshot | undefined>;
}

export function useSubmissionHandlers(props: UseSubmissionHandlersProps): UseFormSubmissionReturn {
  const {
    effectivePromptMode,
    prompts,
    promptMultiplier,
    imagesPerPrompt,
    actionablePromptsCount,
    styleReferenceImageGeneration,
    generationSourceRef,
    selectedTextModelRef,
    automatedSubmitButton,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    addIncomingTask,
    completeIncomingTask,
    queryClient,
    getTaskParams,
    formStateRef,
  } = props;

  const runIncomingTask = useIncomingTaskRunner({
    addIncomingTask,
    completeIncomingTask,
    queryClient,
  });

  const handleSubmit = useSubmitHandler({
    effectivePromptMode,
    prompts,
    actionablePromptsCount,
    styleReferenceImageGeneration,
    generationSourceRef,
    selectedTextModelRef,
    automatedSubmitButton,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    getTaskParams,
    formStateRef,
    runIncomingTask,
  });

  const {
    handleGenerateAndQueue,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
  } = usePromptQueueHandlers({
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
  });

  return {
    handleSubmit,
    handleGenerateAndQueue,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
  };
}
