/**
 * useFormSubmission - Handles form submission and task creation
 */

import { useEffect, useRef } from 'react';
import { useIncomingTaskRunner } from './formSubmission/useIncomingTaskRunner';
import { usePromptQueueHandlers } from './formSubmission/usePromptQueueHandlers';
import { useSubmitHandler } from './formSubmission/useSubmitHandler';
import { useSubmissionOrchestrator } from './formSubmission/useSubmissionOrchestrator';
import { buildSubmissionRuntimeContext } from './formSubmission/submissionContext';
import { useTaskParamsBuilder } from './formSubmission/useTaskParamsBuilder';
import type {
  FormStateSnapshot,
  UseFormSubmissionProps,
  UseFormSubmissionReturn,
} from './formSubmission/types';

;

export function useFormSubmission(props: UseFormSubmissionProps): UseFormSubmissionReturn {
  const { formState, promptConfig, effects } = props;
  const {
    selectedProjectId, prompts, imagesPerPrompt, promptMultiplier,
    associatedShotId, currentBeforePromptText, currentAfterPromptText,
    styleBoostTerms, isLocalGenerationEnabled, hiresFixConfig,
    effectivePromptMode, masterPromptText, actionablePromptsCount,
  } = formState;
  const {
    generationSourceRef, selectedTextModelRef, styleReferenceImageGeneration,
    styleReferenceStrength, subjectStrength, effectiveSubjectDescription,
    inThisScene, inThisSceneStrength, referenceMode,
  } = promptConfig;
  const { aiGeneratePrompts, onGenerate, setPrompts, automatedSubmitButton } = effects;

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

  const runIncomingTask = useIncomingTaskRunner();

  const submissionContext = buildSubmissionRuntimeContext({
    prompts,
    promptMultiplier,
    imagesPerPrompt,
    actionablePromptsCount,
    styleReferenceImageGeneration,
    generationSourceRef,
    selectedTextModelRef,
  }, formStateRef);

  const commands = useSubmissionOrchestrator({
    context: submissionContext,
    effects: {
      automatedSubmitButton,
      aiGeneratePrompts,
      onGenerate,
      setPrompts,
      getTaskParams,
      runIncomingTask,
    },
  });

  const handleSubmit = useSubmitHandler({
    effectivePromptMode,
    commands: {
      submitManaged: commands.submitManaged,
      submitAutomated: commands.submitAutomated,
    },
  });

  const {
    handleGenerateAndQueue,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
  } = usePromptQueueHandlers({
    commands: {
      generateAndSubmit: commands.generateAndSubmit,
      queueExisting: commands.queueExisting,
      queueLikeExisting: commands.queueLikeExisting,
    },
  });

  return {
    handleSubmit,
    handleGenerateAndQueue,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
  };
}
