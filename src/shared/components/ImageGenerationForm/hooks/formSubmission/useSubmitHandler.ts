import { useCallback } from 'react';
import type { FormEvent, MutableRefObject } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { buildBatchTaskParams } from '../buildBatchTaskParams';
import { buildReferenceParams } from './referenceParams';
import type { FormStateSnapshot, GetTaskParams, UseFormSubmissionProps } from './types';
import type { RunIncomingTask } from './useIncomingTaskRunner';
import { toPromptEntries, truncateLabel } from './utils';

interface UseSubmitHandlerInput {
  effectivePromptMode: UseFormSubmissionProps['effectivePromptMode'];
  prompts: UseFormSubmissionProps['prompts'];
  actionablePromptsCount: UseFormSubmissionProps['actionablePromptsCount'];
  styleReferenceImageGeneration: UseFormSubmissionProps['styleReferenceImageGeneration'];
  generationSourceRef: UseFormSubmissionProps['generationSourceRef'];
  selectedTextModelRef: UseFormSubmissionProps['selectedTextModelRef'];
  automatedSubmitButton: UseFormSubmissionProps['automatedSubmitButton'];
  aiGeneratePrompts: UseFormSubmissionProps['aiGeneratePrompts'];
  onGenerate: UseFormSubmissionProps['onGenerate'];
  setPrompts: UseFormSubmissionProps['setPrompts'];
  getTaskParams: GetTaskParams;
  formStateRef: MutableRefObject<FormStateSnapshot | undefined>;
  runIncomingTask: RunIncomingTask;
}

function hasStyleReferenceError(
  generationSource: UseFormSubmissionProps['generationSourceRef']['current'],
  styleReferenceImageGeneration: string | null
): boolean {
  return generationSource === 'by-reference' && !styleReferenceImageGeneration;
}

export function useSubmitHandler(input: UseSubmitHandlerInput): (event: FormEvent) => Promise<void> {
  const {
    effectivePromptMode,
    prompts,
    actionablePromptsCount,
    generationSourceRef,
    selectedTextModelRef,
    automatedSubmitButton,
    aiGeneratePrompts,
    onGenerate,
    setPrompts,
    getTaskParams,
    formStateRef,
    runIncomingTask,
  } = input;

  return useCallback(async (event: FormEvent) => {
    event.preventDefault();

    const state = formStateRef.current;
    if (!state) {
      return;
    }

    const currentGenerationSource = generationSourceRef.current;
    const currentTextModel = selectedTextModelRef.current;

    if (effectivePromptMode === 'automated') {
      if (!state.masterPromptText.trim()) {
        toast.error('Please enter a master prompt.');
        return;
      }

      if (hasStyleReferenceError(currentGenerationSource, state.styleReferenceImageGeneration)) {
        toast.error('Please upload a style reference image for by-reference mode.');
        return;
      }

      automatedSubmitButton.trigger();

      runIncomingTask({
        label: truncateLabel(state.masterPromptText),
        expectedCount: state.imagesPerPrompt * state.promptMultiplier,
        projectIdForCounts: state.selectedProjectId,
        context: 'useFormSubmission.handleSubmit.automatedMode',
        toastTitle: 'Failed to generate prompts. Please try again.',
        execute: async () => {
          const rawResults = await aiGeneratePrompts({
            overallPromptText: state.masterPromptText,
            numberToGenerate: state.imagesPerPrompt,
            includeExistingContext: false,
            addSummaryForNewPrompts: true,
            replaceCurrentPrompts: true,
            temperature: 0.8,
            rulesToRememberText: '',
          });

          const newPrompts = toPromptEntries(rawResults);
          setPrompts(newPrompts);

          const referenceParams = buildReferenceParams(currentGenerationSource, state);
          const modelName = currentGenerationSource === 'just-text' ? currentTextModel : 'qwen-image';

          const taskParams = buildBatchTaskParams({
            projectId: state.selectedProjectId!,
            prompts: newPrompts,
            imagesPerPrompt: state.promptMultiplier,
            shotId: state.associatedShotId,
            beforePromptText: state.beforePromptText,
            afterPromptText: state.afterPromptText,
            styleBoostTerms: state.styleBoostTerms,
            isLocalGenerationEnabled: state.isLocalGenerationEnabled,
            hiresFixConfig: state.hiresFixConfig,
            modelName,
            referenceParams,
          });

          await onGenerate(taskParams);
        },
      });

      return;
    }

    const taskParams = getTaskParams(prompts);
    if (!taskParams) {
      return;
    }

    automatedSubmitButton.trigger();

    const firstPrompt = prompts.find((prompt) => prompt.fullPrompt.trim())?.fullPrompt || 'Generating...';

    runIncomingTask({
      label: truncateLabel(firstPrompt),
      expectedCount: actionablePromptsCount * state.imagesPerPrompt,
      projectIdForCounts: state.selectedProjectId,
      context: 'useFormSubmission.handleSubmit.managedMode',
      toastTitle: 'Failed to create tasks. Please try again.',
      execute: async () => {
        await onGenerate(taskParams);
      },
    });
  }, [
    actionablePromptsCount,
    aiGeneratePrompts,
    automatedSubmitButton,
    effectivePromptMode,
    formStateRef,
    generationSourceRef,
    getTaskParams,
    onGenerate,
    prompts,
    runIncomingTask,
    selectedTextModelRef,
    setPrompts,
  ]);
}
