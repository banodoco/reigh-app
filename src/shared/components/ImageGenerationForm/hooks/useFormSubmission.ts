/**
 * useFormSubmission - Handles form submission and task creation
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useSubmissionHandlers } from './formSubmission/useSubmissionHandlers';
import { useTaskParamsBuilder } from './formSubmission/useTaskParamsBuilder';
import type {
  FormStateSnapshot,
  UseFormSubmissionProps,
  UseFormSubmissionReturn,
} from './formSubmission/types';

export type {
  FormStateSnapshot,
  UseFormSubmissionProps,
  UseFormSubmissionReturn,
} from './formSubmission/types';

export function useFormSubmission(props: UseFormSubmissionProps): UseFormSubmissionReturn {
  const {
    selectedProjectId,
    prompts,
    imagesPerPrompt,
    promptMultiplier,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    styleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    effectivePromptMode,
    masterPromptText,
    actionablePromptsCount,
    generationSourceRef,
    selectedTextModelRef,
    styleReferenceImageGeneration,
    styleReferenceStrength,
    subjectStrength,
    effectiveSubjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    automatedSubmitButton,
  } = props;

  const queryClient = useQueryClient();
  const { addIncomingTask, completeIncomingTask } = useIncomingTasks();

  const formStateRef = useRef<FormStateSnapshot>();
  useEffect(() => {
    formStateRef.current = {
      masterPromptText,
      imagesPerPrompt,
      promptMultiplier,
      selectedProjectId,
      associatedShotId,
      styleReferenceImageGeneration,
      styleReferenceStrength,
      subjectStrength,
      effectiveSubjectDescription,
      inThisScene,
      inThisSceneStrength,
      referenceMode,
      beforePromptText: currentBeforePromptText,
      afterPromptText: currentAfterPromptText,
      styleBoostTerms,
      isLocalGenerationEnabled,
      hiresFixConfig,
    };
  });

  const getTaskParams = useTaskParamsBuilder({
    selectedProjectId,
    imagesPerPrompt,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    styleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    generationSourceRef,
    selectedTextModelRef,
    styleReferenceImageGeneration,
    styleReferenceStrength,
    subjectStrength,
    effectiveSubjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
  });

  return useSubmissionHandlers({
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
  });
}
